import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SESSION_MANAGER } from '../../application/ports/session-manager';
import type { SessionManager } from '../../application/ports/session-manager';

// Guard base de autenticación: resuelve la sesión desde las cabeceras y
// expone request.user / request.userId. Se combina con el ProjectPermissionGuard.
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(
    @Inject(SESSION_MANAGER)
    private readonly sessionManager: SessionManager,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const session = await this.sessionManager.getSession(
      this.toHeaders(request),
    );

    if (!session) {
      throw new UnauthorizedException('No active session');
    }

    request.user = session.user;
    request.session = session.session;
    request.userId = session.session.userId;

    return true;
  }

  private toHeaders(request: Request): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined) {
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }
    return headers;
  }
}
