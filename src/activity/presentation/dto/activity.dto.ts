import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { ActivityType } from '@flowcommerce/types';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginationMetaDto } from '../../../leads/presentation/dto/paginated-leads.dto';

export class ListActivityQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Pestaña Actividad del lead',
  })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Historial del cliente (incluye la actividad de sus leads)',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @ApiPropertyOptional({
    enum: ActivityType,
    isArray: true,
    description:
      'Uno o varios tipos separados por coma: ?types=QUOTE_CREATED,QUOTE_STATUS_CHANGED',
  })
  @IsOptional()
  // Acepta "a,b" o ?types=a&types=b.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(Object.values(ActivityType), { each: true })
  types?: ActivityType[];
}

export class ActivityActorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ana López' })
  name!: string;
}

export class ActivityEventDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ enum: ActivityType })
  type!: ActivityType;

  @ApiProperty({ example: 'Cotización COT-000004 aprobada' })
  title!: string;

  @ApiProperty({
    type: ActivityActorDto,
    nullable: true,
    description: 'null = lo hizo el sistema (WhatsApp, IA, Pagos)',
  })
  actor!: ActivityActorDto | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  leadId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  clientId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  quoteId!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { from: 'NEW', to: 'CONTACTED' },
  })
  metadata!: Record<string, unknown>;

  @ApiProperty({ type: String, format: 'date-time' })
  creadoEn!: Date;
}

export class PaginatedActivityDto {
  @ApiProperty({
    type: [ActivityEventDto],
    description: 'Más recientes primero',
  })
  data!: ActivityEventDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
