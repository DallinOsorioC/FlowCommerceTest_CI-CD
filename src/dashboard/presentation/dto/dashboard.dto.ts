import { ApiProperty } from '@nestjs/swagger';

// Contrato de respuesta de GET /api/v1/projects/:projectId/dashboard.
// Los objetos `porEstado` incluyen SIEMPRE todas las claves (con 0 cuando no
// hay registros) para que el frontend no tenga que descubrir qué estados
// existen.
// Con ?from&to se filtran quotes, sales y conversion; summary y leads.porEstado
// son siempre la foto actual (ver dashboard.types.ts).

export class DashboardSummaryDto {
  @ApiProperty({
    example: 12,
    description:
      'Leads en NEW + CONTACTED + QUALIFIED + PROPOSAL + NEGOTIATION (todo menos WON y LOST)',
  })
  leadsActivos!: number;

  @ApiProperty({
    example: 3,
    description: 'Cotizaciones con status PENDING_APPROVAL',
  })
  cotizacionesEnRevision!: number;

  @ApiProperty({
    example: 4,
    description: 'Cantidad de leads con stage WON (conteo, no monto)',
  })
  ganado!: number;

  @ApiProperty({
    example: 125000.5,
    description:
      'Suma del valor estimado (estimatedValue, antes de IVA) de los leads activos: todo menos WON y LOST',
  })
  pipeline!: number;

  @ApiProperty({
    example: 5,
    description: 'Seguimientos pendientes (PENDING) del proyecto',
  })
  seguimientosPendientes!: number;

  @ApiProperty({
    example: 2,
    description: 'De los pendientes, los que ya pasaron su fecha',
  })
  seguimientosVencidos!: number;
}

export class LeadsPorEstadoDto {
  @ApiProperty({ example: 5 })
  NEW!: number;

  @ApiProperty({ example: 3 })
  CONTACTED!: number;

  @ApiProperty({ example: 2 })
  QUALIFIED!: number;

  @ApiProperty({ example: 1 })
  PROPOSAL!: number;

  @ApiProperty({ example: 1 })
  NEGOTIATION!: number;

  @ApiProperty({ example: 4 })
  WON!: number;

  @ApiProperty({ example: 2 })
  LOST!: number;
}

export class DashboardLeadsDto {
  @ApiProperty({
    type: LeadsPorEstadoDto,
    description: 'Conteo de leads por stage (las 7 etapas, 0 si no hay)',
  })
  porEstado!: LeadsPorEstadoDto;
}

export class QuotesPorEstadoDto {
  @ApiProperty({ example: 6 })
  DRAFT!: number;

  @ApiProperty({ example: 3 })
  PENDING_APPROVAL!: number;

  @ApiProperty({ example: 2 })
  APPROVED!: number;

  @ApiProperty({ example: 0 })
  SENT!: number;

  @ApiProperty({ example: 0 })
  ACCEPTED!: number;

  @ApiProperty({ example: 1 })
  PAID!: number;

  @ApiProperty({ example: 0 })
  REJECTED!: number;
}

export class DashboardQuotesDto {
  @ApiProperty({
    type: QuotesPorEstadoDto,
    description: 'Conteo de cotizaciones por status (los 7, 0 si no hay)',
  })
  porEstado!: QuotesPorEstadoDto;
}

export class SalesPorEstadoDto {
  @ApiProperty({ example: 0 })
  DRAFT!: number;

  @ApiProperty({ example: 1500 })
  PENDING_APPROVAL!: number;

  @ApiProperty({ example: 2400 })
  APPROVED!: number;

  @ApiProperty({ example: 0 })
  SENT!: number;

  @ApiProperty({ example: 0 })
  ACCEPTED!: number;

  @ApiProperty({ example: 1200 })
  PAID!: number;

  @ApiProperty({ example: 0 })
  REJECTED!: number;
}

export class SalesPorPeriodoDto {
  @ApiProperty({
    example: '2026-09',
    description: 'Mes (YYYY-MM, UTC) en que se pagó la cotización (paidAt)',
  })
  periodo!: string;

  @ApiProperty({
    example: 2400,
    description: 'Suma de quotes.total de las cotizaciones pagadas en el mes',
  })
  total!: number;
}

