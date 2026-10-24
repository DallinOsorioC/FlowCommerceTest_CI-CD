import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../../leads/presentation/dto/paginated-leads.dto';
import { ClientDto } from './client.dto';

// Fila del listado: el cliente más sus números comerciales (mismas
// definiciones que GET /clients/:id/stats).
export class ClientListItemDto extends ClientDto {
  @ApiProperty({ example: 3, description: 'Cotizaciones del cliente (todas)' })
  quotesCount!: number;

  @ApiProperty({ example: 1, description: 'Cotizaciones PAID' })
  paidQuotesCount!: number;

  @ApiProperty({
    example: 1000,
    description: 'Ventas: suma de quotes.total de las cotizaciones PAID',
  })
  salesTotal!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Última actividad del cliente o de sus leads (N4)',
  })
  lastActivityAt!: Date | null;
}

// Cabecera de la pantalla de Clientes («32 clientes activos · Q1,240,600
// facturados este año»). Es de toda la cartera: no cambia con los filtros ni
// con la página.
export class ClientsSummaryDto {
  @ApiProperty({ example: 32, description: 'Clientes activos del proyecto' })
  activeClients!: number;

  @ApiProperty({
    example: 1240600,
    description:
      'Facturado este año: suma de quotes.total de las cotizaciones PAID con paid_at desde el 1 de enero (UTC)',
  })
  billedThisYear!: number;
}

export class PaginatedClientsDto {
  @ApiProperty({ type: ClientListItemDto, isArray: true })
  data!: ClientListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;

  @ApiProperty({ type: ClientsSummaryDto })
  summary!: ClientsSummaryDto;
}
