import { LeadStage, QuoteStatus } from '@flowcommerce/types';
import {
  ACTIVE_LEAD_STAGES,
  buildDashboard,
  buildPeriodComparison,
  conversionRate,
  percentChange,
  previousRange,
} from './build-dashboard';
import type { DashboardMetricsRows } from './dashboard.types';

describe('buildDashboard', () => {
  const emptyRows: DashboardMetricsRows = {
    leadsByStage: [],
    quotesByStatus: [],
    salesByMonth: [],
    leadsByMonth: [],
  };

  // Escenario completo: 17 leads y 12 cotizaciones repartidos en 3 meses.
  const rows: DashboardMetricsRows = {
    leadsByStage: [
      { stage: LeadStage.NEW, count: 5 },
      { stage: LeadStage.CONTACTED, count: 3 },
      { stage: LeadStage.QUALIFIED, count: 2 },
      { stage: LeadStage.PROPOSAL, count: 1 },
      { stage: LeadStage.WON, count: 4 },
      { stage: LeadStage.LOST, count: 2 },
    ],
    quotesByStatus: [
      { status: QuoteStatus.DRAFT, count: 6, total: 0 },
      { status: QuoteStatus.PENDING_APPROVAL, count: 3, total: 1500 },
      { status: QuoteStatus.APPROVED, count: 2, total: 2400 },
      { status: QuoteStatus.PAID, count: 1, total: 1200.5 },
    ],
    // Desordenado a propósito: el builder garantiza orden ascendente.
    salesByMonth: [
      { periodo: '2026-10', total: 800 },
      { periodo: '2026-08', total: 1200 },
      { periodo: '2026-09', total: 2400 },
    ],
    leadsByMonth: [
      { periodo: '2026-09', creados: 10, ganados: 2 },
      { periodo: '2026-08', creados: 4, ganados: 1 },
      { periodo: '2026-10', creados: 3, ganados: 1 },
    ],
  };

  describe('summary', () => {
    it('returns the full summary with exactly the three official metrics', () => {
      expect(buildDashboard(rows).summary).toEqual({
        leadsActivos: 11,
        cotizacionesEnRevision: 3,
        ganado: 4,
        pipeline: 0,
        seguimientosPendientes: 0,
        seguimientosVencidos: 0,
      });
    });

    it('reports pending and overdue follow-ups (0 when there are none)', () => {
      expect(buildDashboard(rows).summary).toMatchObject({
        seguimientosPendientes: 0,
        seguimientosVencidos: 0,
      });
      expect(
        buildDashboard({ ...rows, followUps: { pending: 5, overdue: 2 } })
          .summary,
      ).toMatchObject({ seguimientosPendientes: 5, seguimientosVencidos: 2 });
    });

    it('counts active leads as every stage except WON and LOST', () => {
      expect(ACTIVE_LEAD_STAGES).toEqual([
        LeadStage.NEW,
        LeadStage.CONTACTED,
        LeadStage.QUALIFIED,
        LeadStage.PROPOSAL,
        LeadStage.NEGOTIATION,
      ]);
      // 5 + 3 + 2 + 1: WON (4) y LOST (2) quedan fuera.
      expect(buildDashboard(rows).summary.leadsActivos).toBe(11);
    });

    it('sums the estimated value of active leads only (pipeline)', () => {
      const result = buildDashboard({
        ...emptyRows,
        leadsByStage: [
          { stage: LeadStage.NEW, count: 2, estimatedValue: 100.1 },
          { stage: LeadStage.PROPOSAL, count: 1, estimatedValue: 200.2 },
          { stage: LeadStage.NEGOTIATION, count: 1, estimatedValue: 0.3 },
          // WON y LOST no cuentan, tengan el valor que tengan.
          { stage: LeadStage.WON, count: 5, estimatedValue: 99999 },
          { stage: LeadStage.LOST, count: 5, estimatedValue: 88888 },
        ],
      });

      // 100.1 + 200.2 + 0.3 = 300.6 sin error de coma flotante.
      expect(result.summary.pipeline).toBe(300.6);
    });

    it('treats a missing estimated value as 0 in the pipeline', () => {
      const result = buildDashboard({
        ...emptyRows,
        leadsByStage: [{ stage: LeadStage.NEW, count: 3 }],
      });
      expect(result.summary.pipeline).toBe(0);
    });

    it('counts NEGOTIATION as an active stage', () => {
      const result = buildDashboard({
        ...emptyRows,
        leadsByStage: [
          { stage: LeadStage.NEGOTIATION, count: 3 },
          { stage: LeadStage.WON, count: 2 },
        ],
      });
      expect(result.summary.leadsActivos).toBe(3);
      expect(result.leads.porEstado.NEGOTIATION).toBe(3);
    });

    it('excludes WON and LOST leads from leadsActivos', () => {
      const result = buildDashboard({
        ...emptyRows,
        leadsByStage: [
          { stage: LeadStage.WON, count: 7 },
          { stage: LeadStage.LOST, count: 9 },
        ],
      });
      expect(result.summary.leadsActivos).toBe(0);
    });

    it('counts ganado as the number of WON leads, not a quote amount', () => {
      const result = buildDashboard({
        ...emptyRows,
        leadsByStage: [{ stage: LeadStage.WON, count: 4 }],
        quotesByStatus: [
          { status: QuoteStatus.PAID, count: 2, total: 99999 },
          { status: QuoteStatus.APPROVED, count: 1, total: 5000 },
        ],
      });
      expect(result.summary.ganado).toBe(4);
    });

    it('counts cotizacionesEnRevision as PENDING_APPROVAL quotes only', () => {
      const result = buildDashboard({
        ...emptyRows,
        quotesByStatus: [
          { status: QuoteStatus.DRAFT, count: 8, total: 100 },
          { status: QuoteStatus.PENDING_APPROVAL, count: 3, total: 300 },
          { status: QuoteStatus.APPROVED, count: 5, total: 500 },
        ],
      });
      expect(result.summary.cotizacionesEnRevision).toBe(3);
    });
  });

  describe('leads.porEstado', () => {
    it('groups leads by stage', () => {
      expect(buildDashboard(rows).leads.porEstado).toEqual({
        NEW: 5,
        CONTACTED: 3,
        QUALIFIED: 2,
        PROPOSAL: 1,
        NEGOTIATION: 0,
        WON: 4,
        LOST: 2,
      });
    });

    it('always returns the seven stages, with 0 for stages without leads', () => {
      const result = buildDashboard({
        ...emptyRows,
        leadsByStage: [
          { stage: LeadStage.NEW, count: 5 },
          { stage: LeadStage.QUALIFIED, count: 2 },
        ],
      });
      expect(result.leads.porEstado).toEqual({
        NEW: 5,
        CONTACTED: 0,
        QUALIFIED: 2,
        PROPOSAL: 0,
        NEGOTIATION: 0,
        WON: 0,
        LOST: 0,
      });
      expect(Object.keys(result.leads.porEstado)).toEqual(
        Object.values(LeadStage),
      );
    });
  });

  describe('quotes.porEstado', () => {
    it('groups quotes by status', () => {
      expect(buildDashboard(rows).quotes.porEstado).toEqual({
        DRAFT: 6,
        PENDING_APPROVAL: 3,
        APPROVED: 2,
        SENT: 0,
        ACCEPTED: 0,
        PAID: 1,
        REJECTED: 0,
      });
    });

    it('always returns the seven statuses, with 0 for statuses without quotes', () => {
      const result = buildDashboard({
        ...emptyRows,
        quotesByStatus: [
          { status: QuoteStatus.PENDING_APPROVAL, count: 3, total: 10 },
        ],
      });
      expect(result.quotes.porEstado).toEqual({
        DRAFT: 0,
        PENDING_APPROVAL: 3,
        APPROVED: 0,
        SENT: 0,
        ACCEPTED: 0,
        PAID: 0,
        REJECTED: 0,
      });
      expect(Object.keys(result.quotes.porEstado)).toEqual(
        Object.values(QuoteStatus),
      );
    });
  });

  describe('sales', () => {
    it('sums quotes.total by status', () => {
      expect(buildDashboard(rows).sales.porEstado).toEqual({
        DRAFT: 0,
        PENDING_APPROVAL: 1500,
        APPROVED: 2400,
        SENT: 0,
        ACCEPTED: 0,
        PAID: 1200.5,
        REJECTED: 0,
      });
    });

    it('returns 0 amounts for statuses without quotes', () => {
      const result = buildDashboard({
        ...emptyRows,
        quotesByStatus: [{ status: QuoteStatus.APPROVED, count: 1, total: 99 }],
      });
      expect(result.sales.porEstado).toEqual({
        DRAFT: 0,
        PENDING_APPROVAL: 0,
        APPROVED: 99,
        SENT: 0,
        ACCEPTED: 0,
        PAID: 0,
        REJECTED: 0,
      });
    });

    it('groups sales by month (YYYY-MM) in ascending order', () => {
      expect(buildDashboard(rows).sales.porPeriodo).toEqual([
        { periodo: '2026-08', total: 1200 },
        { periodo: '2026-09', total: 2400 },
        { periodo: '2026-10', total: 800 },
      ]);
    });

    it('returns an empty period series when there are no quotes', () => {
      expect(buildDashboard(emptyRows).sales.porPeriodo).toEqual([]);
    });
  });

  describe('conversion', () => {
    it('computes monthly conversion as ganados / creados', () => {
      expect(buildDashboard(rows).conversion.porPeriodo).toEqual([
        { periodo: '2026-08', creados: 4, ganados: 1, conversion: 0.25 },
        { periodo: '2026-09', creados: 10, ganados: 2, conversion: 0.2 },
        {
          periodo: '2026-10',
          creados: 3,
          ganados: 1,
          conversion: 1 / 3,
        },
      ]);
    });

    it('returns conversion = 0 when creados = 0 (never divides by zero)', () => {
      expect(conversionRate(0, 0)).toBe(0);
      expect(conversionRate(0, 3)).toBe(0);

      const result = buildDashboard({
        ...emptyRows,
        leadsByMonth: [{ periodo: '2026-07', creados: 0, ganados: 0 }],
      });
      expect(result.conversion.porPeriodo).toEqual([
        { periodo: '2026-07', creados: 0, ganados: 0, conversion: 0 },
      ]);
      expect(Number.isFinite(result.conversion.porPeriodo[0].conversion)).toBe(
        true,
      );
    });

    it('returns conversion = 0 for a month with leads but no wins', () => {
      const result = buildDashboard({
        ...emptyRows,
        leadsByMonth: [{ periodo: '2026-07', creados: 5, ganados: 0 }],
      });
      expect(result.conversion.porPeriodo[0].conversion).toBe(0);
    });
  });

  describe('empty project', () => {
    it('returns zeros for every state and empty period series', () => {
      expect(buildDashboard(emptyRows)).toEqual({
        summary: {
          leadsActivos: 0,
          cotizacionesEnRevision: 0,
          ganado: 0,
          pipeline: 0,
          seguimientosPendientes: 0,
          seguimientosVencidos: 0,
        },
        leads: {
          porEstado: {
            NEW: 0,
            CONTACTED: 0,
            QUALIFIED: 0,
            PROPOSAL: 0,
            NEGOTIATION: 0,
            WON: 0,
            LOST: 0,
          },
        },
        quotes: {
          porEstado: {
            DRAFT: 0,
            PENDING_APPROVAL: 0,
            APPROVED: 0,
            SENT: 0,
            ACCEPTED: 0,
            PAID: 0,
            REJECTED: 0,
          },
        },
        sales: {
          porEstado: {
            DRAFT: 0,
            PENDING_APPROVAL: 0,
            APPROVED: 0,
            SENT: 0,
            ACCEPTED: 0,
            PAID: 0,
            REJECTED: 0,
          },
          porPeriodo: [],
        },
        conversion: { porPeriodo: [] },
        periodo: null,
      });
    });
  });
});

