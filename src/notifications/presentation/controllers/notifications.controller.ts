import {
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
import { buildPaginationMeta } from '../../../common/dto/pagination.dto';
import {
  CountUnreadNotificationsUseCase,
  ListNotificationsUseCase,
  MarkAllNotificationsReadUseCase,
  MarkNotificationReadUseCase,
} from '../../application/use-cases/notifications.use-cases';
import {
  ListNotificationsQueryDto,
  PaginatedNotificationsDto,
  UnreadNotificationsDto,
} from '../dto/notification.dto';

// Notificaciones del usuario de la sesión en un proyecto (pantalla
// Notificaciones y campana). Solo ve las suyas.
@ApiTags('notifications')
@Controller({ path: 'projects/:projectId/notifications', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class NotificationsController {
  constructor(
    private readonly listNotifications: ListNotificationsUseCase,
    private readonly countUnread: CountUnreadNotificationsUseCase,
    private readonly markRead: MarkNotificationReadUseCase,
    private readonly markAllRead: MarkAllNotificationsReadUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.PROJECT_READ)
  @ApiOperation({
    summary: 'Mis notificaciones',
    description:
      'Paginadas, más recientes primero. Filtros: unread, type, category (pestaña).',
  })
  @ApiOkResponse({ type: PaginatedNotificationsDto })
  async list(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<PaginatedNotificationsDto> {
    const result = await this.listNotifications.execute({
      actorUserId: userId,
      projectId,
      unread: query.unread,
      type: query.type,
      category: query.category,
      page: query.page,
      limit: query.limit,
    });
    return {
      data: result.notifications,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
      unreadCount: result.unreadCount,
    };
  }

  @Get('unread-count')
  @RequirePermission(Permission.PROJECT_READ)
  @ApiOperation({ summary: 'Contador de la campana' })
  @ApiOkResponse({ type: UnreadNotificationsDto })
  async unread(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<UnreadNotificationsDto> {
    return {
      unreadCount: await this.countUnread.execute({
        actorUserId: userId,
        projectId,
      }),
    };
  }

  // Ruta estática antes que la de :notificationId.
  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.PROJECT_READ)
  @ApiOperation({ summary: 'Marcar todas como leídas' })
  @ApiNoContentResponse()
  async readAll(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<void> {
    await this.markAllRead.execute({ actorUserId: userId, projectId });
  }

  @Post(':notificationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.PROJECT_READ)
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'No existe o no es tuya' })
  async read(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ): Promise<void> {
    await this.markRead.execute({
      actorUserId: userId,
      projectId,
      notificationId,
    });
  }
}
