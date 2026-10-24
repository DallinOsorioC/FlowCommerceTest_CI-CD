import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../authorization/presentation/decorators/require-permission.decorator';
import { LeadViewsUseCases } from '../application/lead-views.use-cases';
import {
  CreateLeadViewDto,
  LeadViewDto,
  UpdateLeadViewDto,
} from './lead-views.dto';

// Ruta aparte (lead-views) y no leads/views: leads/:leadId la capturaría.
@ApiTags('leads')
@Controller({ path: 'projects/:projectId/lead-views', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class LeadViewsController {
  constructor(private readonly useCases: LeadViewsUseCases) {}

  @Get()
  @RequirePermission(Permission.PROJECT_READ)
  @ApiOperation({ summary: 'Mis vistas guardadas del listado de leads' })
  @ApiOkResponse({ type: [LeadViewDto] })
  list(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<LeadViewDto[]> {
    return this.useCases.list({ actorUserId: userId, projectId });
  }

  @Post()
  @RequirePermission(Permission.PROJECT_READ)
  @ApiOperation({
    summary: 'Guardar una vista (nombre + filtros)',
    description: 'Hasta 20 por persona y proyecto.',
  })
  @ApiCreatedResponse({ type: LeadViewDto })
  @ApiConflictResponse({ description: 'Nombre repetido o tope de 20 vistas' })
  create(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateLeadViewDto,
  ): Promise<LeadViewDto> {
    return this.useCases.create({ actorUserId: userId, projectId, ...dto });
  }

  @Patch(':viewId')
  @RequirePermission(Permission.PROJECT_READ)
  @ApiOperation({ summary: 'Renombrar o actualizar los filtros de una vista' })
  @ApiOkResponse({ type: LeadViewDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Nombre repetido' })
  update(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('viewId', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadViewDto,
  ): Promise<LeadViewDto> {
    return this.useCases.update({
      actorUserId: userId,
      projectId,
      id,
      ...dto,
    });
  }

  @Delete(':viewId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.PROJECT_READ)
  @ApiOperation({ summary: 'Borrar una vista guardada' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async remove(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('viewId', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.useCases.remove({ actorUserId: userId, projectId, id });
  }
}
