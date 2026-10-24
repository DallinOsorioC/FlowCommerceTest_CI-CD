import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

// Partida del body: solo producto, cantidad y descuento. El PRECIO no se envía:
// sale del catálogo, para que nadie pueda cotizar por debajo de lista.
export class QuoteItemInputDto {
  @ApiProperty({ format: 'uuid', description: 'Producto del catálogo' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 2, minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  quantity!: number;

  @ApiPropertyOptional({
    example: 5,
    minimum: 0,
    maximum: 100,
    default: 0,
    description:
      'No puede superar el descuento máximo del producto (si no, 400)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({
    maxLength: 1000,
    description: 'Si se omite, se usa el nombre del producto',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

// No se acepta projectId, folio, importes ni status: el projectId lo fija el
// guard desde la ruta, el folio es correlativo, los importes los calcula el
// servidor y el status inicial es siempre DRAFT.
export class CreateQuoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  leadId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Si se omite, se usa el cliente del lead',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsISO8601()
  validUntil?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Términos y condiciones',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  terms?: string | null;

  @ApiPropertyOptional({
    example: 2968,
    minimum: 0,
    default: 0,
    description:
      'Ajuste comercial: descuento global en dinero, antes de IVA. No puede superar subtotal - descuentos de línea (si no, 400).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  adjustment?: number;

  @ApiPropertyOptional({ type: QuoteItemInputDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemInputDto)
  items?: QuoteItemInputDto[];
}
