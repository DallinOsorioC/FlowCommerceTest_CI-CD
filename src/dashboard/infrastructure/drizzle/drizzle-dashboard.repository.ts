import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  eq,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { followUps, leads, quotes } from '../../../db/schema';
import type {
  DashboardMetricsRows,
  DateRange,
  FollowUpCountsRow,
  LeadStageCountRow,
  LeadsByMonthRow,
  PeriodTotalsRow,
  QuoteStatusAggregateRow,
  SalesByMonthRow,
} from '../../domain/dashboard.types';
import type { DashboardRepository } from '../../domain/repositories/dashboard.repository';

// Mes calendario (YYYY-MM) en UTC. Se fija la zona para que el período no
// dependa del TimeZone de la sesión de Postgres.
const monthOf = (column: AnyColumn | SQL) =>
  sql<string>`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM')`;

// `columna >= from AND columna < to` (intervalo semiabierto). Sin rango no
// agrega condición (undefined se ignora dentro de and()). Las fechas viajan
// como texto ISO con cast explícito a timestamptz, igual para columnas que
// para expresiones como coalesce(...).
const inRange = (column: AnyColumn | SQL, range?: DateRange) =>
  range
    ? sql`(${column} >= ${range.from.toISOString()}::timestamptz and ${column} < ${range.to.toISOString()}::timestamptz)`
    : undefined;

