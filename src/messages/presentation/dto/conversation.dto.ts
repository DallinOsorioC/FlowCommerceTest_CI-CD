import { ApiProperty } from '@nestjs/swagger';
import { LeadStage } from '@flowcommerce/types';
import { PaginationMetaDto } from '../../../leads/presentation/dto/paginated-leads.dto';
import { MessageDto } from './message.dto';

const WINDOW_DESCRIPTION =
  'Hasta cuándo se puede enviar texto libre: 24 h después del último mensaje del cliente. null = el cliente nunca escribió. Fuera de la ventana WhatsApp rechaza el mensaje (queda FAILED).';

export class ConversationLeadDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ana Pérez' })
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: '+525512345678' })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Acme' })
  company!: string | null;

  @ApiProperty({ enum: LeadStage })
  stage!: LeadStage;
}

export class ConversationDto {
  @ApiProperty({ type: ConversationLeadDto })
  lead!: ConversationLeadDto;

  @ApiProperty({ type: MessageDto })
  lastMessage!: MessageDto;

  @ApiProperty({
    example: 2,
    description: 'Mensajes del cliente sin leer en esta conversación',
  })
  unreadCount!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: WINDOW_DESCRIPTION,
  })
  windowOpenUntil!: Date | null;
}

export class PaginatedConversationsDto {
  @ApiProperty({
    type: [ConversationDto],
    description: 'La conversación con actividad más reciente primero',
  })
  data!: ConversationDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class UnreadCountDto {
  @ApiProperty({
    example: 3,
    description: 'Conversaciones con mensajes sin leer',
  })
  conversations!: number;

  @ApiProperty({ example: 5, description: 'Mensajes del cliente sin leer' })
  messages!: number;
}

export class LeadMessagesDto {
  @ApiProperty({
    type: [MessageDto],
    description: 'Del más antiguo al más reciente (orden de lectura del chat)',
  })
  data!: MessageDto[];

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Enviar como ?before= para cargar mensajes más antiguos. null = no hay más',
  })
  nextCursor!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: WINDOW_DESCRIPTION,
  })
  windowOpenUntil!: Date | null;
}
