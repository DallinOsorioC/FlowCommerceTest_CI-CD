import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActivityType,
  LeadSource,
  LeadStage,
  MessageDirection,
  MessageType,
  NotificationEntity,
  NotificationType,
  Role,
} from '@flowcommerce/types';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import { AttachmentStore } from '../../../files/application/attachment-store';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_TYPES,
  baseMimeType,
  safeFileName,
} from '../../../files/domain/file-rules';
import type { LeadEntity } from '../../../leads/domain/entities/lead.entity';
import { NotificationPublisher } from '../../../notifications/application/notification-publisher';
import type { MessageEntity } from '../../domain/entities/message.entity';
import {
  WHATSAPP_GATEWAY,
  type WhatsAppGateway,
} from '../../domain/ports/whatsapp.gateway';
import {
  WHATSAPP_ACCOUNTS_REPOSITORY,
  type WhatsAppAccountsRepository,
} from '../../domain/ports/whatsapp-accounts.repository';
import { recordMessageActivity } from '../message-activity';
import { ForbiddenException } from '../../../common/exceptions/domain.exceptions';
import {
  LEADS_REPOSITORY,
  type CreateLeadInput,
  type LeadRepository,
} from '../../../leads/domain/repositories/lead.repository';
import {
  MESSAGES_REPOSITORY,
  type MessagesRepository,
} from '../../domain/ports/messages.repository';
import { normalizeWhatsAppPhone } from '../../infrastructure/whatsapp/normalize-phone';
import { verifyWhatsAppSignature } from '../../infrastructure/whatsapp/whatsapp-webhook.signature';

export interface HandleWhatsAppWebhookInput {
  rawBody: Buffer;
  signatureHeader?: string;
  payload: unknown;
}

interface WhatsAppMetadata {
  phone_number_id?: string;
}

interface WhatsAppIncomingMedia {
  id?: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
}

interface WhatsAppIncomingMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  image?: WhatsAppIncomingMedia;
  document?: WhatsAppIncomingMedia;
  audio?: WhatsAppIncomingMedia;
  video?: WhatsAppIncomingMedia;
  sticker?: WhatsAppIncomingMedia;
  // Respuesta rápida de una plantilla.
  button?: { text?: string };
  // Respuesta a un mensaje interactivo (botones o lista).
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
}

// Qué se guarda de cada tipo de mensaje entrante.
const MEDIA_TYPES: Record<
  string,
  { type: MessageType; label: string; field: keyof WhatsAppIncomingMessage }
> = {
  image: { type: MessageType.IMAGE, label: 'Imagen', field: 'image' },
  sticker: { type: MessageType.IMAGE, label: 'Sticker', field: 'sticker' },
  document: {
    type: MessageType.DOCUMENT,
    label: 'Documento',
    field: 'document',
  },
  audio: { type: MessageType.AUDIO, label: 'Audio', field: 'audio' },
  video: { type: MessageType.VIDEO, label: 'Video', field: 'video' },
};

interface WhatsAppStatusError {
  code?: number;
  title?: string;
  message?: string;
}

interface WhatsAppStatus {
  id?: string;
  status?: string;
  errors?: WhatsAppStatusError[];
}

interface WhatsAppContact {
  wa_id?: string;
  profile?: { name?: string };
}

interface WhatsAppChangeValue {
  metadata?: WhatsAppMetadata;
  contacts?: WhatsAppContact[];
  messages?: WhatsAppIncomingMessage[];
  statuses?: WhatsAppStatus[];
}

interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: WhatsAppChangeValue;
      field?: string;
    }>;
  }>;
}

const STATUS_MAP: Record<string, string> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