// Agregaciones del Dashboard sobre las tablas existentes leads y quotes.
//
// - Multi-tenancy: CADA consulta lleva `WHERE project_id = :projectId`. Ningún
//   COUNT/SUM se ejecuta sin ese filtro, así que los GROUP BY solo ven filas
//   del tenant autorizado.
// - Performance: 4 consultas (+3 por período al comparar) con GROUP BY en paralelo (por stage, por status,
//   por mes de quotes y por mes de leads). Nada se trae a memoria fila a fila;
//   el summary se deriva de los conteos por estado sin consultas extra.
// - Dinero: quotes.total es numeric(14,2). La suma la hace PostgreSQL (exacta)
//   y el driver la devuelve como string; se convierte a number solo para el
//   JSON, sin aritmética en coma flotante.
@Injectable()
export class DrizzleDashboardRepository implements DashboardRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async getMetricsRows(
    projectId: string,
    range?: DateRange,
  ): Promise<DashboardMetricsRows> {
    const [
      leadsByStage,
      quotesByStatus,
      salesByMonth,
      leadsByMonth,
      followUpCounts,
    ] = await Promise.all([
      // Foto del momento: nunca se filtra por fecha.
      this.getLeadsByStage(projectId),
      this.getQuotesByStatus(projectId, range),
      this.getSalesByMonth(projectId, range),
      this.getLeadsByMonth(projectId, range),
      this.getFollowUpCounts(projectId),
    ]);

    return {
      leadsByStage,
      quotesByStatus,
      salesByMonth,
      leadsByMonth,
      followUps: followUpCounts,
    };
  }

  // Totales de un período en 3 consultas (una por tabla/fecha), en paralelo:
  // ventas por paid_at, enviadas por sent_at y leads por creado_en.
  async getPeriodTotals(
    projectId: string,
    range: DateRange,
  ): Promise<PeriodTotalsRow> {
    const [paid, sent, created] = await Promise.all([
      this.db
        .select({
          ventas: sql<string>`coalesce(sum(${quotes.total}), 0)`,
          cotizacionesPagadas: count(),
        })
        .from(quotes)
        .where(
          and(
            eq(quotes.projectId, projectId),
            eq(quotes.status, 'PAID'),
            inRange(quotes.paidAt, range),
          ),
        ),
      this.db
        .select({ cotizacionesEnviadas: count() })
        .from(quotes)
        .where(
          and(eq(quotes.projectId, projectId), inRange(quotes.sentAt, range)),
        ),
      this.db
        .select({
          leadsCreados: count(),
          leadsGanados:
            sql<number>`count(*) filter (where ${leads.stage} = 'WON')`.mapWith(
              Number,
            ),
        })
        .from(leads)
        .where(
          and(eq(leads.projectId, projectId), inRange(leads.createdAt, range)),
        ),
    ]);

    return {
      ventas: Number(paid[0]?.ventas ?? 0),
      cotizacionesPagadas: paid[0]?.cotizacionesPagadas ?? 0,
      cotizacionesEnviadas: sent[0]?.cotizacionesEnviadas ?? 0,
      leadsCreados: created[0]?.leadsCreados ?? 0,
      leadsGanados: created[0]?.leadsGanados ?? 0,
    };
  }

  // SELECT count(*), count(*) FILTER (WHERE due_at < now()) FROM follow_ups
  // WHERE project_id = $1 AND status = 'PENDING'
  private async getFollowUpCounts(
    projectId: string,
  ): Promise<FollowUpCountsRow> {
    const [row] = await this.db
      .select({
        pending: count(),
        overdue:
          sql<number>`count(*) filter (where ${followUps.dueAt} < now())`.mapWith(
            Number,
          ),
      })
      .from(followUps)
      .where(
        and(
          eq(followUps.projectId, projectId),
          eq(followUps.status, 'PENDING'),
        ),
      );
    return { pending: row?.pending ?? 0, overdue: row?.overdue ?? 0 };
  }

  // SELECT stage, COUNT(*), COALESCE(SUM(estimated_value), 0) FROM leads
  // WHERE project_id = $1 GROUP BY stage
  private async getLeadsByStage(
    projectId: string,
  ): Promise<LeadStageCountRow[]> {
    const rows = await this.db
      .select({
        stage: leads.stage,
        count: count(),
        estimatedValue: sql<string>`coalesce(sum(${leads.estimatedValue}), 0)`,
      })
      .from(leads)
      .where(eq(leads.projectId, projectId))
      .groupBy(leads.stage);

    return rows.map((row) => ({
      stage: row.stage,
      count: row.count,
      estimatedValue: Number(row.estimatedValue),
    }));
  }

  // SELECT status, COUNT(*), COALESCE(SUM(total), 0) FROM quotes
  // WHERE project_id = $1 GROUP BY status
  private async getQuotesByStatus(
    projectId: string,
    range?: DateRange,
  ): Promise<QuoteStatusAggregateRow[]> {
    const rows = await this.db
      .select({
        status: quotes.status,
        count: count(),
        total: sql<string>`coalesce(sum(${quotes.total}), 0)`,
      })
      .from(quotes)
      .where(
        and(eq(quotes.projectId, projectId), inRange(quotes.createdAt, range)),
      )
      .groupBy(quotes.status);

    return rows.map((row) => ({
      status: row.status,
      count: row.count,
      total: Number(row.total),
    }));
  }

  // SELECT to_char(creado_en AT TIME ZONE 'UTC', 'YYYY-MM') AS periodo,
  //        COALESCE(SUM(total), 0)
  // FROM quotes WHERE project_id = $1 AND status = 'PAID' [AND rango]
  // GROUP BY periodo ORDER BY periodo
  private async getSalesByMonth(
    projectId: string,
    range?: DateRange,
  ): Promise<SalesByMonthRow[]> {
    // Venta = cotización PAID, en el mes en que se pagó (paid_at). El coalesce
    // cubre solo cotizaciones PAID antiguas sin paid_at: nunca se pierde dinero.
    const paidOn = sql`coalesce(${quotes.paidAt}, ${quotes.createdAt})`;
    const periodo = monthOf(paidOn);

    const rows = await this.db
      .select({
        periodo,
        total: sql<string>`coalesce(sum(${quotes.total}), 0)`,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.projectId, projectId),
          eq(quotes.status, 'PAID'),
          inRange(paidOn, range),
        ),
      )
      .groupBy(periodo)
      .orderBy(asc(periodo));

    return rows.map((row) => ({
      periodo: row.periodo,
      total: Number(row.total),
    }));
  }

  // SELECT to_char(creado_en AT TIME ZONE 'UTC', 'YYYY-MM') AS periodo,
  //        COUNT(*) AS creados,
  //        COUNT(*) FILTER (WHERE stage = 'WON') AS ganados
  // FROM leads WHERE project_id = $1 GROUP BY periodo ORDER BY periodo
  private async getLeadsByMonth(
    projectId: string,
    range?: DateRange,
  ): Promise<LeadsByMonthRow[]> {
    const periodo = monthOf(leads.createdAt);

    const rows = await this.db
      .select({
        periodo,
        creados: count(),
        ganados:
          sql<number>`count(*) filter (where ${leads.stage} = 'WON')`.mapWith(
            Number,
          ),
      })
      .from(leads)
      .where(
        and(eq(leads.projectId, projectId), inRange(leads.createdAt, range)),
      )
      .groupBy(periodo)
      .orderBy(asc(periodo));

    return rows;
  }
}
