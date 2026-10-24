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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import { buildPaginationMeta } from '../../../common/dto/pagination.dto';
import { CreateClientUseCase } from '../../application/use-cases/create-client.use-case';
import { DeleteClientUseCase } from '../../application/use-cases/delete-client.use-case';
import { GetClientStatsUseCase } from '../../application/use-cases/get-client-stats.use-case';
import { GetClientUseCase } from '../../application/use-cases/get-client.use-case';
import { ListClientsUseCase } from '../../application/use-cases/list-clients.use-case';
import { UpdateClientUseCase } from '../../application/use-cases/update-client.use-case';
import { ClientDto } from '../dto/client.dto';
import { ClientStatsDto } from '../dto/client-stats.dto';
import { CreateClientDto } from '../dto/create-client.dto';
import { ListClientsQueryDto } from '../dto/list-clients-query.dto';
import { PaginatedClientsDto } from '../dto/paginated-clients.dto';
import { UpdateClientDto } from '../dto/update-client.dto';

// Cartera de clientes del tenant. Guards de clase: sesión + permiso por
// proyecto; cada handler declara su permiso. El projectId sale de la ruta.

const NO_STATS = {
  quotesCount: 0,
  paidQuotesCount: 0,
  salesTotal: 0,
  lastActivityAt: null,
};
@ApiTags('clients')
@Controller({ path: 'projects/:projectId/clients', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
@ApiUnauthorizedResponse({ description: 'Sin sesión activa' })
@ApiForbiddenResponse({
  description: 'Sin el permiso requerido en el proyecto (o proyecto ajeno)',
})
export class ClientsController {
  constructor(
    private readonly createClientUseCase: CreateClientUseCase,
    private readonly listClientsUseCase: ListClientsUseCase,
    private readonly getClientUseCase: GetClientUseCase,
    private readonly getClientStatsUseCase: GetClientStatsUseCase,
    private readonly updateClientUseCase: UpdateClientUseCase,
    private readonly deleteClientUseCase: DeleteClientUseCase,
  ) {}

  @Post()
  @RequirePermission(Permission.CLIENT_CREATE)
  @ApiOperation({ summary: 'Crear un cliente' })
  @ApiCreatedResponse({ type: ClientDto })
  @ApiBadRequestResponse({
    description: 'Body inválido o responsable que no es miembro del proyecto',
  })
  @ApiConflictResponse({ description: 'Ya existe un cliente con ese NIT' })
  createClient(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateClientDto,
  ): Promise<ClientDto> {
    return this.createClientUseCase
      .execute({
        actorUserId: userId,
        projectId,
        name: dto.name,
        company: dto.company ?? null,
        contactPosition: dto.contactPosition ?? null,
        taxId: dto.taxId ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        notes: dto.notes ?? null,
        assignedUserId: dto.assignedUserId ?? null,
        sourceLeadId: null,
      })
      .then((client) => client.toClient());
  }

  @Get()
  @RequirePermission(Permission.CLIENT_READ)
  @ApiOperation({ summary: 'Listar clientes' })
  @ApiOkResponse({ type: PaginatedClientsDto })
  async listClients(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListClientsQueryDto,
  ): Promise<PaginatedClientsDto> {
    const result = await this.listClientsUseCase.execute({
      actorUserId: userId,
      projectId,
      search: query.search,
      assignedUserId: query.assignedUserId,
      active: query.active,
      sortBy: query.sortBy,
      order: query.order,
      page: query.page,
      limit: query.limit,
    });

    return {
      data: result.clients.map((client) => ({
        ...client.toClient(),
        ...(result.statsById.get(client.id) ?? NO_STATS),
      })),
      meta: buildPaginationMeta(query.page, query.limit, result.total),
      summary: result.summary,
    };
  }

  @Get(':clientId')
  @RequirePermission(Permission.CLIENT_READ)
  @ApiOperation({ summary: 'Ver la ficha de un cliente' })
  @ApiOkResponse({ type: ClientDto })
  @ApiNotFoundResponse({ description: 'No existe en este proyecto' })
  getClient(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<ClientDto> {
    return this.getClientUseCase
      .execute({ actorUserId: userId, projectId, clientId })
      .then((client) => client.toClient());
  }

  @Get(':clientId/stats')
  @RequirePermission(Permission.CLIENT_READ)
  @ApiOperation({
    summary: 'Estadísticas comerciales del cliente',
    description:
      'Número de cotizaciones y ventas (suma de las cotizaciones PAID).',
  })
  @ApiOkResponse({ type: ClientStatsDto })
  @ApiNotFoundResponse({ description: 'No existe en este proyecto' })
  getClientStats(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<ClientStatsDto> {
    return this.getClientStatsUseCase.execute({
      actorUserId: userId,
      projectId,
      clientId,
    });
  }

  @Patch(':clientId')
  @RequirePermission(Permission.CLIENT_UPDATE)
  @ApiOperation({ summary: 'Editar o desactivar un cliente' })
  @ApiOkResponse({ type: ClientDto })
  @ApiBadRequestResponse({
    description: 'Body inválido o responsable que no es miembro del proyecto',
  })
  @ApiNotFoundResponse({ description: 'No existe en este proyecto' })
  @ApiConflictResponse({ description: 'Ya existe un cliente con ese NIT' })
  updateClient(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: UpdateClientDto,
  ): Promise<ClientDto> {
    return this.updateClientUseCase
      .execute({
        actorUserId: userId,
        projectId,
        clientId,
        name: dto.name,
        company: dto.company,
        contactPosition: dto.contactPosition,
        taxId: dto.taxId,
        email: dto.email,
        phone: dto.phone,
        notes: dto.notes,
        assignedUserId: dto.assignedUserId,
        active: dto.active,
      })
      .then((client) => client.toClient());
  }

  @Delete(':clientId')
  @RequirePermission(Permission.CLIENT_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Borrar un cliente',
    description:
      'Solo si no tiene leads ni cotizaciones asociadas (si no, 409: desactívalo con PATCH active=false).',
  })
  @ApiNoContentResponse({ description: 'Cliente borrado' })
  @ApiNotFoundResponse({ description: 'No existe en este proyecto' })
  @ApiConflictResponse({ description: 'Tiene leads o cotizaciones asociadas' })
  async deleteClient(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<void> {
    await this.deleteClientUseCase.execute({
      actorUserId: userId,
      projectId,
      clientId,
    });
  }
}
