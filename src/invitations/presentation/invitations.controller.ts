import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../authorization/presentation/decorators/require-permission.decorator';
import { THROTTLE } from '../../common/config/throttle';
import {
  AcceptInvitationUseCase,
  InviteMemberUseCase,
  ListInvitationsUseCase,
  PreviewInvitationUseCase,
  RevokeInvitationUseCase,
} from '../application/invitations.use-cases';
import {
  AcceptedInvitationDto,
  CreateInvitationDto,
  InvitationDto,
  InvitationPreviewDto,
  InvitationTokenDto,
} from './invitation.dto';

// Invitaciones de un proyecto (pantalla Configuración → Usuarios).
@ApiTags('invitations')
@Controller({ path: 'projects/:projectId/invitations', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class ProjectInvitationsController {
  constructor(
    private readonly inviteMember: InviteMemberUseCase,
    private readonly listInvitations: ListInvitationsUseCase,
    private readonly revokeInvitation: RevokeInvitationUseCase,
  ) {}

  @Post()
  @RequirePermission(Permission.MEMBER_INVITE)
  @ApiOperation({
    summary: 'Invitar por correo',
    description:
      'Envía un enlace (vence en 7 días). Volver a invitar al mismo correo reemplaza la invitación anterior (reenviar). Respeta la jerarquía de roles.',
  })
  @ApiCreatedResponse({ type: InvitationDto })
  @ApiConflictResponse({ description: 'Ese usuario ya es miembro' })
  create(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateInvitationDto,
  ): Promise<InvitationDto> {
    return this.inviteMember.execute({
      actorUserId: userId,
      projectId,
      email: dto.email,
      role: dto.role,
    });
  }

  @Get()
  @RequirePermission(Permission.MEMBER_READ)
  @ApiOperation({ summary: 'Invitaciones pendientes (no vencidas)' })
  @ApiOkResponse({ type: [InvitationDto] })
  list(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<InvitationDto[]> {
    return this.listInvitations.execute({ actorUserId: userId, projectId });
  }

  @Delete(':invitationId')
  @RequirePermission(Permission.MEMBER_INVITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revocar una invitación pendiente' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async revoke(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    await this.revokeInvitation.execute({
      actorUserId: userId,
      projectId,
      invitationId,
    });
  }
}

// Lado de quien recibe la invitación. El token va en el BODY (no en la URL)
// para que no quede en logs de servidores ni en el historial.
@ApiTags('invitations')
@Controller({ path: 'invitations', version: '1' })
export class PublicInvitationsController {
  constructor(
    private readonly previewInvitation: PreviewInvitationUseCase,
    private readonly acceptInvitation: AcceptInvitationUseCase,
  ) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle(THROTTLE.invitation)
  @ApiOperation({
    summary: 'Ver una invitación (público)',
    description:
      'Para la pantalla "Te invitaron a…". 404 si no existe, se usó, se revocó o venció.',
  })
  @ApiOkResponse({ type: InvitationPreviewDto })
  preview(@Body() dto: InvitationTokenDto): Promise<InvitationPreviewDto> {
    return this.previewInvitation.execute(dto.token);
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard, AuthenticatedGuard)
  @Throttle(THROTTLE.invitation)
  @ApiOperation({
    summary: 'Aceptar una invitación',
    description:
      'Requiere sesión con el MISMO correo invitado. Crea la membresía con el rol de la invitación.',
  })
  @ApiOkResponse({ type: AcceptedInvitationDto })
  @ApiForbiddenResponse({ description: 'La sesión es de otro correo' })
  @ApiConflictResponse({ description: 'Ya usada o ya eres miembro' })
  accept(
    @CurrentUserId() userId: string,
    @Body() dto: InvitationTokenDto,
  ): Promise<AcceptedInvitationDto> {
    return this.acceptInvitation.execute({
      actorUserId: userId,
      token: dto.token,
    });
  }
}
