import type {
  DashboardMetricsRows,
  DateRange,
  PeriodTotalsRow,
} from '../dashboard.types';

// Fuente de agregados del Dashboard, SIEMPRE acotada por projectId. Devuelve
// conteos y sumas ya agrupados por PostgreSQL (GROUP BY), nunca filas
// individuales de leads o quotes.
export interface DashboardRepository {
  // Sin range: histórico completo. Con range: ver dashboard.types.ts para
  // saber qué bloques se filtran.
  getMetricsRows(
    projectId: string,
    range?: DateRange,
  ): Promise<DashboardMetricsRows>;

  // Totales de un solo período (para la comparación actual vs anterior).
  getPeriodTotals(
    projectId: string,
    range: DateRange,
  ): Promise<PeriodTotalsRow>;
}

export const DASHBOARD_REPOSITORY = Symbol('DASHBOARD_REPOSITORY');
