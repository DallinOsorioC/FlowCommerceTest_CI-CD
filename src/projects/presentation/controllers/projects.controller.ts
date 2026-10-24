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
import { AddMemberUseCase } from '../../application/use-cases/add-member.use-case';
import { ChangeMemberRoleUseCase } from '../../application/use-cases/change-member-role.use-case';
import { CreateProjectUseCase } from '../../application/use-cases/create-project.use-case';
import { ListMyProjectsUseCase } from '../../application/use-cases/list-my-projects.use-case';
import { ListProjectMembersUseCase } from '../../application/use-cases/list-project-members.use-case';
import { GetProjectUseCase } from '../../application/use-cases/get-project.use-case';
import { UpdateProjectUseCase } from '../../application/use-cases/update-project.use-case';
import { RemoveMemberUseCase } from '../../application/use-cases/remove-member.use-case';
import { AddMemberDto } from '../dto/add-member.dto';
import { ChangeMemberRoleDto } from '../dto/change-member-role.dto';
import { CreateProjectDto } from '../dto/create-project.dto';
import { MemberDto } from '../dto/member.dto';
import {
  ProjectDetailDto,
  ProjectDto,
  UserProjectDto,
} from '../dto/project.dto';
import { UpdateProjectDto } from '../dto/update-project.dto';

