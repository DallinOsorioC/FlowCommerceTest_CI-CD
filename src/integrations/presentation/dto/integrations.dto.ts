import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ALL_API_KEY_SCOPES, type ApiKeyScope } from '../../domain/api-key';
import { Trim } from '../../../common/dto/trim.transform';
import { LeadDto } from '../../../leads/presentation/dto/lead.dto';
import { MessageDto } from '../../../messages/presentation/dto/message.dto';
import { QuoteDto } from '../../../quotes/presentation/dto/quote.dto';

export class CreateApiKeyDto {
  @ApiProperty({
    example: 'Servicio de IA',
    description: 'Para reconocerla en la lista',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    isArray: true,
    enum: ALL_API_KEY_SCOPES,
    description:
      'Permisos de la clave. Si se omite, tiene todos. Da a cada servicio solo lo que necesita.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(ALL_API_KEY_SCOPES, { each: true })
  scopes?: ApiKeyScope[];
}

export class ApiKeyDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ example: 'Servicio de IA' })
  name!: string;

  @ApiProperty({ example: 'fc_live_Ab3d', description: 'Inicio de la clave' })
  prefix!: string;

  @ApiProperty({ isArray: true, enum: ALL_API_KEY_SCOPES })
  scopes!: ApiKeyScope[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastUsedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  revokedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  creadoEn!: Date;
}

export class CreatedApiKeyDto extends ApiKeyDto {
  @ApiProperty({
    example: 'fc_live_Ab3d…',
    description:
      'La clave completa. Se muestra SOLO esta vez: guárdala y compártela por un canal seguro.',
  })
  key!: string;
}

export class AiLeadContextDto {
  @ApiProperty({ type: LeadDto })
  lead!: LeadDto;

  @ApiProperty({
    type: [MessageDto],
    description: 'Últimos 30 mensajes de WhatsApp, en orden de lectura',
  })
  messages!: MessageDto[];

  @ApiProperty({ type: [QuoteDto], description: 'Últimas 20 cotizaciones' })
  quotes!: QuoteDto[];
}

export class PaymentWebhookResponseDto {
  @ApiProperty({ example: true })
  received!: true;

  @ApiProperty({
    enum: ['PROCESSED', 'IGNORED', 'DUPLICATE'],
    description:
      'PROCESSED = aplicado; IGNORED = sin efecto (p. ej. ya estaba pagada); DUPLICATE = eventId ya recibido',
  })
  result!: 'PROCESSED' | 'IGNORED' | 'DUPLICATE';
}
