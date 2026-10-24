import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permission } from '@flowcommerce/types';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { GetDashboardUseCase } from '../../application/use-cases/get-dashboard.use-case';
import { DashboardDto } from '../dto/dashboard.dto';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { ProjectIdFormatGuard } from '../guards/project-id-format.guard';

// Métricas agregadas del Dashboard del tenant. SOLO lectura: no modifica leads
// ni quotes. Orden de guards: sesión (401) → formato del projectId (400) →
// membresía + PROJECT_READ (403 uniforme para proyectos ajenos o inexistentes).
@ApiTags('dashboard')
@Controller({ path: 'projects/:projectId/dashboard', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectIdFormatGuard, ProjectPermissionGuard)
export class DashboardController {
  constructor(private readonly getDashboardUseCase: GetDashboardUseCase) {}

  @Get()
  @RequirePermission(Permission.PROJECT_READ)
  @ApiOperation({
    summary: 'Dashboard del proyecto',
    description:
      'Vista agregada de leads, cotizaciones, ventas (cotizaciones PAID) y conversión mensual. Sin from/to es histórica. Con ?from&to (intervalo [from, to), máx. 366 días) filtra cotizaciones, ventas y conversión, y añade `periodo` con la comparación contra el período anterior de igual duración. summary y leads.porEstado son siempre la foto actual. Requiere PROJECT_READ.',
  })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiOkResponse({ type: DashboardDto })
  @ApiBadRequestResponse({
    description:
      'projectId no es UUID, from/to inválidos, solo uno de los dos, to <= from o rango > 366 días',
  })
  @ApiUnauthorizedResponse({ description: 'Sin sesión activa' })
  @ApiForbiddenResponse({
    description:
      'Sin PROJECT_READ en el proyecto (incluye proyectos ajenos o inexistentes)',
  })
  getDashboard(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardDto> {
    return this.getDashboardUseCase.execute({
      actorUserId: userId,
      projectId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }
}
