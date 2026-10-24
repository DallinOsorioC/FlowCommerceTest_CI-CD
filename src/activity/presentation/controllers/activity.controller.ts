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
import { ListActivityUseCase } from '../../application/use-cases/list-activity.use-case';
import {
  ListActivityQueryDto,
  PaginatedActivityDto,
} from '../dto/activity.dto';

// Historial de actividad (N4). Un único recurso de solo lectura con filtros:
// ?leadId= para la pestaña Actividad del lead, ?clientId= para el historial
// del cliente, ?quoteId= para la línea de tiempo de una cotización.
@ApiTags('activity')
@Controller({ path: 'projects/:projectId/activity', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class ActivityController {
  constructor(private readonly listActivity: ListActivityUseCase) {}

  @Get()
  @RequirePermission(Permission.LEAD_READ)
  @ApiOperation({
    summary: 'Historial de actividad',
    description:
      'Más recientes primero. Filtros: leadId, clientId (incluye sus leads), quoteId, types.',
  })
  @ApiOkResponse({ type: PaginatedActivityDto })
  async list(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListActivityQueryDto,
  ): Promise<PaginatedActivityDto> {
    const result = await this.listActivity.execute({
      actorUserId: userId,
      projectId,
      leadId: query.leadId,
      clientId: query.clientId,
      quoteId: query.quoteId,
      types: query.types,
      page: query.page,
      limit: query.limit,
    });
    return {
      data: result.events,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  }
}
