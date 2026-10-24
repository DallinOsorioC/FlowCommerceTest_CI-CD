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
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { LeadStage, Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import { buildPaginationMeta } from '../../../common/dto/pagination.dto';
import { CreateLeadUseCase } from '../../application/use-cases/create-lead.use-case';
import { DeleteLeadUseCase } from '../../application/use-cases/delete-lead.use-case';
import { GetLeadUseCase } from '../../application/use-cases/get-lead.use-case';
import { ListLeadsUseCase } from '../../application/use-cases/list-leads.use-case';
import { UpdateLeadUseCase } from '../../application/use-cases/update-lead.use-case';
import { CreateLeadDto } from '../../presentation/dto/create-lead.dto';
import { LeadDto } from '../../presentation/dto/lead.dto';
import { ListLeadsQueryDto } from '../../presentation/dto/list-leads-query.dto';
import { PaginatedLeadsDto } from '../../presentation/dto/paginated-leads.dto';
import { UpdateLeadDto } from '../../presentation/dto/update-lead.dto';

// undefined/null → null; un ISO-8601 ya validado por el DTO → Date.
const toDateOrNull = (value: string | null | undefined): Date | null =>
  value ? new Date(value) : null;

// Embudo comercial del tenant. Los guards de clase fijan autenticación y
// control de acceso por proyecto; cada handler exige su permiso con
// @RequirePermission. El projectId se toma siempre de la ruta.
@ApiTags('leads')
@Controller({ path: 'projects/:projectId/leads', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
@ApiUnauthorizedResponse({ description: 'Sin sesión activa' })
@ApiForbiddenResponse({
  description: 'Sin el permiso requerido en el proyecto (o proyecto ajeno)',
})
export class LeadsController {
  constructor(
    private readonly createLeadUseCase: CreateLeadUseCase,
    private readonly listLeadsUseCase: ListLeadsUseCase,
    private readonly getLeadUseCase: GetLeadUseCase,
    private readonly updateLeadUseCase: UpdateLeadUseCase,
    private readonly deleteLeadUseCase: DeleteLeadUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear un lead' })
  @RequirePermission(Permission.LEAD_CREATE)
  @ApiCreatedResponse({ type: LeadDto })
  @ApiBadRequestResponse({
    description: 'Body inválido o responsable que no es miembro del proyecto',
  })
  @ApiNotFoundResponse({
    description: 'Cliente o producto de interés que no es de este proyecto',
  })
  createLead(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateLeadDto,
  ): Promise<LeadDto> {
    return this.createLeadUseCase
      .execute({
        actorUserId: userId,
        projectId,
        name: dto.name,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        stage: dto.stage ?? LeadStage.NEW,
        score: dto.score ?? 0,
        company: dto.company ?? null,
        contactPosition: dto.contactPosition ?? null,
        source: dto.source ?? null,
        estimatedValue: dto.estimatedValue ?? null,
        notes: dto.notes ?? null,
        assignedUserId: dto.assignedUserId ?? null,
        clientId: dto.clientId ?? null,
        interestProductId: dto.interestProductId ?? null,
        lastContactAt: toDateOrNull(dto.lastContactAt),
      })
      .then((lead) => lead.toLead());
  }

  @Get()
  @ApiOperation({ summary: 'Listar leads' })
  @RequirePermission(Permission.LEAD_READ)
  @ApiOkResponse({ type: PaginatedLeadsDto })
  async listLeads(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListLeadsQueryDto,
  ): Promise<PaginatedLeadsDto> {
    const result = await this.listLeadsUseCase.execute({
      actorUserId: userId,
      projectId,
      stage: query.stage,
      stages: query.stages,
      search: query.search,
      assignedUserId: query.assignedUserId,
      source: query.source,
      clientId: query.clientId,
      createdFrom: query.createdFrom ? new Date(query.createdFrom) : undefined,
      createdTo: query.createdTo ? new Date(query.createdTo) : undefined,
      sortBy: query.sortBy,
      order: query.order,
      page: query.page,
      limit: query.limit,
    });

    return {
      data: result.leads.map((lead) => lead.toLead()),
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  }

  // Un lead de otro tenant responde 404, igual que uno inexistente.
  @Get(':leadId')
  @ApiOperation({ summary: 'Ver un lead' })
  @RequirePermission(Permission.LEAD_READ)
  @ApiOkResponse({ type: LeadDto })
  getLead(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ): Promise<LeadDto> {
    return this.getLeadUseCase
      .execute({ actorUserId: userId, projectId, leadId })
      .then((lead) => lead.toLead());
  }

  // PATCH parcial: solo se tocan los campos presentes en el body. Un lead de
  // otro tenant devuelve 404 y no se modifica nada.
  @Patch(':leadId')
  @ApiOperation({ summary: 'Editar un lead o cambiar su etapa' })
  @RequirePermission(Permission.LEAD_UPDATE)
  @ApiOkResponse({ type: LeadDto })
  @ApiBadRequestResponse({
    description: 'Body inválido o responsable que no es miembro del proyecto',
  })
  @ApiNotFoundResponse({
    description: 'Lead, cliente o producto que no es de este proyecto',
  })
  updateLead(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: UpdateLeadDto,
  ): Promise<LeadDto> {
    return this.updateLeadUseCase
      .execute({
        actorUserId: userId,
        projectId,
        leadId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        stage: dto.stage,
        score: dto.score,
        company: dto.company,
        contactPosition: dto.contactPosition,
        source: dto.source,
        estimatedValue: dto.estimatedValue,
        notes: dto.notes,
        assignedUserId: dto.assignedUserId,
        clientId: dto.clientId,
        interestProductId: dto.interestProductId,
        lastContactAt:
          dto.lastContactAt === undefined
            ? undefined
            : toDateOrNull(dto.lastContactAt),
      })
      .then((lead) => lead.toLead());
  }

  // El borrado es definitivo y arrastra en cascada las cotizaciones y los
  // mensajes del lead. LEAD_DELETE solo lo tienen ADMIN y OWNER.
  @Delete(':leadId')
  @ApiOperation({ summary: 'Borrar un lead' })
  @RequirePermission(Permission.LEAD_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Lead eliminado' })
  async deleteLead(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ): Promise<void> {
    await this.deleteLeadUseCase.execute({
      actorUserId: userId,
      projectId,
      leadId,
    });
  }
}
