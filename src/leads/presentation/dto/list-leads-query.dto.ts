import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { LeadSource, LeadStage } from '@flowcommerce/types';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import {
  LEAD_SORT_FIELDS,
  type LeadSortField,
} from '../../domain/repositories/lead.repository';

// Filtros y paginación del listado. Todos opcionales: el projectId NO se acepta
// aquí, porque lo fija el guard a partir de la ruta. Aceptarlo en el query
// permitiría a un cliente pedir los leads de otro tenant.
export class ListLeadsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LeadStage, example: LeadStage.QUALIFIED })
  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  // Varias etapas: ?stages=NEW,CONTACTED o ?stages=NEW&stages=CONTACTED.
  @ApiPropertyOptional({
    enum: LeadStage,
    isArray: true,
    description: 'Varias etapas separadas por coma (p. ej. activos)',
    example: 'NEW,CONTACTED,QUALIFIED,PROPOSAL,NEGOTIATION',
  })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === undefined || raw === null) {
      return undefined;
    }
    const list: unknown[] = Array.isArray(raw) ? raw : [raw];
    return list
      .flatMap((item) => String(item).split(','))
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  })
  @IsArray()
  @IsEnum(LeadStage, { each: true })
  stages?: LeadStage[];

  // Búsqueda por texto libre sobre nombre, email, teléfono y empresa.
  @ApiPropertyOptional({ example: 'nova', description: 'Coincidencia parcial' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Responsable' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Creados desde (inclusive)',
  })
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Creados antes de (exclusivo)',
  })
  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional({
    enum: LEAD_SORT_FIELDS,
    description: 'Sin sortBy: por fecha de creación ascendente',
  })
  @IsOptional()
  @IsIn(LEAD_SORT_FIELDS)
  sortBy?: LeadSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
