import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { FollowUpStatus, FollowUpType } from '@flowcommerce/types';
import { BooleanQuery } from '../../../common/dto/boolean-query.transform';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { Trim } from '../../../common/dto/trim.transform';
import { PaginationMetaDto } from '../../../leads/presentation/dto/paginated-leads.dto';

class RefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ana Pérez' })
  name!: string;
}

export class CreateFollowUpDto {
  @ApiPropertyOptional({ enum: FollowUpType, default: FollowUpType.TASK })
  @IsOptional()
  @IsIn(Object.values(FollowUpType))
  type?: FollowUpType;

  @ApiProperty({ example: 'Llamar para confirmar la demo', maxLength: 255 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-10-22T15:00:00Z' })
  @IsISO8601({ strict: true })
  dueAt!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Responsable (miembro del proyecto). Si se omite, quien lo crea.',
  })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;
}

export class UpdateFollowUpDto {
  @ApiPropertyOptional({ enum: FollowUpType })
  @IsOptional()
  @IsIn(Object.values(FollowUpType))
  type?: FollowUpType;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueAt?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @ApiPropertyOptional({
    enum: FollowUpStatus,
    description:
      'DONE = completado (actualiza el último contacto del lead); CANCELLED = cancelado. Ambos son finales.',
  })
  @IsOptional()
  @IsIn(Object.values(FollowUpStatus))
  status?: FollowUpStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Pide la demo el martes',
    description: 'Resultado del seguimiento (al completarlo)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  outcome?: string | null;
}

export class ListFollowUpsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({ enum: FollowUpStatus })
  @IsOptional()
  @IsIn(Object.values(FollowUpStatus))
  status?: FollowUpStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Desde (inclusive)',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueFrom?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Hasta (exclusivo)',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueTo?: string;

  @ApiPropertyOptional({ description: 'true = solo pendientes ya vencidos' })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  overdue?: boolean;
}

export class FollowUpDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ format: 'uuid' })
  leadId!: string;

  @ApiProperty({ type: RefDto })
  lead!: RefDto;

  @ApiProperty({ enum: FollowUpType })
  type!: FollowUpType;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  dueAt!: Date;

  @ApiProperty({ enum: FollowUpStatus })
  status!: FollowUpStatus;

  @ApiProperty({ description: 'PENDING y con la fecha ya pasada' })
  overdue!: boolean;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  assignedUserId!: string | null;

  @ApiProperty({ type: RefDto, nullable: true })
  assignedUser!: RefDto | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  outcome!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  creadoEn!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  actualizadoEn!: Date;
}

export class PaginatedFollowUpsDto {
  @ApiProperty({
    type: [FollowUpDto],
    description: 'Por fecha límite, la más próxima primero',
  })
  data!: FollowUpDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
