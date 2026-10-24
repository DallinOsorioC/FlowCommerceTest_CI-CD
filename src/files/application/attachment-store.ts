import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AttachmentSource } from '@flowcommerce/types';
import {
  ATTACHMENTS_REPOSITORY,
  type AttachmentsRepository,
  type StoredAttachment,
} from '../domain/attachment';
import { FILE_STORAGE, type FileStorage } from '../domain/file-storage';
import { ATTACHMENT_MIME_TYPES, baseMimeType } from '../domain/file-rules';

export interface StoreAttachmentInput {
  projectId: string;
  leadId: string | null;
  clientId: string | null;
  fileName: string;
  mimeType: string;
  content: Buffer;
  source: AttachmentSource;
  uploadedByUserId: string | null;
}

// Guarda el archivo y su fila. Lo usan la subida desde el CRM y los archivos
// que llegan por WhatsApp. Las validaciones de permisos y de tipo/tamaño las
// hace quien llama.
//
// Orden: primero el archivo, después la fila. Si la fila falla (p. ej. el lead
// se borró), se borra el archivo para no dejar basura en el disco.
@Injectable()
export class AttachmentStore {
  private readonly logger = new Logger(AttachmentStore.name);

  constructor(
    @Inject(FILE_STORAGE)
    private readonly storage: FileStorage,
    @Inject(ATTACHMENTS_REPOSITORY)
    private readonly repository: AttachmentsRepository,
  ) {}

  async store(input: StoreAttachmentInput): Promise<StoredAttachment> {
    const mimeType = baseMimeType(input.mimeType);
    const ext = ATTACHMENT_MIME_TYPES[mimeType] ?? '.bin';
    const storageKey = `projects/${input.projectId}/attachments/${randomUUID()}${ext}`;

    await this.storage.save(storageKey, input.content);
    try {
      return await this.repository.create({
        projectId: input.projectId,
        leadId: input.leadId,
        clientId: input.clientId,
        storageKey,
        fileName: input.fileName,
        mimeType,
        sizeBytes: input.content.length,
        source: input.source,
        uploadedByUserId: input.uploadedByUserId,
      });
    } catch (error) {
      await this.storage.remove(storageKey).catch((removeError: unknown) => {
        this.logger.warn(
          `Could not remove orphan file ${storageKey}: ${String(removeError)}`,
        );
      });
      throw error;
    }
  }

  // Deshace un store(): borra la fila y el archivo.
  async discard(attachment: StoredAttachment): Promise<void> {
    await this.repository.deleteInProject(attachment.id, attachment.projectId);
    await this.storage.remove(attachment.storageKey);
  }

  read(attachment: StoredAttachment): Promise<Buffer> {
    return this.storage.read(attachment.storageKey);
  }
}
