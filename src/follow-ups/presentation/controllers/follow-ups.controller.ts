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
  Query,
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
import { FollowUpType, Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import { buildPaginationMeta } from '../../../common/dto/pagination.dto';
import {
  CreateFollowUpUseCase,
  DeleteFollowUpUseCase,
  GetFollowUpUseCase,
  ListFollowUpsUseCase,
  UpdateFollowUpUseCase,
} from '../../application/use-cases/follow-ups.use-cases';
import {
  CreateFollowUpDto,
  FollowUpDto,
  ListFollowUpsQueryDto,
  PaginatedFollowUpsDto,
  UpdateFollowUpDto,
} from '../dto/follow-up.dto';

const toDate = (value?: string) => (value ? new Date(value) : undefined);

// Seguimientos comerciales. Se CREAN dentro de un lead
// (/leads/:leadId/follow-ups) y se consultan/editan como recurso propio del
// proyecto (/follow-ups), para la agenda del equipo y el Dashboard.
@ApiTags('follow-ups')
@Controller({ path: 'projects/:projectId', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class FollowUpsController {
  constructor(
    private readonly createFollowUp: CreateFollowUpUseCase,
    private readonly listFollowUps: ListFollowUpsUseCase,
    private readonly getFollowUp: GetFollowUpUseCase,
    private readonly updateFollowUp: UpdateFollowUpUseCase,
    private readonly deleteFollowUp: DeleteFollowUpUseCase,
  ) {}

  @Post('leads/:leadId/follow-ups')
  @RequirePermission(Permission.LEAD_UPDATE)
  @ApiOperation({
    summary: 'Registrar seguimiento de un lead',
    description:
      'Sin assignedUserId queda asignado a quien lo crea. Cuando llega su fecha, el responsable recibe una notificación.',
  })
  @ApiCreatedResponse({ type: FollowUpDto })
  @ApiNotFoundResponse({ description: 'El lead no existe en este proyecto' })
  create(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: CreateFollowUpDto,
  ): Promise<FollowUpDto> {
    return this.createFollowUp.execute({
      actorUserId: userId,
      projectId,
      leadId,
      type: dto.type ?? FollowUpType.TASK,
      title: dto.title,
      notes: dto.notes,
      dueAt: new Date(dto.dueAt),
      assignedUserId: dto.assignedUserId,
    });
  }

  @Get('follow-ups')
  @RequirePermission(Permission.LEAD_READ)
  @ApiOperation({
    summary: 'Agenda de seguimientos',
    description:
      'Filtros: leadId (pestaña Seguimiento del lead), status, assignedUserId, dueFrom/dueTo, overdue. Paginado.',
  })
  @ApiOkResponse({ type: PaginatedFollowUpsDto })
  async list(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListFollowUpsQueryDto,
  ): Promise<PaginatedFollowUpsDto> {
    const result = await this.listFollowUps.execute({
      actorUserId: userId,
      projectId,
      leadId: query.leadId,
      status: query.status,
      assignedUserId: query.assignedUserId,
      dueFrom: toDate(query.dueFrom),
      dueTo: toDate(query.dueTo),
      overdue: query.overdue,
      page: query.page,
      limit: query.limit,
    });
    return {
      data: result.followUps,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  }

  @Get('follow-ups/:followUpId')
  @ApiOperation({ summary: 'Ver un seguimiento' })
  @RequirePermission(Permission.LEAD_READ)
  @ApiOkResponse({ type: FollowUpDto })
  @ApiNotFoundResponse()
  get(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('followUpId', ParseUUIDPipe) followUpId: string,
  ): Promise<FollowUpDto> {
    return this.getFollowUp.execute({
      actorUserId: userId,
      projectId,
      followUpId,
    });
  }

  @Patch('follow-ups/:followUpId')
  @RequirePermission(Permission.LEAD_UPDATE)
  @ApiOperation({
    summary: 'Editar, completar o cancelar un seguimiento',
    description:
      'status: DONE lo completa (con outcome opcional) y actualiza el último contacto del lead; CANCELLED lo cancela. Solo se modifican seguimientos PENDING (409 si no).',
  })
  @ApiOkResponse({ type: FollowUpDto })
  @ApiConflictResponse({ description: 'Ya estaba completado o cancelado' })
  update(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('followUpId', ParseUUIDPipe) followUpId: string,
    @Body() dto: UpdateFollowUpDto,
  ): Promise<FollowUpDto> {
    return this.updateFollowUp.execute({
      actorUserId: userId,
      projectId,
      followUpId,
      type: dto.type,
      title: dto.title,
      notes: dto.notes,
      dueAt: toDate(dto.dueAt),
      assignedUserId: dto.assignedUserId,
      status: dto.status,
      outcome: dto.outcome,
    });
  }

  @Delete('follow-ups/:followUpId')
  @ApiOperation({ summary: 'Borrar un seguimiento' })
  @RequirePermission(Permission.LEAD_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async remove(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('followUpId', ParseUUIDPipe) followUpId: string,
  ): Promise<void> {
    await this.deleteFollowUp.execute({
      actorUserId: userId,
      projectId,
      followUpId,
    });
  }
}
