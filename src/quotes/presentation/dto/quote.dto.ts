import { ApiProperty } from '@nestjs/swagger';
import { QuoteStatus, RecordOrigin } from '@flowcommerce/types';

export class QuoteRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ana Pérez' })
  name!: string;
}

// Asesor que creó la cotización (N6): para la columna Responsable y el PDF.
export class QuoteAdvisorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Carlos Méndez' })
  name!: string;

  @ApiProperty({ example: 'carlos@empresa.com' })
  email!: string;

  @ApiProperty({ type: String, nullable: true, example: '+502 5555 1234' })
  phone!: string | null;
}

export class QuoteItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  quoteId!: string;

  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'Licencia FlowCommerce Pro' })
  description!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ example: 500, description: 'Precio de lista del catálogo' })
  unitPrice!: number;

  @ApiProperty({ example: 5 })
  discountPercent!: number;

  @ApiProperty({
    example: 950,
    description: 'quantity * unitPrice - descuento de la línea (antes de IVA)',
  })
  lineTotal!: number;

  @ApiProperty({ example: 1 })
  position!: number;
}

export class QuoteDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ format: 'uuid', description: 'Lead dueño de la cotización' })
  leadId!: string;

  @ApiProperty({ type: QuoteRefDto, nullable: true })
  lead!: QuoteRefDto | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  clientId!: string | null;

  @ApiProperty({ type: QuoteRefDto, nullable: true })
  client!: QuoteRefDto | null;

  @ApiProperty({
    example: 'COT-000123',
    description: 'Correlativo por proyecto',
  })
  folio!: string;

  @ApiProperty({ example: 1000, description: 'Suma bruta de las partidas' })
  subtotal!: number;

  @ApiProperty({
    example: 50,
    description: 'Suma de descuentos de las partidas',
  })
  discount!: number;

  @ApiProperty({
    example: 0,
    description: 'Ajuste comercial: descuento global antes de IVA',
  })
  adjustment!: number;

  @ApiProperty({ example: 12, description: 'IVA aplicado (%)' })
  taxPercent!: number;

  @ApiProperty({
    example: 114,
    description: 'IVA sobre (subtotal - discount - adjustment)',
  })
  tax!: number;

  @ApiProperty({
    example: 1064,
    description: 'subtotal - discount - adjustment + tax',
  })
  total!: number;

  @ApiProperty({ enum: QuoteStatus, example: QuoteStatus.DRAFT })
  status!: QuoteStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  validUntil!: Date | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ nullable: true })
  terms!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @ApiProperty({
    type: QuoteAdvisorDto,
    nullable: true,
    description: 'Asesor que la creó; null si el usuario ya no existe',
  })
  createdBy!: QuoteAdvisorDto | null;

  @ApiProperty({
    enum: RecordOrigin,
    example: RecordOrigin.MANUAL,
    description: 'AI = generada por el servicio de IA (etiqueta «IA»)',
  })
  origin!: RecordOrigin;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Link de pago creado por el servicio de Pagos',
  })
  paymentLinkUrl!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Referencia del pago confirmado por Pagos',
  })
  paymentReference!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  approvedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  sentAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  acceptedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  rejectedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  creadoEn!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  actualizadoEn!: Date;
}

export class QuoteDetailDto extends QuoteDto {
  @ApiProperty({ type: QuoteItemDto, isArray: true })
  items!: QuoteItemDto[];
}