// Recepción de webhooks de Meta. No autentica por sesión: la prueba de
// identidad es la firma HMAC del App Secret y, después, el phone_number_id:
// de ahí sale el proyecto (ver resolveProjectId). Nunca de un parámetro que un
// tercero pueda forjar. Toda persistencia se acota a ese proyecto.
@Injectable()
export class HandleWhatsAppWebhookUseCase {
  private readonly logger = new Logger(HandleWhatsAppWebhookUseCase.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
    @Inject(MESSAGES_REPOSITORY)
    private readonly messagesRepository: MessagesRepository,
    private readonly notifications: NotificationPublisher,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsappGateway: WhatsAppGateway,
    private readonly attachmentStore: AttachmentStore,
    private readonly activity: ActivityRecorder,
    @Optional()
    @Inject(WHATSAPP_ACCOUNTS_REPOSITORY)
    private readonly accounts?: WhatsAppAccountsRepository,
  ) {}

  verifyChallenge(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): string {
    const expected = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');
    if (!expected || mode !== 'subscribe' || !token || token !== expected) {
      throw new ForbiddenException('WhatsApp webhook verification failed');
    }
    if (!challenge) {
      throw new ForbiddenException('WhatsApp webhook challenge is missing');
    }
    return challenge;
  }

  async execute(input: HandleWhatsAppWebhookInput): Promise<void> {
    const appSecret = this.configService.get<string>('WHATSAPP_APP_SECRET');
    if (!appSecret) {
      throw new ForbiddenException('WhatsApp webhook is not configured');
    }

    if (
      !verifyWhatsAppSignature(input.rawBody, input.signatureHeader, appSecret)
    ) {
      throw new ForbiddenException('Invalid WhatsApp webhook signature');
    }

    const payload = input.payload as WhatsAppWebhookPayload;
    if (payload.object !== 'whatsapp_business_account') {
      return;
    }

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) {
          continue;
        }

        // Fail-closed: si el número no pertenece a ningún proyecto conocido
        // (o el evento no trae phone_number_id) se descarta en vez de
        // persistirlo en algún tenant por defecto.
        const projectId = await this.resolveProjectId(
          value.metadata?.phone_number_id,
        );
        if (!projectId) {
          this.logger.warn(
            'Ignoring WhatsApp event with a missing or unknown phone_number_id',
          );
          continue;
        }

