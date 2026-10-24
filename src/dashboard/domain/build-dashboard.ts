import { LeadStage, QuoteStatus } from '@flowcommerce/types';
import type {
  ConversionByPeriodEntry,
  DashboardAggregate,
  DashboardMetricsRows,
  DateRange,
  LeadsByStage,
  PeriodComparison,
  PeriodTotals,
  PeriodTotalsRow,
  QuotesByStatus,
  SalesByStatus,
} from './dashboard.types';

// Etapas que cuentan como "lead activo": todas menos WON y LOST.
export const ACTIVE_LEAD_STAGES: readonly LeadStage[] = [
  LeadStage.NEW,
  LeadStage.CONTACTED,
  LeadStage.QUALIFIED,
  LeadStage.PROPOSAL,
  LeadStage.NEGOTIATION,
];

const zeroLeadsByStage = (): LeadsByStage => ({
  NEW: 0,
  CONTACTED: 0,
  QUALIFIED: 0,
  PROPOSAL: 0,
  NEGOTIATION: 0,
  WON: 0,
  LOST: 0,
});

const zeroByQuoteStatus = (): QuotesByStatus & SalesByStatus => ({
  DRAFT: 0,
  PENDING_APPROVAL: 0,
  APPROVED: 0,
  SENT: 0,
  ACCEPTED: 0,
  PAID: 0,
  REJECTED: 0,
});

// conversion = ganados / creados, sin dividir nunca entre cero.
export const conversionRate = (creados: number, ganados: number): number =>
  creados > 0 ? ganados / creados : 0;

// Arma el contrato del Dashboard a partir de las agregaciones SQL. Es una
// función pura: no consulta nada, solo rellena con 0 los estados sin filas y
// deriva el summary de los conteos por estado (sin consultas extra).
export function buildDashboard(
  rows: DashboardMetricsRows,
  periodo: PeriodComparison | null = null,
): DashboardAggregate {
  const leadsPorEstado = zeroLeadsByStage();
  for (const row of rows.leadsByStage) {
    if (row.stage in leadsPorEstado) {
      leadsPorEstado[row.stage] = row.count;
    }
  }

  const quotesPorEstado = zeroByQuoteStatus();
  const salesPorEstado = zeroByQuoteStatus();
  for (const row of rows.quotesByStatus) {
    if (row.status in quotesPorEstado) {
      quotesPorEstado[row.status] = row.count;
      salesPorEstado[row.status] = row.total;
    }
  }

  const leadsActivos = ACTIVE_LEAD_STAGES.reduce(
    (acc, stage) => acc + leadsPorEstado[stage],
    0,
  );

  // Pipeline: valor estimado de los leads activos. Se suma en céntimos
  // enteros para no arrastrar error de coma flotante.
  const pipelineCents = rows.leadsByStage
    .filter((row) => ACTIVE_LEAD_STAGES.includes(row.stage))
    .reduce((acc, row) => acc + Math.round((row.estimatedValue ?? 0) * 100), 0);

  const salesPorPeriodo = [...rows.salesByMonth]
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((row) => ({ periodo: row.periodo, total: row.total }));

  const conversionPorPeriodo: ConversionByPeriodEntry[] = [...rows.leadsByMonth]
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((row) => ({
      periodo: row.periodo,
      creados: row.creados,
      ganados: row.ganados,
      conversion: conversionRate(row.creados, row.ganados),
    }));

  return {
    summary: {
      leadsActivos,
      cotizacionesEnRevision: quotesPorEstado[QuoteStatus.PENDING_APPROVAL],
      ganado: leadsPorEstado[LeadStage.WON],
      pipeline: pipelineCents / 100,
      seguimientosPendientes: rows.followUps?.pending ?? 0,
      seguimientosVencidos: rows.followUps?.overdue ?? 0,
    },
    leads: { porEstado: leadsPorEstado },
    quotes: { porEstado: quotesPorEstado },
    sales: { porEstado: salesPorEstado, porPeriodo: salesPorPeriodo },
    conversion: { porPeriodo: conversionPorPeriodo },
    periodo,
  };
}

// Período anterior de la MISMA duración, pegado al actual:
// anterior = [from − duración, from). Ej.: [1 oct, 8 oct) → [24 sep, 1 oct).
export function previousRange(range: DateRange): DateRange {
  const duration = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - duration), to: range.from };
}

// Variación porcentual redondeada a 2 decimales; null si no hay base.
export const percentChange = (
  actual: number,
  anterior: number,
): number | null =>
  anterior === 0
    ? null
    : Math.round(((actual - anterior) / anterior) * 10000) / 100;

const withConversion = (row: PeriodTotalsRow): PeriodTotals => ({
  ...row,
  conversion: conversionRate(row.leadsCreados, row.leadsGanados),
});

// Arma el bloque `periodo` (actual vs anterior). Función pura.
export function buildPeriodComparison(
  range: DateRange,
  actualRow: PeriodTotalsRow,
  anteriorRow: PeriodTotalsRow,
): PeriodComparison {
  const before = previousRange(range);
  const actual = withConversion(actualRow);
  const anterior = withConversion(anteriorRow);

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    actual,
    anterior: {
      from: before.from.toISOString(),
      to: before.to.toISOString(),
      ...anterior,
    },
    variacion: {
      ventas: percentChange(actual.ventas, anterior.ventas),
      cotizacionesEnviadas: percentChange(
        actual.cotizacionesEnviadas,
        anterior.cotizacionesEnviadas,
      ),
      leadsCreados: percentChange(actual.leadsCreados, anterior.leadsCreados),
    },
  };
}
