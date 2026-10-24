import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LeadSource, LeadStage } from '@flowcommerce/types';

export class CreateLeadDto {
  @ApiProperty({ example: 'Andrea López' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    example: 'andrea.lopez@nova.gt',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @IsEmail({}, { message: 'email debe ser una dirección válida' })
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional({ example: '+50255412288', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional({
    enum: LeadStage,
    default: LeadStage.NEW,
    example: LeadStage.NEW,
  })
  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;

  @ApiPropertyOptional({ example: 'Constructora Nova', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string | null;

  @ApiPropertyOptional({
    example: 'Gerente de Proyectos',
    nullable: true,
    description: 'Cargo del contacto en su empresa',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactPosition?: string | null;

  @ApiPropertyOptional({ enum: LeadSource, nullable: true })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource | null;

  @ApiPropertyOptional({
    example: 28900,
    minimum: 0,
    nullable: true,
    description: 'Valor estimado antes de IVA (2 decimales)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  estimatedValue?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Responsable: debe ser miembro del proyecto (si no, 400)',
  })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Cliente del mismo proyecto (si no, 404)',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Producto de interés del catálogo del proyecto (si no, 404)',
  })
  @IsOptional()
  @IsUUID()
  interestProductId?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-09-11T15:12:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  lastContactAt?: string | null;
}
