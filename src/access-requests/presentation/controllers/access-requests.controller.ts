import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import { ApproveAccessRequestUseCase } from '../../application/use-cases/approve-access-request.use-case';
import { ListAccessRequestsUseCase } from '../../application/use-cases/list-access-requests.use-case';
import { RejectAccessRequestUseCase } from '../../application/use-cases/reject-access-request.use-case';
import { AccessRequestDto } from '../dto/access-request.dto';

// Gestión de solicitudes de acceso por parte de los administradores del
// tenant. Los guards de clase fijan autenticación y control de acceso por
// proyecto; MEMBER_INVITE lo tienen OWNER y ADMIN. El projectId siempre
// viene de la ruta, nunca del body.
@ApiTags('access-requests')
@Controller({ path: 'projects/:projectId/access-requests', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class AccessRequestsController {
  constructor(
    private readonly listAccessRequestsUseCase: ListAccessRequestsUseCase,
    private readonly approveAccessRequestUseCase: ApproveAccessRequestUseCase,
    private readonly rejectAccessRequestUseCase: RejectAccessRequestUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Solicitudes de acceso del proyecto' })
  @RequirePermission(Permission.MEMBER_INVITE)
  @ApiOkResponse({ type: AccessRequestDto, isArray: true })
  listAccessRequests(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<AccessRequestDto[]> {
    return this.listAccessRequestsUseCase
      .execute({ actorUserId: userId, projectId })
      .then((requests) => requests.map((r) => r.toAccessRequest()));
  }

  // Aprobar crea el usuario (si falta), su membership MEMBER y envía un
  // enlace para que establezca contraseña. Nunca se envía la contraseña.
  @Post(':requestId/approve')
  @ApiOperation({ summary: 'Aprobar una solicitud de acceso' })
  @RequirePermission(Permission.MEMBER_INVITE)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AccessRequestDto })
  approveAccessRequest(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ): Promise<AccessRequestDto> {
    return this.approveAccessRequestUseCase
      .execute({ actorUserId: userId, projectId, requestId })
      .then((accessRequest) => accessRequest.toAccessRequest());
  }

  @Post(':requestId/reject')
  @ApiOperation({ summary: 'Rechazar una solicitud de acceso' })
  @RequirePermission(Permission.MEMBER_INVITE)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AccessRequestDto })
  rejectAccessRequest(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ): Promise<AccessRequestDto> {
    return this.rejectAccessRequestUseCase
      .execute({ actorUserId: userId, projectId, requestId })
      .then((accessRequest) => accessRequest.toAccessRequest());
  }
}
