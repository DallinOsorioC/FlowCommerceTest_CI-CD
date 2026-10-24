import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BillingProfileDto {
  @ApiPropertyOptional({ example: 'Flowcommerce S.A.S.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string | null;

  @ApiPropertyOptional({ example: '1234567-8', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'facturacion@empresa.com', nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;
}

export class QuoteSettingsDto {
  @ApiPropertyOptional({ example: 12, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxPercent?: number;

  @ApiPropertyOptional({
    example: 'COT',
    description: 'Prefijo del folio: COT-000123',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9-]{0,15}$/, {
    message: 'folioPrefix must be 1-16 chars of A-Z, 0-9 or hyphen',
  })
  folioPrefix?: string;

  @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  validityDays?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  defaultTerms?: string | null;

  @ApiPropertyOptional({ example: 'GTQ', description: 'Código ISO 4217' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string;
}

// El slug NO se puede editar.
export class UpdateProjectDto {
  @ApiPropertyOptional({ example: 'Mi empresa' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ type: BillingProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BillingProfileDto)
  billing?: BillingProfileDto;

  @ApiPropertyOptional({ type: QuoteSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuoteSettingsDto)
  quoteSettings?: QuoteSettingsDto;
}
