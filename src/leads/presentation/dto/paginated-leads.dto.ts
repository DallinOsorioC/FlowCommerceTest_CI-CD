import { ApiProperty } from '@nestjs/swagger';
import { LeadDto } from './lead.dto';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 137 })
  total!: number;

  @ApiProperty({ example: 7 })
  totalPages!: number;
}

// Envelope de los listados paginados. El array de datos va en "data" para que
// el cliente tenga un único sitio donde mirar el tamaño de la respuesta, en vez
// de tener que deducirlo de un array suelto.
export class PaginatedLeadsDto {
  @ApiProperty({ type: LeadDto, isArray: true })
  data!: LeadDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
