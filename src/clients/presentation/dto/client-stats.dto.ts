import { ApiProperty } from '@nestjs/swagger';

export class ClientStatsDto {
  @ApiProperty({ example: 7, description: 'Cotizaciones en cualquier estado' })
  quotesCount!: number;

  @ApiProperty({ example: 3, description: 'Cotizaciones en estado PAID' })
  paidQuotesCount!: number;

  @ApiProperty({
    example: 15400.5,
    description: 'Ventas: suma de total de las cotizaciones PAID',
  })
  salesTotal!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Última actividad del cliente o de sus leads',
  })
  lastActivityAt!: Date | null;
}
