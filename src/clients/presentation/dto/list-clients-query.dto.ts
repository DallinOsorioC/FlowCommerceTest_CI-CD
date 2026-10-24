import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { BooleanQuery } from '../../../common/dto/boolean-query.transform';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import {
  CLIENT_SORT_FIELDS,
  type ClientSortField,
} from '../../domain/repositories/client.repository';

export class ListClientsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'quetzal',
    description: 'Nombre, empresa, email, teléfono o NIT (parcial)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filtrar por responsable',
  })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({ description: 'true = solo activos' })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ enum: CLIENT_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(CLIENT_SORT_FIELDS)
  sortBy?: ClientSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
