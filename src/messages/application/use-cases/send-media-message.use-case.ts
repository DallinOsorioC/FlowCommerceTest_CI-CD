import { Inject, Injectable } from '@nestjs/common';
import { MessageDirection, MessageType, Permission } from '@flowcommerce/types';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { AttachmentStore } from '../../../files/application/attachment-store';
import {
  ATTACHMENTS_REPOSITORY,
  type AttachmentsRepository,
} from '../../../files/domain/attachment';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../../leads/domain/repositories/lead.repository';
import type { MessageEntity } from '../../domain/entities/message.entity';
import {
  MESSAGES_REPOSITORY,
  type MessagesRepository,
} from '../../domain/ports/messages.repository';
import {
  WHATSAPP_GATEWAY,
  type WhatsAppGateway,
  type WhatsAppMediaKind,
} from '../../domain/ports/whatsapp.gateway';
import { recordMessageActivity } from '../message-activity';

export interface SendMediaMessageInput {
  actorUserId: string;
  projectId: string;
  leadId: string;
  // Archivo ya subido a /attachments (del lead o de su cliente).
  attachmentId: string;
  caption?: string | null;
}

// Límites de WhatsApp por tipo. Una imagen de más de 5 MB se manda como
// documento (WhatsApp la rechazaría como imagen).
const WHATSAPP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const WHATSAPP_IMAGE_TYPES = ['image/jpeg', 'image/png'];
const WHATSAPP_AUDIO_TYPES = [
  'audio/aac',
  'audio/amr',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
];
const WHATSAPP_VIDEO_TYPES = ['video/mp4', 'video/3gpp'];

export function mediaKindFor(
  mimeType: string,
  sizeBytes: number,
): WhatsAppMediaKind {
  if (WHATSAPP_IMAGE_TYPES.includes(mimeType)) {
    return sizeBytes <= WHATSAPP_IMAGE_MAX_BYTES ? 'image' : 'document';
  }
  if (WHATSAPP_AUDIO_TYPES.includes(mimeType)) return 'audio';
  if (WHATSAPP_VIDEO_TYPES.includes(mimeType)) return 'video';
  return 'document';
}

const MESSAGE_TYPE_BY_KIND: Record<WhatsAppMediaKind, MessageType> = {
  image: MessageType.IMAGE,
  document: MessageType.DOCUMENT,
  audio: MessageType.AUDIO,
  video: MessageType.VIDEO,
};

const LABEL_BY_KIND: Record<WhatsAppMediaKind, string> = {
  image: 'Imagen',
  document: 'Documento',
  audio: 'Audio',
  video: 'Video',
};

// Envía por WhatsApp un archivo del lead (o de su cliente): una foto, el PDF
// de la propuesta, un audio… Mismo orden que el texto: primero WhatsApp,
// después la base.
@Injectable()
export class SendMediaMessageUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
    @Inject(ATTACHMENTS_REPOSITORY)
    private readonly attachmentsRepository: AttachmentsRepository,
    private readonly attachmentStore: AttachmentStore,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsappGateway: WhatsAppGateway,
    @Inject(MESSAGES_REPOSITORY)
    private readonly messagesRepository: MessagesRepository,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(input: SendMediaMessageInput): Promise<MessageEntity> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.WHATSAPP_SEND_MESSAGE,
      input.projectId,
    );

    const lead = await this.leadRepository.findByIdInProject(
      input.leadId,
      input.projectId,
    );
    if (!lead) {
      throw new NotFoundException('Lead not found in this project');
    }
    if (!lead.phone) {
      throw new ConflictException(
        'Lead has no phone number, WhatsApp message not sent',
      );
    }

    // Solo archivos de ESTE lead o de su cliente: no se puede mandar por
    // error el archivo de otro lead del proyecto.
    const attachment = await this.attachmentsRepository.findByIdInProject(
      input.attachmentId,
      input.projectId,
    );
    const belongsToLead =
      attachment &&
      (attachment.leadId === lead.id ||
        (lead.clientId !== null && attachment.clientId === lead.clientId));
    if (!attachment || !belongsToLead) {
      throw new NotFoundException('Attachment not found for this lead');
    }

    const kind = mediaKindFor(attachment.mimeType, attachment.sizeBytes);
    const content = await this.attachmentStore.read(attachment);
    const caption = input.caption?.trim() || null;

    const sent = await this.whatsappGateway.sendMedia({
      projectId: input.projectId,
      leadId: lead.id,
      phone: lead.phone,
      kind,
      content,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
      caption,
    });

    const message = await this.messagesRepository.create({
      projectId: input.projectId,
      leadId: lead.id,
      whatsappMessageId: sent.whatsappMessageId,
      direction: MessageDirection.OUTBOUND,
      type: MESSAGE_TYPE_BY_KIND[kind],
      attachmentId: attachment.id,
      content:
        caption && kind !== 'audio'
          ? caption
          : `[${LABEL_BY_KIND[kind]}] ${attachment.fileName}`,
      status: sent.status,
    });
    await this.leadRepository.touchLastContactInProject(
      lead.id,
      input.projectId,
      message.creadoEn,
    );
    await recordMessageActivity(
      this.activity,
      lead,
      message,
      input.actorUserId,
    );
    return message;
  }
}