export class DashboardSalesDto {
  @ApiProperty({
    type: SalesPorEstadoDto,
    description: 'Suma de quotes.total por status (los 7, 0 si no hay)',
  })
  porEstado!: SalesPorEstadoDto;

  @ApiProperty({
    type: [SalesPorPeriodoDto],
    description:
      'Ventas: suma de quotes.total de las cotizaciones PAID agrupada por mes de pago (paidAt), ordenada ascendente. Cuadra con las ventas de GET /clients/:id/stats.',
  })
  porPeriodo!: SalesPorPeriodoDto[];
}

export class ConversionPorPeriodoDto {
  @ApiProperty({
    example: '2026-09',
    description: 'Mes (YYYY-MM, UTC) de creación del lead',
  })
  periodo!: string;

  @ApiProperty({ example: 10, description: 'Leads creados en el mes' })
  creados!: number;

  @ApiProperty({
    example: 2,
    description: 'Leads creados en el mes que hoy están en WON',
  })
  ganados!: number;

  @ApiProperty({
    example: 0.2,
    description: 'ganados / creados (0 cuando creados = 0)',
  })
  conversion!: number;
}

export class DashboardConversionDto {
  @ApiProperty({
    type: [ConversionPorPeriodoDto],
    description: 'Conversión mensual de leads, ordenada ascendente',
  })
  porPeriodo!: ConversionPorPeriodoDto[];
}

export class PeriodTotalsDto {
  @ApiProperty({
    example: 4800,
    description: 'Suma de quotes.total de las PAID con paidAt en el período',
  })
  ventas!: number;

  @ApiProperty({ example: 3, description: 'Cotizaciones PAID en el período' })
  cotizacionesPagadas!: number;

  @ApiProperty({
    example: 7,
    description: 'Cotizaciones enviadas (sentAt) en el período',
  })
  cotizacionesEnviadas!: number;

  @ApiProperty({ example: 10, description: 'Leads creados en el período' })
  leadsCreados!: number;

  @ApiProperty({
    example: 2,
    description: 'De los leads creados en el período, cuántos están hoy en WON',
  })
  leadsGanados!: number;

  @ApiProperty({ example: 0.2, description: 'leadsGanados / leadsCreados' })
  conversion!: number;
}

export class PreviousPeriodTotalsDto extends PeriodTotalsDto {
  @ApiProperty({ example: '2026-08-31T00:00:00.000Z' })
  from!: string;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  to!: string;
}

export class PeriodVariationDto {
  @ApiProperty({
    example: 12.5,
    nullable: true,
    type: Number,
    description: 'Variación % de ventas vs el período anterior (null si era 0)',
  })
  ventas!: number | null;

  @ApiProperty({ example: -3.2, nullable: true, type: Number })
  cotizacionesEnviadas!: number | null;

  @ApiProperty({ example: 25, nullable: true, type: Number })
  leadsCreados!: number | null;
}

export class PeriodComparisonDto {
  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  from!: string;

  @ApiProperty({ example: '2026-11-01T00:00:00.000Z' })
  to!: string;

  @ApiProperty({ type: PeriodTotalsDto })
  actual!: PeriodTotalsDto;

  @ApiProperty({
    type: PreviousPeriodTotalsDto,
    description: 'Período anterior de la misma duración, pegado al actual',
  })
  anterior!: PreviousPeriodTotalsDto;

  @ApiProperty({ type: PeriodVariationDto })
  variacion!: PeriodVariationDto;
}

export class DashboardDto {
  @ApiProperty({ type: DashboardSummaryDto })
  summary!: DashboardSummaryDto;

  @ApiProperty({ type: DashboardLeadsDto })
  leads!: DashboardLeadsDto;

  @ApiProperty({ type: DashboardQuotesDto })
  quotes!: DashboardQuotesDto;

  @ApiProperty({ type: DashboardSalesDto })
  sales!: DashboardSalesDto;

  @ApiProperty({ type: DashboardConversionDto })
  conversion!: DashboardConversionDto;

  @ApiProperty({
    type: PeriodComparisonDto,
    nullable: true,
    description:
      'Solo con ?from&to: totales del período y del anterior con su variación. null sin rango.',
  })
  periodo!: PeriodComparisonDto | null;
}
