import type { Attachment, AttachmentSource } from '@flowcommerce/types';

export interface StoredAttachment extends Attachment {
  // Ruta interna en el almacenamiento. No sale nunca en la API.
  storageKey: string;
}

export interface NewAttachment {
  projectId: string;
  leadId: string | null;
  clientId: string | null;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  source: AttachmentSource;
  uploadedByUserId: string | null;
}

export interface ListAttachmentsFilter {
  leadId?: string;
  clientId?: string;
  page?: number;
  limit?: number;
}

export type DeleteAttachmentResult = 'DELETED' | 'NOT_FOUND' | 'IN_USE';

// Adjuntos con ámbito de tenant: projectId en la firma y en cada WHERE.
export interface AttachmentsRepository {
  create(input: NewAttachment): Promise<StoredAttachment>;
  findByIdInProject(
    id: string,
    projectId: string,
  ): Promise<StoredAttachment | null>;
  listByProject(
    projectId: string,
    filter: ListAttachmentsFilter,
  ): Promise<{ attachments: StoredAttachment[]; total: number }>;
  // IN_USE = lo cita un mensaje de WhatsApp (historial): no se borra.
  deleteInProject(
    id: string,
    projectId: string,
  ): Promise<DeleteAttachmentResult>;
}

export const ATTACHMENTS_REPOSITORY = Symbol('ATTACHMENTS_REPOSITORY');

export function toAttachment(stored: StoredAttachment): Attachment {
  return {
    id: stored.id,
    projectId: stored.projectId,
    leadId: stored.leadId,
    clientId: stored.clientId,
    fileName: stored.fileName,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    source: stored.source,
    uploadedByUserId: stored.uploadedByUserId,
    creadoEn: stored.creadoEn,
  };
}
