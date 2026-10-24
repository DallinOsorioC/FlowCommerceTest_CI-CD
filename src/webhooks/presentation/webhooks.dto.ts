import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ALL_EVENTS, WEBHOOK_EVENTS } from '../domain/webhook';

const EVENTS_DESCRIPTION = `Eventos a recibir. "${ALL_EVENTS}" = todos. Disponibles: ${WEBHOOK_EVENTS.join(', ')}.`;

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://mi-servicio.com/hooks/flowcommerce' })
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  @MaxLength(2048)
  url!: string;

  @ApiPropertyOptional({ example: 'Sincroniza leads con mi ERP' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({
    type: [String],
    example: ['lead.created', 'message.received'],
    description: EVENTS_DESCRIPTION,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  events!: string[];
}

export class UpdateWebhookDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @ApiPropertyOptional({ type: [String], description: EVENTS_DESCRIPTION })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  events?: string[];

  @ApiPropertyOptional({ description: 'false = pausar sin borrar' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class WebhookDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: [String] }) events!: string[];
  @ApiProperty({ example: 'whsec_ab12cd', description: 'Inicio del secreto' })
  secretPrefix!: string;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  createdByUserId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class CreatedWebhookDto extends WebhookDto {
  @ApiProperty({
    description:
      'Secreto de firma. Se muestra SOLO esta vez (al crear o rotar): guárdalo en el servicio receptor.',
  })
  secret!: string;
}

export class WebhookDeliveryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'lead.created' }) event!: string;
  @ApiProperty({ enum: ['SUCCESS', 'FAILED'] }) status!: 'SUCCESS' | 'FAILED';
  @ApiProperty() attempts!: number;
  @ApiProperty({ type: Number, nullable: true }) responseStatus!: number | null;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty({ type: Number, nullable: true }) durationMs!: number | null;
  @ApiProperty() createdAt!: Date;
}

export class WebhookTestResultDto {
  @ApiProperty({ enum: ['SUCCESS', 'FAILED'] }) status!: 'SUCCESS' | 'FAILED';
  @ApiProperty() attempts!: number;
  @ApiProperty({ type: Number, nullable: true }) responseStatus!: number | null;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
}

export class WebhookEventsDto {
  @ApiProperty({ type: [String] }) events!: string[];
}
