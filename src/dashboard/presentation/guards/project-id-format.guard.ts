import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

// Mismo patrón que usa ProjectPermissionGuard para considerar válido un id.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rechaza con 400 un :projectId que no es un UUID.
//
// Los guards se ejecutan ANTES que los pipes, así que el ParseUUIDPipe de la
// ruta nunca llega a correr: el ProjectPermissionGuard compartido responde 403
// a un id malformado. El contrato del Dashboard pide 400 para ese caso, así que
// este guard se coloca entre AuthenticatedGuard y ProjectPermissionGuard, solo
// en este controller (no se toca el guard compartido).
//
// No rompe el anti-enumeración: un string que no es UUID no puede identificar
// ningún proyecto, así que el 400 no revela nada. Proyectos inexistentes y
// ajenos siguen recibiendo el mismo 403 uniforme del ProjectPermissionGuard.
@Injectable()
export class ProjectIdFormatGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const params = request.params as Record<string, string | undefined>;
    const projectId = params?.projectId;

    if (projectId !== undefined && !UUID_RE.test(projectId)) {
      throw new BadRequestException('Validation failed (uuid is expected)');
    }

    return true;
  }
}
