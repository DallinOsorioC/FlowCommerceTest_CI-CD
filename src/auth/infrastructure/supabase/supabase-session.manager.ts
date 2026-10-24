import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SafeUser } from '@flowcommerce/types';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/domain/repositories/user.repository';
import type { UserEntity } from '../../../users/domain/entities/user.entity';
import type { SessionManager } from '../../application/ports/session-manager';
import type { AuthenticatedSession } from '../../domain/session.types';
import {
  SupabaseJwtVerifier,
  type SupabaseClaims,
} from './supabase-jwt.verifier';

const UNIQUE_VIOLATION = '23505';

// La sesión es el access token de Supabase Auth en `Authorization: Bearer`.
// El login, el registro y la recuperación de contraseña los hace el frontend
// con supabase-js; aquí solo se comprueba el token y se enlaza con users.
//
// users.id == id del usuario en Supabase. La primera vez que llega un token
// de alguien sin fila local (se registró directo en Supabase) se crea su
// perfil. Si ese correo ya pertenece a OTRO id local, se rechaza: aceptarlo
// permitiría a quien controle un correo en Supabase heredar el perfil ajeno.
@Injectable()
export class SupabaseSessionManager implements SessionManager {
  private readonly logger = new Logger(SupabaseSessionManager.name);

  constructor(
    private readonly verifier: SupabaseJwtVerifier,
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
  ) {}

  async getSession(headers: Headers): Promise<AuthenticatedSession | null> {
    const token = this.bearerToken(headers);
    if (!token) {
      return null;
    }
    const claims = await this.verifier.verify(token);
    if (!claims) {
      return null;
    }
    const user = await this.profileFor(claims);
    if (!user) {
      return null;
    }
    return {
      user: this.toSafeUser(user),
      session: {
        id: claims.sessionId,
        userId: user.id,
        expiresAt: claims.expiresAt,
      },
    };
  }

  private bearerToken(headers: Headers): string | null {
    const header = headers.get('authorization');
    if (!header?.toLowerCase().startsWith('bearer ')) {
      return null;
    }
    return header.slice('bearer '.length).trim() || null;
  }

  private async profileFor(claims: SupabaseClaims): Promise<UserEntity | null> {
    const existing = await this.users.findById(claims.userId);
    if (existing) {
      return existing;
    }
    try {
      return await this.users.create({
        id: claims.userId,
        name: claims.name ?? (claims.email.split('@')[0] || 'Usuario'),
        email: claims.email.toLowerCase(),
      });
    } catch (error) {
      const code =
        (error as { code?: string } | null)?.code ??
        (error as { cause?: { code?: string } } | null)?.cause?.code;
      if (code !== UNIQUE_VIOLATION) {
        throw error;
      }
      // Dos peticiones simultáneas crearon el perfil: gana la primera.
      const winner = await this.users.findById(claims.userId);
      if (!winner) {
        this.logger.warn(
          `Rejected Supabase user ${claims.userId}: its email is already linked to another account`,
        );
      }
      return winner;
    }
  }

  private toSafeUser(user: UserEntity): SafeUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      creadoEn: user.creadoEn,
      actualizadoEn: user.actualizadoEn,
    };
  }
}
