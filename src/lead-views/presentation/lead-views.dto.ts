import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LeadSource, LeadStage } from '@flowcommerce/types';
import {
  LEAD_SORT_FIELDS,
  type LeadSortField,
} from '../../leads/domain/repositories/lead.repository';

// Los mismos nombres y reglas que los query params de GET /leads.
export class LeadViewFiltersDto {
  @ApiPropertyOptional({ enum: LeadStage })
  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  @ApiPropertyOptional({ enum: LeadStage, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(LeadStage, { each: true })
  stages?: LeadStage[];

  @ApiPropertyOptional({ example: 'constructora' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional({ enum: LEAD_SORT_FIELDS })
  @IsOptional()
  @IsIn(LEAD_SORT_FIELDS)
  sortBy?: LeadSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class CreateLeadViewDto {
  @ApiProperty({ example: 'Mis leads en negociación' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({ type: LeadViewFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LeadViewFiltersDto)
  filters?: LeadViewFiltersDto;
}

export class UpdateLeadViewDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ type: LeadViewFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LeadViewFiltersDto)
  filters?: LeadViewFiltersDto;
}

export class LeadViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({
    type: LeadViewFiltersDto,
    description: 'Se aplican como query params de GET /leads',
  })
  filters!: LeadViewFiltersDto;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