// Gestión de proyectos y sus miembros. Los guards de clase fijan autenticación
// y control de acceso por proyecto; cada handler exige su permiso con
// @RequirePermission.
@ApiTags('projects')
@ApiUnauthorizedResponse({ description: 'Sin sesión activa' })
@ApiForbiddenResponse({
  description:
    'Sin el permiso requerido en el proyecto (incluye proyectos ajenos o inexistentes)',
})
@Controller({ path: 'projects', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class ProjectsController {
  constructor(
    private readonly createProjectUseCase: CreateProjectUseCase,
    private readonly listMyProjectsUseCase: ListMyProjectsUseCase,
    private readonly listProjectMembersUseCase: ListProjectMembersUseCase,
    private readonly addMemberUseCase: AddMemberUseCase,
    private readonly changeMemberRoleUseCase: ChangeMemberRoleUseCase,
    private readonly removeMemberUseCase: RemoveMemberUseCase,
    private readonly getProjectUseCase: GetProjectUseCase,
    private readonly updateProjectUseCase: UpdateProjectUseCase,
  ) {}

  @ApiOperation({
    summary: 'Crear proyecto (empresa)',
    description:
      'Quien lo crea queda como OWNER. El slug es único y no se puede editar después.',
  })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  @ApiConflictResponse({ description: 'El slug ya existe' })
  @Post()
  @ApiCreatedResponse({ type: ProjectDto })
  createProject(
    @CurrentUserId() userId: string,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectDto> {
    return this.createProjectUseCase.execute({
      ownerUserId: userId,
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
    });
  }

  @ApiOperation({
    summary: 'Mis proyectos',
    description:
      'Proyectos donde el usuario de la sesión es miembro, con su rol en cada uno.',
  })
  @Get('my')
  @ApiOkResponse({ type: UserProjectDto, isArray: true })
  listMyProjects(@CurrentUserId() userId: string): Promise<UserProjectDto[]> {
    return this.listMyProjectsUseCase.execute(userId).then((items) =>
      items.map((item) => ({
        ...item.project,
        role: item.role,
      })),
    );
  }

  @ApiOperation({
    summary: 'Detalle del proyecto',
    description:
      'Incluye el perfil de facturación (billing) y los ajustes de cotización (quoteSettings). Requiere PROJECT_READ.',
  })
  @ApiBadRequestResponse({ description: 'projectId no es un UUID' })
  @Get(':projectId')
  @RequirePermission(Permission.PROJECT_READ)
  @ApiOkResponse({ type: ProjectDetailDto })
  getProject(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectDetailDto> {
    return this.getProjectUseCase.execute({ actorUserId: userId, projectId });
  }

  @ApiOperation({
    summary: 'Editar proyecto y ajustes',
    description:
      'Cambios parciales: lo que no se envía no se toca. Dentro de billing y quoteSettings, null borra el dato. quoteSettings: taxPercent (0–100), folioPrefix, validityDays (1–3650), defaultTerms, currency (ISO 4217). Solo OWNER y ADMIN (PROJECT_UPDATE).',
  })
  @ApiBadRequestResponse({ description: 'Datos fuera de rango o inválidos' })
  @Patch(':projectId')
  @RequirePermission(Permission.PROJECT_UPDATE)
  @ApiOkResponse({ type: ProjectDetailDto })
  updateProject(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectDetailDto> {
    return this.updateProjectUseCase.execute({
      actorUserId: userId,
      projectId,
      name: dto.name,
      description: dto.description,
      billing: dto.billing,
      quoteSettings: dto.quoteSettings,
    });
  }

  @ApiOperation({
    summary: 'Miembros del proyecto',
    description: 'Requiere MEMBER_READ.',
  })
  @Get(':projectId/members')
  @RequirePermission(Permission.MEMBER_READ)
  @ApiOkResponse({ type: MemberDto, isArray: true })
  listMembers(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<MemberDto[]> {
    return this.listProjectMembersUseCase
      .execute({ actorUserId: userId, projectId })
      .then((members) =>
        members.map((member) => ({
          id: member.membership.id,
          userId: member.membership.userId,
          projectId: member.membership.projectId,
          role: member.membership.role,
          name: member.name,
          email: member.email,
          phone: member.phone ?? null,
          position: member.position ?? null,
          avatarUrl: member.avatarUrl ?? null,
        })),
      );
  }

  @ApiOperation({
    summary: 'Agregar miembro',
    description:
      'Agrega a un usuario que ya tiene cuenta. Para invitar por correo a alguien sin cuenta usar POST /projects/:projectId/invitations.',
  })
  @ApiNotFoundResponse({ description: 'El usuario no existe' })
  @ApiConflictResponse({ description: 'El usuario ya es miembro' })
  @Post(':projectId/members')
  @RequirePermission(Permission.MEMBER_INVITE)
  @ApiCreatedResponse({ type: MemberDto })
  addMember(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: AddMemberDto,
  ): Promise<MemberDto> {
    return this.addMemberUseCase
      .execute({
        actorUserId: userId,
        projectId,
        targetUserId: dto.userId,
        role: dto.role,
      })
      .then((member) => ({
        id: member.membership.id,
        userId: member.membership.userId,
        projectId: member.membership.projectId,
        role: member.membership.role,
        name: member.name,
        email: member.email,
      }));
  }

  @ApiOperation({
    summary: 'Cambiar rol de un miembro',
    description:
      'Respeta la jerarquía de roles y nunca deja el proyecto sin OWNER (403), ni siquiera con peticiones simultáneas.',
  })
  @ApiNotFoundResponse({
    description: 'La membresía no existe en este proyecto',
  })
  @Patch(':projectId/members/:membershipId')
  @RequirePermission(Permission.MEMBER_UPDATE_ROLE)
  @ApiOkResponse({ type: MemberDto })
  changeMemberRole(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: ChangeMemberRoleDto,
  ): Promise<MemberDto> {
    return this.changeMemberRoleUseCase
      .execute({
        actorUserId: userId,
        projectId,
        targetMembershipId: membershipId,
        newRole: dto.role,
      })
      .then((member) => ({
        id: member.membership.id,
        userId: member.membership.userId,
        projectId: member.membership.projectId,
        role: member.membership.role,
        name: member.name,
        email: member.email,
      }));
  }

  @ApiOperation({
    summary: 'Quitar miembro',
    description:
      'Nunca deja el proyecto sin OWNER (403). Sus leads y clientes de este proyecto quedan sin responsable.',
  })
  @ApiNoContentResponse({ description: 'Miembro eliminado' })
  @ApiNotFoundResponse({
    description: 'La membresía no existe en este proyecto',
  })
  @Delete(':projectId/members/:membershipId')
  @RequirePermission(Permission.MEMBER_REMOVE)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ): Promise<void> {
    return this.removeMemberUseCase.execute({
      actorUserId: userId,
      projectId,
      targetMembershipId: membershipId,
    });
  }
}
