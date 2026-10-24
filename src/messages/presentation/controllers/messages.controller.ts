import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import { ListLeadMessagesUseCase } from '../../application/use-cases/list-lead-messages.use-case';
import { MarkConversationReadUseCase } from '../../application/use-cases/mark-conversation-read.use-case';
import { SendMediaMessageUseCase } from '../../application/use-cases/send-media-message.use-case';
import { SendMessageUseCase } from '../../application/use-cases/send-message.use-case';
import { SendTemplateMessageUseCase } from '../../application/use-cases/whatsapp-templates.use-cases';
import { LeadMessagesDto } from '../dto/conversation.dto';
import { ListLeadMessagesQueryDto } from '../dto/list-lead-messages-query.dto';
import { MessageDto } from '../dto/message.dto';
import {
  SendMediaMessageDto,
  SendMessageDto,
  SendTemplateMessageDto,
} from '../dto/send-message.dto';

// Conversación de WhatsApp de un lead concreto. Los guards de clase fijan
// autenticación y control de acceso por proyecto; cada handler exige su permiso
// con @RequirePermission. La ruta encadena projectId y leadId, y el guard
// resuelve el tenant desde params.projectId.
@ApiTags('messages')
@Controller({
  path: 'projects/:projectId/leads/:leadId/messages',
  version: '1',
})
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class MessagesController {
  constructor(
    private readonly sendMessageUseCase: SendMessageUseCase,
    private readonly listLeadMessagesUseCase: ListLeadMessagesUseCase,
    private readonly markConversationReadUseCase: MarkConversationReadUseCase,
    private readonly sendTemplateMessageUseCase: SendTemplateMessageUseCase,
    private readonly sendMediaMessageUseCase: SendMediaMessageUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.LEAD_READ)
  @ApiOperation({
    summary: 'Historial del chat con el lead',
    description:
      'Los más recientes primero en el servidor, devueltos en orden de lectura. Para cargar más antiguos se envía ?before=<nextCursor>. No marca nada como leído.',
  })
  @ApiOkResponse({ type: LeadMessagesDto })
  @ApiNotFoundResponse({ description: 'El lead no existe en este proyecto' })
  async listMessages(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Query() query: ListLeadMessagesQueryDto,
  ): Promise<LeadMessagesDto> {
    const result = await this.listLeadMessagesUseCase.execute({
      actorUserId: userId,
      projectId,
      leadId,
      before: query.before,
      limit: query.limit,
    });

    return {
      data: result.messages.map((message) => message.toMessage()),
      nextCursor: result.nextCursor,
      windowOpenUntil: result.windowOpenUntil,
    };
  }

  // Un lead de otro tenant responde 404, igual que uno inexistente, y en ese
  // caso ni siquiera se llega a invocar a WhatsApp.
  @Post()
  @ApiOperation({ summary: 'Enviar un mensaje de texto por WhatsApp' })
  @RequirePermission(Permission.WHATSAPP_SEND_MESSAGE)
  @ApiCreatedResponse({ type: MessageDto })
  sendMessage(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageDto> {
    return this.sendMessageUseCase
      .execute({
        actorUserId: userId,
        projectId,
        leadId,
        content: dto.content,
      })
      .then((message) => message.toMessage());
  }

  // Fuera de la ventana de 24 h solo se puede escribir con una plantilla
  // aprobada por Meta.
  @Post('template')
  @RequirePermission(Permission.WHATSAPP_SEND_MESSAGE)
  @ApiOperation({
    summary: 'Enviar una plantilla de WhatsApp',
    description:
      'Para retomar la conversación cuando la ventana de 24 h está cerrada. name y language salen de GET /whatsapp/templates; parameters = valores de {{1}}, {{2}}…',
  })
  @ApiCreatedResponse({ type: MessageDto })
  @ApiNotFoundResponse({
    description: 'Lead inexistente o plantilla no aprobada',
  })
  sendTemplate(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: SendTemplateMessageDto,
  ): Promise<MessageDto> {
    return this.sendTemplateMessageUseCase
      .execute({
        actorUserId: userId,
        projectId,
        leadId,
        templateName: dto.name,
        language: dto.language,
        parameters: dto.parameters ?? [],
      })
      .then((message) => message.toMessage());
  }

  @Post('media')
  @RequirePermission(Permission.WHATSAPP_SEND_MESSAGE)
  @ApiOperation({
    summary: 'Enviar un archivo por WhatsApp',
    description:
      'Primero se sube con POST /attachments; aquí se envía por su id. Imágenes JPG/PNG de hasta 5 MB van como imagen; el resto como documento, audio o video.',
  })
  @ApiCreatedResponse({ type: MessageDto })
  @ApiNotFoundResponse({
    description: 'Lead inexistente o el archivo no es de este lead',
  })
  sendMedia(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: SendMediaMessageDto,
  ): Promise<MessageDto> {
    return this.sendMediaMessageUseCase
      .execute({
        actorUserId: userId,
        projectId,
        leadId,
        attachmentId: dto.attachmentId,
        caption: dto.caption,
      })
      .then((message) => message.toMessage());
  }

  // POST y no GET: cambia estado (read_at). Idempotente.
  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.WHATSAPP_SEND_MESSAGE)
  @ApiOperation({
    summary: 'Marcar la conversación como leída',
    description:
      'Pone read_at a los mensajes del cliente pendientes. Lo usa el frontend al abrir el chat.',
  })
  @ApiNoContentResponse({ description: 'Marcados (o no había pendientes)' })
  @ApiNotFoundResponse({ description: 'El lead no existe en este proyecto' })
  async markAsRead(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ): Promise<void> {
    await this.markConversationReadUseCase.execute({
      actorUserId: userId,
      projectId,
      leadId,
    });
  }
}
