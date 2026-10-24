import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  REQUIRED_PERMISSIONS_KEY,
  type RequiredPermissions,
} from '../decorators/require-permission.decorator';
import { AuthorizationService } from '../../application/services/authorization.service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Autoriza el acceso a una ruta con ámbito de proyecto.
// - Se ejecuta DESPUÉS de `AuthenticatedGuard` (que define `request.userId`).
// - La ruta debe declarar `@RequirePermission(...)`.
// - El proyecto se resuelve desde `request.params.projectId`.
// En caso de éxito fija `request.projectId`/`request.userProjectRole` para que
// controllers y use-cases confíen en el contexto autorizado sin re-verificar.
@Injectable()
export class ProjectPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { userId?: string }>();

    const permissions = this.reflector.getAllAndOverride<
      RequiredPermissions | undefined
    >(REQUIRED_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    const projectId = this.resolveProjectId(request);

    // Fail-closed en rutas con ámbito de proyecto: una ruta bajo
    // `:projectId` que no declara permisos es un error de implementación y no
    // debe quedar abierta a cualquier usuario autenticado. Solo las rutas sin
    // contexto de proyecto (p.ej. POST /projects, GET /projects/my) atraviesan
    // el guard sin permiso explícito.
    if (!permissions || permissions.length === 0) {
      if (projectId) {
        throw new ForbiddenException(
          'Insufficient permissions for this project',
        );
      }
      return true;
    }

    const { userId } = request;
    if (!userId) {
      throw new UnauthorizedException('No active session');
    }

    if (!projectId) {
      throw new ForbiddenException('Project context is required');
    }

    // El guard se ejecuta ANTES de los pipes de ruta (ParseUUIDPipe), así que
    // un :projectId malformado llegaría a la base como literal uuid inválido y
    // explotaría en un 500. Rechazarlo aquí con el mismo 403 genérico no filtra
    // nada y devuelve un error limpio.
    if (!UUID_RE.test(projectId)) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    const decision = await this.authorizationService.decide(
      userId,
      permissions,
      projectId,
    );

    if (!decision.allowed) {
      // Do not reveal whether the project exists or which permission is
      // missing: the caller has no authorization in this project context.
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    request.projectId = projectId;
    request.userProjectRole = decision.role ?? null;

    return true;
  }

  // Extrae el projectId del parámetro de ruta (por defecto `projectId`).
  private resolveProjectId(
    request: Request,
    param = 'projectId',
  ): string | undefined {
    const params = request.params as Record<string, string | undefined>;
    return params?.[param];
  }
}
