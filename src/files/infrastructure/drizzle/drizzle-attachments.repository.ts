import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import type { AttachmentSource } from '@flowcommerce/types';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { attachments, type AttachmentRow } from '../../../db/schema';
import { isForeignKeyViolation } from '../../../common/utils/postgres-error';
import type {
  AttachmentsRepository,
  DeleteAttachmentResult,
  ListAttachmentsFilter,
  NewAttachment,
  StoredAttachment,
} from '../../domain/attachment';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

@Injectable()
export class DrizzleAttachmentsRepository implements AttachmentsRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  // Lead y cliente los ata al proyecto la FK compuesta: uno ajeno falla.
  async create(input: NewAttachment): Promise<StoredAttachment> {
    const [row] = await this.db.insert(attachments).values(input).returning();
    return this.map(row);
  }

  async findByIdInProject(
    id: string,
    projectId: string,
  ): Promise<StoredAttachment | null> {
    const row = await this.db.query.attachments.findFirst({
      where: and(eq(attachments.id, id), eq(attachments.projectId, projectId)),
    });
    return row ? this.map(row) : null;
  }

  async listByProject(
    projectId: string,
    filter: ListAttachmentsFilter,
  ): Promise<{ attachments: StoredAttachment[]; total: number }> {
    const conditions: SQL[] = [eq(attachments.projectId, projectId)];
    if (filter.leadId) conditions.push(eq(attachments.leadId, filter.leadId));
    if (filter.clientId) {
      conditions.push(eq(attachments.clientId, filter.clientId));
    }
    const where = and(...conditions);
    const limit = Math.min(
      Math.max(filter.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const page = Math.max(filter.page ?? 1, 1);

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(attachments)
        .where(where)
        .orderBy(desc(attachments.createdAt), desc(attachments.id))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ value: count() }).from(attachments).where(where),
    ]);
    return {
      attachments: rows.map((row) => this.map(row)),
      total: totalRow?.value ?? 0,
    };
  }

  // Un adjunto citado por un mensaje lo protege la FK NO ACTION de messages.
  async deleteInProject(
    id: string,
    projectId: string,
  ): Promise<DeleteAttachmentResult> {
    try {
      const deleted = await this.db
        .delete(attachments)
        .where(
          and(eq(attachments.id, id), eq(attachments.projectId, projectId)),
        )
        .returning({ id: attachments.id });
      return deleted.length > 0 ? 'DELETED' : 'NOT_FOUND';
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return 'IN_USE';
      }
      throw error;
    }
  }

  private map(row: AttachmentRow): StoredAttachment {
    return {
      id: row.id,
      projectId: row.projectId,
      leadId: row.leadId,
      clientId: row.clientId,
      storageKey: row.storageKey,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      source: row.source as AttachmentSource,
      uploadedByUserId: row.uploadedByUserId,
      creadoEn: row.createdAt,
    };
  }
}
