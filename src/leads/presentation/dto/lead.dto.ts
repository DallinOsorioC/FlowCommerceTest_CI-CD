import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadSource, LeadStage, RecordOrigin } from '@flowcommerce/types';

export class RefSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Mariana Ruiz' })
  name!: string;
}

export class LeadDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ example: 'Andrea López' })
  name!: string;

  @ApiPropertyOptional({ nullable: true, example: 'andrea.lopez@nova.gt' })
  email!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '+502 5541 2288' })
  phone!: string | null;

  @ApiProperty({
    enum: LeadStage,
    example: LeadStage.NEW,
    description:
      'NEW=Nuevo, CONTACTED=Contactado, QUALIFIED=Seguimiento, PROPOSAL=Cotización, NEGOTIATION=Negociación, WON=Ganado, LOST=Perdido',
  })
  stage!: LeadStage;

  @ApiProperty({ example: 0 })
  score!: number;

  @ApiPropertyOptional({ nullable: true, example: 'Constructora Nova' })
  company!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Gerente de Proyectos' })
  contactPosition!: string | null;

  @ApiProperty({
    enum: RecordOrigin,
    example: RecordOrigin.MANUAL,
    description: 'AI = lo registró el servicio de IA',
  })
  origin!: RecordOrigin;

  @ApiPropertyOptional({ enum: LeadSource, nullable: true })
  source!: LeadSource | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 28900,
    description: 'Valor estimado antes de IVA',
  })
  estimatedValue!: number | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  assignedUserId!: string | null;

  @ApiPropertyOptional({ type: RefSummaryDto, nullable: true })
  assignedUser!: RefSummaryDto | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  clientId!: string | null;

  @ApiPropertyOptional({ type: RefSummaryDto, nullable: true })
  client!: RefSummaryDto | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Servicio de interés (catálogo)',
  })
  interestProductId!: string | null;

  @ApiPropertyOptional({ type: RefSummaryDto, nullable: true })
  interestProduct!: RefSummaryDto | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastContactAt!: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Próximo seguimiento PENDING (columna "Próximo seguimiento"). null si no tiene.',
  })
  nextFollowUpAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  creadoEn!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  actualizadoEn!: Date;
}
