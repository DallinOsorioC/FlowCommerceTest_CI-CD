import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNotNull, lt, lte, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { followUps, leads, notifications, quotes } from '../../../db/schema';
import type {
  DueFollowUp,
  ExpiredQuote,
  RemindersReader,
  StaleLead,
} from '../../domain/reminders.reader';

@Injectable()
export class DrizzleRemindersReader implements RemindersReader {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async findStaleLeads(staleBefore: Date, limit: number): Promise<StaleLead[]> {
    const lastActivity = sql<string>`coalesce(${leads.lastContactAt}, ${leads.createdAt})`;
    const rows = await this.db
      .select({
        id: leads.id,
        projectId: leads.projectId,
        name: leads.name,
        assignedUserId: leads.assignedUserId,
        lastActivityAt: lastActivity,
      })
      .from(leads)
      .where(
        and(
          notInArray(leads.stage, ['WON', 'LOST']),
          // La fecha va como texto: dentro de una expresión sql el driver no
          // sabe convertir un Date.
          sql`${lastActivity} < ${staleBefore.toISOString()}::timestamptz`,
          // Sin esto, los mismos 500 más viejos se re-seleccionan en cada
          // ejecución (el aviso ya existe) y los más nuevos nunca se alcanzan.
          // Un contacto nuevo vuelve a habilitar el aviso.
          sql`NOT EXISTS (
            SELECT 1 FROM ${notifications} n
            WHERE n.entity_type = 'LEAD'
              AND n.entity_id = ${leads.id}
              AND n.type = 'LEAD_STALE'
              AND n.creado_en >= ${lastActivity}
          )`,
        ),
      )
      .orderBy(asc(lastActivity))
      .limit(limit);
    return rows.map((row) => ({
      ...row,
      lastActivityAt: new Date(row.lastActivityAt),
    }));
  }

  // Usa el índice (project_id, status, due_at) por status = 'PENDING'.
  async findDueFollowUps(now: Date, limit: number): Promise<DueFollowUp[]> {
    const rows = await this.db
      .select({
        id: followUps.id,
        projectId: followUps.projectId,
        leadId: followUps.leadId,
        leadName: leads.name,
        title: followUps.title,
        dueAt: followUps.dueAt,
        assignedUserId: followUps.assignedUserId,
        createdByUserId: followUps.createdByUserId,
      })
      .from(followUps)
      .innerJoin(
        leads,
        and(
          eq(leads.id, followUps.leadId),
          eq(leads.projectId, followUps.projectId),
        ),
      )
      .where(and(eq(followUps.status, 'PENDING'), lte(followUps.dueAt, now)))
      .orderBy(asc(followUps.dueAt))
      .limit(limit);
    return rows;
  }

  async findExpiredSentQuotes(
    now: Date,
    limit: number,
  ): Promise<ExpiredQuote[]> {
    const rows = await this.db
      .select({
        id: quotes.id,
        projectId: quotes.projectId,
        folio: quotes.folio,
        validUntil: quotes.validUntil,
        createdByUserId: quotes.createdByUserId,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.status, 'SENT'),
          isNotNull(quotes.validUntil),
          lt(quotes.validUntil, now),
        ),
      )
      .orderBy(asc(quotes.validUntil))
      .limit(limit);
    return rows.map((row) => ({ ...row, validUntil: row.validUntil as Date }));
  }
}
