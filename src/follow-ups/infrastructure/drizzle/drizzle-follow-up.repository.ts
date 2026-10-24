import { Inject, Injectable } from '@nestjs/common';
import { alias } from 'drizzle-orm/pg-core';
import { and, asc, count, eq, gte, lt, lte, type SQL } from 'drizzle-orm';
import type { FollowUpStatus, FollowUpType } from '@flowcommerce/types';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { followUps, leads, users } from '../../../db/schema';
import { isOverdue, type FollowUp } from '../../domain/follow-up';
import type {
  CreateFollowUpInput,
  FollowUpRepository,
  ListFollowUpsFilter,
  UpdateFollowUpInput,
} from '../../domain/repositories/follow-up.repository';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const assignee = alias(users, 'assignee');

@Injectable()
export class DrizzleFollowUpRepository implements FollowUpRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async create(input: CreateFollowUpInput): Promise<FollowUp> {
    const [row] = await this.db
      .insert(followUps)
      .values(input)
      .returning({ id: followUps.id });
    return (await this.findByIdInProject(row.id, input.projectId)) as FollowUp;
  }

  async findByIdInProject(
    id: string,
    projectId: string,
  ): Promise<FollowUp | null> {
    const [row] = await this.baseSelect().where(
      and(eq(followUps.id, id), eq(followUps.projectId, projectId)),
    );
    return row ? this.toFollowUp(row) : null;
  }

  // Orden por fecha límite (lo más urgente primero). El índice
  // (project_id, status, due_at) cubre el caso típico "pendientes".
  async listByProject(
    projectId: string,
    filter: ListFollowUpsFilter,
  ): Promise<{ followUps: FollowUp[]; total: number }> {
    const now = new Date();
    const conditions: SQL[] = [eq(followUps.projectId, projectId)];
    if (filter.leadId) conditions.push(eq(followUps.leadId, filter.leadId));
    if (filter.status) conditions.push(eq(followUps.status, filter.status));
    if (filter.assignedUserId) {
      conditions.push(eq(followUps.assignedUserId, filter.assignedUserId));
    }
    if (filter.dueFrom) conditions.push(gte(followUps.dueAt, filter.dueFrom));
    if (filter.dueTo) conditions.push(lt(followUps.dueAt, filter.dueTo));
    if (filter.overdue) {
      conditions.push(eq(followUps.status, 'PENDING'));
      conditions.push(lte(followUps.dueAt, now));
    }
    const where = and(...conditions);
    const limit = Math.min(
      Math.max(filter.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const page = Math.max(filter.page ?? 1, 1);

    const [rows, [totalRow]] = await Promise.all([
      this.baseSelect()
        .where(where)
        .orderBy(asc(followUps.dueAt), asc(followUps.id))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ value: count() }).from(followUps).where(where),
    ]);

    return {
      followUps: rows.map((row) => this.toFollowUp(row, now)),
      total: totalRow?.value ?? 0,
    };
  }

  async updatePendingInProject(
    id: string,
    projectId: string,
    input: UpdateFollowUpInput,
  ): Promise<FollowUp | null> {
    const changes = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as UpdateFollowUpInput;
    const [row] = await this.db
      .update(followUps)
      .set({ ...changes, updatedAt: new Date() })
      .where(
        and(
          eq(followUps.id, id),
          eq(followUps.projectId, projectId),
          eq(followUps.status, 'PENDING'),
        ),
      )
      .returning({ id: followUps.id });
    return row ? this.findByIdInProject(row.id, projectId) : null;
  }

  async deleteInProject(id: string, projectId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(followUps)
      .where(and(eq(followUps.id, id), eq(followUps.projectId, projectId)))
      .returning({ id: followUps.id });
    return deleted.length > 0;
  }

  // Seguimiento + nombre del lead (mismo proyecto) + nombre del responsable.
  private baseSelect() {
    return this.db
      .select({
        row: followUps,
        leadName: leads.name,
        assigneeName: assignee.name,
      })
      .from(followUps)
      .innerJoin(
        leads,
        and(
          eq(leads.id, followUps.leadId),
          eq(leads.projectId, followUps.projectId),
        ),
      )
      .leftJoin(assignee, eq(assignee.id, followUps.assignedUserId))
      .$dynamic();
  }

  private toFollowUp(
    {
      row,
      leadName,
      assigneeName,
    }: {
      row: typeof followUps.$inferSelect;
      leadName: string;
      assigneeName: string | null;
    },
    now = new Date(),
  ): FollowUp {
    const status = row.status as FollowUpStatus;
    return {
      id: row.id,
      projectId: row.projectId,
      leadId: row.leadId,
      lead: { id: row.leadId, name: leadName },
      type: row.type as FollowUpType,
      title: row.title,
      notes: row.notes,
      dueAt: row.dueAt,
      status,
      overdue: isOverdue(status, row.dueAt, now),
      assignedUserId: row.assignedUserId,
      assignedUser:
        row.assignedUserId && assigneeName
          ? { id: row.assignedUserId, name: assigneeName }
          : null,
      createdByUserId: row.createdByUserId,
      completedAt: row.completedAt,
      outcome: row.outcome,
      creadoEn: row.createdAt,
      actualizadoEn: row.updatedAt,
    };
  }
}
