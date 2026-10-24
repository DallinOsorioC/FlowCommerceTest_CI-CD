import type { LeadStage, QuoteStatus } from '@flowcommerce/types';

// Definiciones oficiales del Dashboard (cerradas con negocio). Cada métrica se
// deriva SOLO de columnas que existen hoy en leads y quotes; no hay entidad
// Sales ni tabla de métricas:
//
// - summary.leadsActivos:           leads en NEW + CONTACTED + QUALIFIED + PROPOSAL
//                                   + NEGOTIATION
//                                   (todo lo que no es WON ni LOST).
// - summary.cotizacionesEnRevision: quotes con status = PENDING_APPROVAL.
// - summary.ganado:                 COUNT(leads con stage = WON). Es un conteo,
//                                   NO un monto: el dinero vive solo en `sales`.
// - summary.pipeline:             SUM(leads.estimatedValue) de los leads activos
//                                   (todo menos WON y LOST). Es dinero estimado
//                                   ANTES de IVA; los leads sin valor suman 0.
// - leads.porEstado:                conteo por stage, siempre con las 7 claves.
// - quotes.porEstado:               conteo por status, siempre con las 7 claves.
// - sales.porEstado:                SUM(quotes.total) por status (7 claves).
// - sales.porPeriodo:               SUM(quotes.total) de las cotizaciones PAID
//                                   por mes (YYYY-MM, UTC) de quotes.paidAt.
//                                   Venta = cotización pagada; cuadra con las
//                                   ventas de GET /clients/:id/stats.
// - conversion.porPeriodo:          por mes de creación del lead (YYYY-MM, UTC):
//                                   creados, ganados (stage WON) y
//                                   conversion = ganados / creados (0 si creados = 0).
//
//
// Filtro por período (opcional, ?from=&to=, intervalo [from, to) ):
// - Se FILTRAN: quotes.porEstado y sales.porEstado (por fecha de creación de la
//   cotización), sales.porPeriodo (por paidAt) y conversion.porPeriodo (por
//   fecha de creación del lead).
// - NO se filtran (son una foto del momento actual): summary y leads.porEstado.
//   Un "lead activo" o el pipeline no tienen fecha: existen hoy o no.
// - periodo: totales del rango pedido y del período anterior de la misma
//   duración, para que el frontend muestre la variación (+12 %, -3 %…).
//   Es null cuando no se envía rango.
//
// - summary.seguimientosPendientes: seguimientos (follow_ups) en PENDING.
// - summary.seguimientosVencidos:   de esos, los que ya pasaron su fecha.
//   Ambos son foto del momento (no se filtran por período).

export type LeadsByStage = Record<LeadStage, number>;
export type QuotesByStatus = Record<QuoteStatus, number>;
export type SalesByStatus = Record<QuoteStatus, number>;

export interface DashboardSummary {
  leadsActivos: number;
  cotizacionesEnRevision: number;
  ganado: number;
  pipeline: number;
  seguimientosPendientes: number;
  seguimientosVencidos: number;
}

export interface SalesByPeriodEntry {
  periodo: string;
  total: number;
}

export interface ConversionByPeriodEntry {
  periodo: string;
  creados: number;
  ganados: number;
  conversion: number;
}

// Intervalo semiabierto [from, to): incluye from y excluye to.
export interface DateRange {
  from: Date;
  to: Date;
}

// Totales de un período (actual o anterior).
export interface PeriodTotals {
  // SUM(quotes.total) de las PAID con paidAt dentro del período.
  ventas: number;
  // Cantidad de cotizaciones PAID con paidAt dentro del período.
  cotizacionesPagadas: number;
  // Cotizaciones con sentAt dentro del período.
  cotizacionesEnviadas: number;
  // Leads creados dentro del período.
  leadsCreados: number;
  // De esos leads creados, cuántos están hoy en WON.
  leadsGanados: number;
  // leadsGanados / leadsCreados (0 si no hay leads).
  conversion: number;
}

export interface PeriodComparison {
  from: string;
  to: string;
  actual: PeriodTotals;
  anterior: { from: string; to: string } & PeriodTotals;
  // Variación porcentual actual vs anterior. null cuando el anterior es 0
  // (no se puede dividir entre cero: el frontend muestra "nuevo" o "—").
  variacion: {
    ventas: number | null;
    cotizacionesEnviadas: number | null;
    leadsCreados: number | null;
  };
}

export interface DashboardAggregate {
  summary: DashboardSummary;
  leads: { porEstado: LeadsByStage };
  quotes: { porEstado: QuotesByStatus };
  sales: {
    porEstado: SalesByStatus;
    porPeriodo: SalesByPeriodEntry[];
  };
  conversion: {
    porPeriodo: ConversionByPeriodEntry[];
  };
  periodo: PeriodComparison | null;
}

// Filas ya agregadas por PostgreSQL (GROUP BY), acotadas a un solo projectId.
// El repositorio no devuelve filas individuales de leads ni quotes.
export interface LeadStageCountRow {
  stage: LeadStage;
  count: number;
  // SUM(estimated_value) de la etapa. Ausente equivale a 0.
  estimatedValue?: number;
}

export interface QuoteStatusAggregateRow {
  status: QuoteStatus;
  count: number;
  total: number;
}

export interface SalesByMonthRow {
  periodo: string;
  total: number;
}

export interface LeadsByMonthRow {
  periodo: string;
  creados: number;
  ganados: number;
}

export interface FollowUpCountsRow {
  pending: number;
  overdue: number;
}

export interface DashboardMetricsRows {
  // Ausente equivale a 0 y 0.
  followUps?: FollowUpCountsRow;
  leadsByStage: LeadStageCountRow[];
  quotesByStatus: QuoteStatusAggregateRow[];
  salesByMonth: SalesByMonthRow[];
  leadsByMonth: LeadsByMonthRow[];
}

// Fila cruda de totales de un período, tal como la agrega PostgreSQL.
export type PeriodTotalsRow = Omit<PeriodTotals, 'conversion'>;