        await this.persistInboundMessages(
          projectId,
          value.messages ?? [],
          value.contacts ?? [],
        );
        await this.persistStatuses(projectId, value.statuses ?? []);
      }
    }
  }

  // A qué proyecto pertenece un número de WhatsApp:
  //   1. El número del entorno (WHATSAPP_PHONE_NUMBER_ID) es de
  //      WHATSAPP_PROJECT_ID. Va primero para que ningún proyecto pueda
  //      quedarse con él guardándolo en su cuenta.
  //   2. Si no, el proyecto que lo tiene guardado (token verificado contra
  //      Meta al guardarlo; un número solo puede estar en un proyecto).
  private async resolveProjectId(
    phoneNumberId: string | undefined,
  ): Promise<string | null> {
    if (!phoneNumberId) {
      return null;
    }
    const envPhoneNumberId = this.configService.get<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    if (envPhoneNumberId && phoneNumberId === envPhoneNumberId) {
      return this.configService.get<string>('WHATSAPP_PROJECT_ID') ?? null;
    }
    return (
      (await this.accounts?.findProjectIdByPhoneNumberId(phoneNumberId)) ?? null
    );
  }

  // Cada mensaje entrante se asocia a un lead del tenant por su número. Si el
  // número no existe se CREA el lead (origen WHATSAPP, etapa NEW): en un CRM
  // B2C quien escribe por WhatsApp es justamente un cliente potencial, y
  // descartarlo haría perder la conversación.
  private async persistInboundMessages(
    projectId: string,
    incoming: WhatsAppIncomingMessage[],
    contacts: WhatsAppContact[],
  ): Promise<void> {
    // Un mensaje que falla no frena a los demás del mismo envío; al final se
    // relanza el primer error para que Meta reintente (los pasos son
    // idempotentes, así que repetirlos es seguro).
    let firstError: unknown;
    for (const message of incoming) {
      try {
        await this.persistInboundMessage(projectId, message, contacts);
      } catch (error) {
        firstError ??= error;
        this.logger.error(
          `Could not process inbound WhatsApp message ${message.id ?? '?'}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (firstError) {
      throw firstError instanceof Error
        ? firstError
        : new Error('Inbound WhatsApp processing failed');
    }
  }

  private async persistInboundMessage(
    projectId: string,
    message: WhatsAppIncomingMessage,
    contacts: WhatsAppContact[],
  ): Promise<void> {
    {
      if (!message.id || !message.from) {
        return;
      }

      const digits = normalizeWhatsAppPhone(message.from);
      if (!digits) {
        return;
      }

      const { lead, created } =
        await this.leadRepository.findOrCreateByPhoneInProject(
          digits,
          projectId,
          this.newLeadFromContact(projectId, digits, contacts),
        );
      if (created) {
        this.logger.log(
          `Created lead ${lead.id} from inbound WhatsApp message ${message.id}`,
        );
        await this.activity.record({
          projectId,
          actorUserId: null,
          type: ActivityType.LEAD_CREATED,
          title: `Lead ${lead.name} creado desde WhatsApp`,
          leadId: lead.id,
          metadata: {
            stage: lead.stage,
            source: lead.source,
            origin: lead.origin,
          },
        });
      }

      const { content, type } = this.extractContent(message);
      const inserted = await this.messagesRepository.createIfNotExists({
        projectId,
        leadId: lead.id,
        whatsappMessageId: message.id,
        direction: MessageDirection.INBOUND,
        type,
        content,
        status: 'RECEIVED',
      });

      // Si ya existía es un reintento de Meta: el primer intento pudo caer a
      // mitad, así que se repiten los pasos que son idempotentes (último
      // contacto, adjunto, aviso). La actividad solo se registra al crear.
      const saved =
        inserted ??
        (await this.messagesRepository.findByWhatsappMessageIdInProject(
          message.id,
          projectId,
        ));

      if (saved) {
        await this.leadRepository.touchLastContactInProject(
          lead.id,
          projectId,
          saved.creadoEn,
        );
        await this.storeInboundMedia(projectId, lead, saved, message);
        if (inserted) {
          await recordMessageActivity(this.activity, lead, saved, null);
        }
        // Aviso al responsable del lead; si no tiene, a OWNER/ADMIN. La
        // dedupeKey evita repetirlo si Meta reenvía el mismo mensaje.
        await this.notifications.notify({
          projectId,
          type: NotificationType.MESSAGE_RECEIVED,
          title: `Nuevo mensaje de ${lead.name}`,
          body: content.slice(0, 200),
          entity: { type: NotificationEntity.LEAD, id: lead.id },
          recipients: lead.assignedUserId
            ? { userIds: [lead.assignedUserId] }
            : { roles: [Role.OWNER, Role.ADMIN] },
          dedupeKey: `message:${message.id}`,
        });
      }
    }
  }

  // Nombre que el cliente tiene en su perfil de WhatsApp; si no viene, su
  // número. El resto de campos quedan vacíos para que el equipo los complete.
  private newLeadFromContact(
    projectId: string,
    digits: string,
    contacts: WhatsAppContact[],
  ): CreateLeadInput {
    const contact =
      contacts.find((item) => item.wa_id === digits) ?? contacts[0];
    const profileName = contact?.profile?.name?.trim().slice(0, 255);

    return {
      projectId,
      name: profileName || `+${digits}`,
      email: null,
      phone: `+${digits}`,
      stage: LeadStage.NEW,
      score: 0,
      company: null,
      source: LeadSource.WHATSAPP,
      estimatedValue: null,
      notes: null,
      assignedUserId: null,
      clientId: null,
      interestProductId: null,
      lastContactAt: null,
    };
  }

  private async persistStatuses(
    projectId: string,
    statuses: WhatsAppStatus[],
  ): Promise<void> {
    for (const item of statuses) {
      if (!item.id || !item.status) {
        continue;
      }

      const mapped =
        STATUS_MAP[item.status.toLowerCase()] ?? item.status.toUpperCase();
      await this.messagesRepository.updateStatusInProject(
        item.id,
        projectId,
        mapped,
        this.describeError(item.errors),
      );
    }
  }

  // "131047: Re-engagement message" → se muestra en el chat junto al mensaje
  // fallido para que el usuario sepa por qué no llegó.
  private describeError(errors: WhatsAppStatusError[] | undefined) {
    const error = errors?.[0];
    if (!error) {
      return null;
    }
    const text = error.title ?? error.message ?? 'Unknown error';
    return (error.code ? `${error.code}: ${text}` : text).slice(0, 500);
  }

  private extractContent(message: WhatsAppIncomingMessage): {
    content: string;
    type: MessageType;
  } {
    if (message.type === 'text' && message.text?.body) {
      return { content: message.text.body, type: MessageType.TEXT };
    }
    if (message.type === 'button' && message.button?.text) {
      return { content: message.button.text, type: MessageType.TEXT };
    }
    const reply =
      message.interactive?.button_reply?.title ??
      message.interactive?.list_reply?.title;
    if (message.type === 'interactive' && reply) {
      return { content: reply, type: MessageType.TEXT };
    }
    const media = MEDIA_TYPES[message.type ?? ''];
    if (media) {
      const data = message[media.field] as WhatsAppIncomingMedia | undefined;
      const caption = data?.caption?.trim();
      return {
        content:
          caption ||
          (data?.filename
            ? `[${media.label}] ${data.filename}`
            : `[${media.label}]`),
        type: media.type,
      };
    }
    return {
      content: `[${message.type ?? 'unknown'}]`,
      type: MessageType.OTHER,
    };
  }

  // Descarga el archivo de un mensaje con imagen, documento, audio o video y
  // lo guarda como adjunto del lead. Es un efecto SECUNDARIO: si falla (red,
  // archivo demasiado grande), el mensaje ya quedó guardado y el webhook
  // responde 200 igual, para que Meta no lo reintente sin fin.
  private async storeInboundMedia(
    projectId: string,
    lead: LeadEntity,
    saved: MessageEntity,
    message: WhatsAppIncomingMessage,
  ): Promise<void> {
    const media = MEDIA_TYPES[message.type ?? ''];
    const data = media
      ? (message[media.field] as WhatsAppIncomingMedia | undefined)
      : undefined;
    if (!media || !data?.id || saved.attachmentId) {
      return;
    }
    try {
      const downloaded = await this.whatsappGateway.downloadMedia(
        projectId,
        data.id,
        ATTACHMENT_MAX_BYTES,
      );
      if (!downloaded) {
        this.logger.warn(
          `WhatsApp media ${data.id} is larger than the attachment limit; not stored`,
        );
        return;
      }
      const mimeType = baseMimeType(data.mime_type ?? downloaded.mimeType);
      const ext = ATTACHMENT_MIME_TYPES[mimeType] ?? '.bin';
      const attachment = await this.attachmentStore.store({
        projectId,
        leadId: lead.id,
        clientId: null,
        fileName: safeFileName(
          data.filename ?? `whatsapp-${media.label.toLowerCase()}${ext}`,
          ext,
        ),
        mimeType,
        content: downloaded.content,
        source: 'WHATSAPP',
        uploadedByUserId: null,
      });
      const linked =
        await this.messagesRepository.setAttachmentIfEmptyInProject(
          saved.id,
          projectId,
          attachment.id,
        );
      if (!linked) {
        // Otro reintento del webhook ya guardó el archivo de este mensaje.
        await this.attachmentStore.discard(attachment);
      }
    } catch (error) {
      this.logger.error(
        `Could not store WhatsApp media ${data.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
