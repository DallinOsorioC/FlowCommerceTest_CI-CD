import { ApiProperty } from '@nestjs/swagger';
import { MessageDirection, MessageType } from '@flowcommerce/types';

export class MessageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ format: 'uuid' })
  leadId!: string;

  @ApiProperty({
    example: 'wamid.HBgLMzIzNDU2Nzc4OTAKACAAMwND...',
    description: 'Id asignado por la API de WhatsApp. Clave de idempotencia.',
  })
  whatsappMessageId!: string;

  @ApiProperty({ enum: MessageDirection, example: MessageDirection.OUTBOUND })
  direction!: MessageDirection;

  @ApiProperty({
    enum: MessageType,
    example: MessageType.TEXT,
    description:
      'TEXT, TEMPLATE (plantilla), IMAGE, DOCUMENT, AUDIO, VIDEO u OTHER',
  })
  type!: MessageType;

  @ApiProperty({
    example: 'Hola Ana, le comparto la propuesta.',
    description:
      'Texto. En plantillas, el texto con sus variables; en archivos, el pie de foto o "[Documento] nombre.pdf"',
  })
  content!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'Solo TEMPLATE: nombre de la plantilla',
  })
  templateName!: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Archivo del mensaje: GET /projects/:projectId/attachments/:id/download',
  })
  attachmentId!: string | null;

  @ApiProperty({
    example: 'SENT',
    description: 'Estado reportado por WhatsApp: SENT, DELIVERED, READ...',
  })
  status!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      'Motivo de WhatsApp cuando status = FAILED (p. ej. "131047: Re-engagement message" = fuera de la ventana de 24 h)',
  })
  errorMessage!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Solo INBOUND: cuándo se leyó en el CRM. null = no leído (o mensaje OUTBOUND)',
  })
  readAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  creadoEn!: Date;
}
