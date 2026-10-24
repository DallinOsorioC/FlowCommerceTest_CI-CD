import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuoteItemInputDto } from './create-quote.dto';

// Edición de un borrador. Todo opcional; `items`, si viene, reemplaza a todas
// las partidas y recalcula los importes.
export class UpdateQuoteDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  @IsOptional()
  @IsISO8601()
  validUntil?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  terms?: string | null;

  @ApiPropertyOptional({
    type: QuoteItemInputDto,
    isArray: true,
    description: 'Reemplaza TODAS las partidas',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemInputDto)
  items?: QuoteItemInputDto[];

  @ApiPropertyOptional({
    example: 2968,
    minimum: 0,
    description:
      'Ajuste comercial: descuento global en dinero, antes de IVA. Si llega sin `items`, se recalculan los importes con las partidas actuales. No puede superar subtotal - descuentos de línea (si no, 400).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  adjustment?: number;
}
