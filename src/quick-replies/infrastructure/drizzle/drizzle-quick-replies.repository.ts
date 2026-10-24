import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { ConflictException } from '../../../common/exceptions/domain.exceptions';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { quickReplies, type QuickReplyRow } from '../../../db/schema';
import type {
  QuickRepliesRepository,
  QuickReply,
} from '../../domain/quick-reply';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class DrizzleQuickRepliesRepository implements QuickRepliesRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async listByProject(projectId: string): Promise<QuickReply[]> {
    const rows = await this.db
      .select()
      .from(quickReplies)
      .where(eq(quickReplies.projectId, projectId))
      .orderBy(asc(quickReplies.shortcut));
    return rows.map((row) => this.map(row));
  }

  async create(
    input: Parameters<QuickRepliesRepository['create']>[0],
  ): Promise<QuickReply> {
    try {
      const [row] = await this.db
        .insert(quickReplies)
        .values(input)
        .returning();
      return this.map(row);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(
    id: string,
    projectId: string,
    patch: Parameters<QuickRepliesRepository['update']>[2],
  ): Promise<QuickReply | null> {
    try {
      const [row] = await this.db
        .update(quickReplies)
        .set(patch)
        .where(
          and(eq(quickReplies.id, id), eq(quickReplies.projectId, projectId)),
        )
        .returning();
      return row ? this.map(row) : null;
    } catch (error) {
      throw this.translate(error);
    }
  }

  async deleteInProject(id: string, projectId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(quickReplies)
      .where(
        and(eq(quickReplies.id, id), eq(quickReplies.projectId, projectId)),
      )
      .returning({ id: quickReplies.id });
    return deleted.length > 0;
  }

  private translate(error: unknown): unknown {
    const code =
      (error as { code?: string } | null)?.code ??
      (error as { cause?: { code?: string } } | null)?.cause?.code;
    return code === UNIQUE_VIOLATION
      ? new ConflictException('A quick reply with this shortcut already exists')
      : error;
  }

  private map(row: QuickReplyRow): QuickReply {
    return {
      id: row.id,
      projectId: row.projectId,
      shortcut: row.shortcut,
      title: row.title,
      content: row.content,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
