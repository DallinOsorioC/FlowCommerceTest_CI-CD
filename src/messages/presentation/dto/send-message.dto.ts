import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SendMessageDto {
  // El texto es lo único que el cliente decide. whatsappMessageId, direction y
  // status no aparecen aquí a propósito: el primero lo asigna la API de
  // WhatsApp, la dirección es siempre OUTBOUND en este endpoint y el estado lo
  // reporta la propia API. No se puede forzar ninguno de los tres desde HTTP.
  @ApiProperty({
    example: 'Hola Ana, le comparto la propuesta que conversamos.',
    description: 'Texto del mensaje que se enviará al lead.',
  })
  @IsString()
  @IsNotEmpty()
  // 4096 es el límite de un mensaje de texto de WhatsApp. Más allá la Graph API
  // rechaza la petición, así que se corta aquí para devolver un 400 en la
  // frontera en lugar de un error del proveedor con 500.
  @MaxLength(4096)
  content!: string;
}

export class SendTemplateMessageDto {
  @ApiProperty({
    example: 'seguimiento_cotizacion',
    description: 'Nombre de la plantilla aprobada (GET /whatsapp/templates)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  name!: string;

  @ApiProperty({
    example: 'es',
    description: 'Código de idioma de la plantilla',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(15)
  language!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['Ana', 'COT-000004'],
    description: 'Valores de {{1}}, {{2}}… del cuerpo, en orden',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(1024, { each: true })
  parameters?: string[];
}

export class SendMediaMessageDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Archivo ya subido con POST /attachments (del lead o de su cliente)',
  })
  @IsUUID()
  attachmentId!: string;

  @ApiPropertyOptional({
    example: 'Le comparto la propuesta firmada',
    nullable: true,
    description: 'Pie de foto (no aplica a audios)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string | null;
}
