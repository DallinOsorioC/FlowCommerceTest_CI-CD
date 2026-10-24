import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq } from 'drizzle-orm';
import { ConflictException } from '../../../common/exceptions/domain.exceptions';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { leadViews, type LeadViewRow } from '../../../db/schema';
import type { LeadView, LeadViewsRepository } from '../../domain/lead-view';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class DrizzleLeadViewsRepository implements LeadViewsRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async list(projectId: string, userId: string): Promise<LeadView[]> {
    const rows = await this.db
      .select()
      .from(leadViews)
      .where(
        and(eq(leadViews.projectId, projectId), eq(leadViews.userId, userId)),
      )
      .orderBy(asc(leadViews.name));
    return rows.map((row) => this.map(row));
  }

  async count(projectId: string, userId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(leadViews)
      .where(
        and(eq(leadViews.projectId, projectId), eq(leadViews.userId, userId)),
      );
    return row?.total ?? 0;
  }

  async create(
    input: Parameters<LeadViewsRepository['create']>[0],
  ): Promise<LeadView> {
    try {
      const [row] = await this.db.insert(leadViews).values(input).returning();
      return this.map(row);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(
    id: string,
    projectId: string,
    userId: string,
    patch: Parameters<LeadViewsRepository['update']>[3],
  ): Promise<LeadView | null> {
    try {
      const [row] = await this.db
        .update(leadViews)
        .set(patch)
        .where(this.owned(id, projectId, userId))
        .returning();
      return row ? this.map(row) : null;
    } catch (error) {
      throw this.translate(error);
    }
  }

  async delete(
    id: string,
    projectId: string,
    userId: string,
  ): Promise<boolean> {
    const deleted = await this.db
      .delete(leadViews)
      .where(this.owned(id, projectId, userId))
      .returning({ id: leadViews.id });
    return deleted.length > 0;
  }

  private owned(id: string, projectId: string, userId: string) {
    return and(
      eq(leadViews.id, id),
      eq(leadViews.projectId, projectId),
      eq(leadViews.userId, userId),
    );
  }

  private translate(error: unknown): unknown {
    const code =
      (error as { code?: string } | null)?.code ??
      (error as { cause?: { code?: string } } | null)?.cause?.code;
    return code === UNIQUE_VIOLATION
      ? new ConflictException('You already have a view with this name')
      : error;
  }

  private map(row: LeadViewRow): LeadView {
    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      filters: row.filters,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