describe('period comparison', () => {
  const zero = {
    ventas: 0,
    cotizacionesPagadas: 0,
    cotizacionesEnviadas: 0,
    leadsCreados: 0,
    leadsGanados: 0,
  };

  it('uses the previous period of the same length, right before from', () => {
    const range = {
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-08T00:00:00Z'),
    };
    expect(previousRange(range)).toEqual({
      from: new Date('2026-09-24T00:00:00Z'),
      to: range.from,
    });
  });

  it('computes percent change and returns null when the previous value is 0', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(90, 120)).toBe(-25);
    expect(percentChange(1, 3)).toBe(-66.67);
    expect(percentChange(5, 0)).toBeNull();
  });

  it('adds conversion to each period without dividing by zero', () => {
    const range = {
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-11-01T00:00:00Z'),
    };
    const result = buildPeriodComparison(
      range,
      { ...zero, leadsCreados: 4, leadsGanados: 1 },
      zero,
    );
    expect(result.actual.conversion).toBe(0.25);
    expect(result.anterior.conversion).toBe(0);
    expect(result.variacion.leadsCreados).toBeNull();
  });

  it('is null in the dashboard when no range is requested', () => {
    expect(
      buildDashboard({
        leadsByStage: [],
        quotesByStatus: [],
        salesByMonth: [],
        leadsByMonth: [],
      }).periodo,
    ).toBeNull();
  });
});
