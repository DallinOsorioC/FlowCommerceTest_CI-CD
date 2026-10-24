import {
  Controller,
  Get,
  Inject,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SESSION_MANAGER } from '../../application/ports/session-manager';
import type { SessionManager } from '../../application/ports/session-manager';
import { SessionDto } from '../dto/session.dto';

// Quién soy según el token. El login y el logout los hace el frontend con
// supabase-js: aquí no hay cookie que crear ni borrar.
@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class SessionController {
  constructor(
    @Inject(SESSION_MANAGER)
    private readonly sessionManager: SessionManager,
  ) {}

  // Devuelve la sesión activa o 401 si el token falta o no es válido.
  @Get('session')
  @ApiOperation({
    summary: 'Sesión actual',
    description:
      'Requiere Authorization: Bearer <access token de Supabase>. Crea el perfil local la primera vez.',
  })
  @ApiOkResponse({ type: SessionDto })
  async getSession(@Req() req: Request): Promise<SessionDto> {
    const session = await this.sessionManager.getSession(this.toHeaders(req));

    if (!session) {
      throw new UnauthorizedException('No active session');
    }

    return {
      user: session.user,
      session: {
        id: session.session.id,
        userId: session.session.userId,
        expiresAt: session.session.expiresAt,
      },
    };
  }

  private toHeaders(req: Request): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }
    return headers;
  }
}
