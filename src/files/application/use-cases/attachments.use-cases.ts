import { Inject, Injectable, Logger } from '@nestjs/common';
import { ActivityType, Permission } from '@flowcommerce/types';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  CLIENTS_REPOSITORY,
  type ClientRepository,
} from '../../../clients/domain/repositories/client.repository';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../../leads/domain/repositories/lead.repository';
import {
  ATTACHMENTS_REPOSITORY,
  type AttachmentsRepository,
  type StoredAttachment,
} from '../../domain/attachment';
import {
  FILE_STORAGE,
  StoredFileNotFoundError,
  type FileStorage,
} from '../../domain/file-storage';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_TYPES,
  baseMimeType,
  contentMatchesType,
  safeFileName,
} from '../../domain/file-rules';
import { AttachmentStore } from '../attachment-store';

interface ActorInProject {
  actorUserId: string;
  projectId: string;
}

// Lo que sube el navegador (multipart). No dependemos de los tipos de multer.
export interface UploadedFileInput {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// Permisos: los adjuntos de un lead se leen con LEAD_READ y se suben o borran
// con LEAD_UPDATE; los de un cliente, con CLIENT_READ / CLIENT_UPDATE.
// VIEWER puede verlos y descargarlos, pero no subir ni borrar.

@Injectable()
export class UploadAttachmentUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly store: AttachmentStore,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
    @Inject(CLIENTS_REPOSITORY)
    private readonly clientRepository: ClientRepository,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(
    input: ActorInProject & {
      leadId?: string;
      clientId?: string;
      file: UploadedFileInput | undefined;
    },
  ): Promise<StoredAttachment> {
    if (!input.leadId === !input.clientId) {
      throw new BadRequestException('Send exactly one of leadId or clientId');
    }
    await this.authorizationService.assertCan(
      input.actorUserId,
      input.leadId ? Permission.LEAD_UPDATE : Permission.CLIENT_UPDATE,
      input.projectId,
    );

    const file = input.file;
    if (!file || file.size === 0) {
      throw new BadRequestException(
        'Attach a non-empty file in the "file" field',
      );
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      throw new BadRequestException('The file exceeds the 10 MB limit');
    }
    const mimeType = baseMimeType(file.mimetype);
    const ext = ATTACHMENT_MIME_TYPES[mimeType];
    if (!ext) {
      throw new BadRequestException(
        `File type ${mimeType} is not allowed (images, PDF, Office, text, audio or video)`,
      );
    }
    if (!contentMatchesType(mimeType, file.buffer)) {
      throw new BadRequestException(
        `The file content does not match its type (${mimeType})`,
      );
    }

    // El lead o cliente debe ser del proyecto: uno ajeno responde 404.
    let leadName: string | null = null;
    let clientId = input.clientId ?? null;
    if (input.leadId) {
      const lead = await this.leadRepository.findByIdInProject(
        input.leadId,
        input.projectId,
      );
      if (!lead) {
        throw new NotFoundException('Lead not found in this project');
      }
      leadName = lead.name;
      clientId = null;
    } else {
      const client = await this.clientRepository.findByIdInProject(
        input.clientId!,
        input.projectId,
      );
      if (!client) {
        throw new NotFoundException('Client not found in this project');
      }
    }

    const attachment = await this.store.store({
      projectId: input.projectId,
      leadId: input.leadId ?? null,
      clientId,
      fileName: safeFileName(file.originalname, ext),
      mimeType,
      content: file.buffer,
      source: 'UPLOAD',
      uploadedByUserId: input.actorUserId,
    });

    await this.activity.record({
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      type: ActivityType.ATTACHMENT_ADDED,
      title: leadName
        ? `Archivo ${attachment.fileName} agregado a ${leadName}`
        : `Archivo ${attachment.fileName} agregado`,
      leadId: attachment.leadId,
      clientId: attachment.clientId,
      metadata: {
        attachmentId: attachment.id,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      },
    });
    return attachment;
  }
}

@Injectable()
export class ListAttachmentsUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(ATTACHMENTS_REPOSITORY)
    private readonly repository: AttachmentsRepository,
  ) {}

  async execute(
    input: ActorInProject & {
      leadId?: string;
      clientId?: string;
      page: number;
      limit: number;
    },
  ): Promise<{ attachments: StoredAttachment[]; total: number }> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      input.clientId && !input.leadId
        ? Permission.CLIENT_READ
        : Permission.LEAD_READ,
      input.projectId,
    );
    return this.repository.listByProject(input.projectId, {
      leadId: input.leadId,
      clientId: input.clientId,
      page: input.page,
      limit: input.limit,
    });
  }
}

@Injectable()
export class DownloadAttachmentUseCase {
  private readonly logger = new Logger(DownloadAttachmentUseCase.name);

  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(ATTACHMENTS_REPOSITORY)
    private readonly repository: AttachmentsRepository,
    @Inject(FILE_STORAGE)
    private readonly storage: FileStorage,
  ) {}

  async execute(
    input: ActorInProject & { attachmentId: string },
  ): Promise<{ attachment: StoredAttachment; content: Buffer }> {
    const attachment = await this.findReadable(input);
    try {
      return {
        attachment,
        content: await this.storage.read(attachment.storageKey),
      };
    } catch (error) {
      if (error instanceof StoredFileNotFoundError) {
        // La fila existe pero el archivo no (p. ej. se perdió el disco).
        this.logger.error(error.message);
        throw new NotFoundException('The file is no longer available');
      }
      throw error;
    }
  }

  private async findReadable(
    input: ActorInProject & { attachmentId: string },
  ): Promise<StoredAttachment> {
    const attachment = await this.repository.findByIdInProject(
      input.attachmentId,
      input.projectId,
    );
    if (!attachment) {
      throw new NotFoundException('Attachment not found in this project');
    }
    await this.authorizationService.assertCan(
      input.actorUserId,
      attachment.leadId ? Permission.LEAD_READ : Permission.CLIENT_READ,
      input.projectId,
    );
    return attachment;
  }
}

@Injectable()
export class DeleteAttachmentUseCase {
  private readonly logger = new Logger(DeleteAttachmentUseCase.name);

  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(ATTACHMENTS_REPOSITORY)
    private readonly repository: AttachmentsRepository,
    @Inject(FILE_STORAGE)
    private readonly storage: FileStorage,
  ) {}

  // Primero la fila, después el archivo: si el archivo no se puede borrar
  // queda huérfano en disco (se registra), pero nunca una fila sin archivo.
  async execute(
    input: ActorInProject & { attachmentId: string },
  ): Promise<void> {
    const attachment = await this.repository.findByIdInProject(
      input.attachmentId,
      input.projectId,
    );
    if (!attachment) {
      throw new NotFoundException('Attachment not found in this project');
    }
    await this.authorizationService.assertCan(
      input.actorUserId,
      attachment.leadId ? Permission.LEAD_UPDATE : Permission.CLIENT_UPDATE,
      input.projectId,
    );

    const result = await this.repository.deleteInProject(
      attachment.id,
      input.projectId,
    );
    if (result === 'NOT_FOUND') {
      throw new NotFoundException('Attachment not found in this project');
    }
    if (result === 'IN_USE') {
      throw new ConflictException(
        'The file belongs to a WhatsApp message and cannot be deleted',
      );
    }
    await this.storage.remove(attachment.storageKey).catch((error: unknown) => {
      this.logger.warn(
        `Could not remove file ${attachment.storageKey}: ${String(error)}`,
      );
    });
  }
}
