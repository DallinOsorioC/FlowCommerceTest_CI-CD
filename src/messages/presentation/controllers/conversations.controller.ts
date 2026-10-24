import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import { buildPaginationMeta } from '../../../common/dto/pagination.dto';
import { GetUnreadCountUseCase } from '../../application/use-cases/get-unread-count.use-case';
import { ListConversationsUseCase } from '../../application/use-cases/list-conversations.use-case';
import {
  PaginatedConversationsDto,
  UnreadCountDto,
} from '../dto/conversation.dto';
import { ListConversationsQueryDto } from '../dto/list-conversations-query.dto';

// Bandeja de conversaciones de WhatsApp del proyecto (pantalla
// "Conversaciones"). Una "conversación" no es una tabla: es la vista de los
// mensajes agrupados por lead. Por eso el recurso es de solo lectura; los
// mensajes se crean y leen en /leads/:leadId/messages.
@ApiTags('messages')
@Controller({ path: 'projects/:projectId/conversations', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class ConversationsController {
  constructor(
    private readonly listConversationsUseCase: ListConversationsUseCase,
    private readonly getUnreadCountUseCase: GetUnreadCountUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.LEAD_READ)
  @ApiOperation({
    summary: 'Bandeja de conversaciones',
    description:
      'Un elemento por lead con mensajes: último mensaje, no leídos y ventana de 24 h. Paginado (page, limit) y filtrable por search y unread.',
  })
  @ApiOkResponse({ type: PaginatedConversationsDto })
  async list(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListConversationsQueryDto,
  ): Promise<PaginatedConversationsDto> {
    const result = await this.listConversationsUseCase.execute({
      actorUserId: userId,
      projectId,
      search: query.search,
      unread: query.unread,
      page: query.page,
      limit: query.limit,
    });

    return {
      data: result.conversations.map((conversation) => ({
        ...conversation,
        lastMessage: conversation.lastMessage.toMessage(),
      })),
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  }

  // Ruta estática declarada en su propio segmento: no choca con ningún
  // parámetro porque este controlador no tiene GET /:id.
  @Get('unread-count')
  @RequirePermission(Permission.LEAD_READ)
  @ApiOperation({ summary: 'Contador de no leídos (globo del menú)' })
  @ApiOkResponse({ type: UnreadCountDto })
  unreadCount(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<UnreadCountDto> {
    return this.getUnreadCountUseCase.execute({
      actorUserId: userId,
      projectId,
    });
  }
}
