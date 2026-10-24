import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { BooleanQuery } from '../../../common/dto/boolean-query.transform';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

// Filtros del catálogo; el projectId no se acepta aquí (lo fija la ruta).
export class ListProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'true = solo activos (selector de cotización); false = solo inactivos',
  })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ example: 'Licencias' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({
    example: 'licencia',
    description: 'Coincidencia parcial sobre nombre y descripción',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
