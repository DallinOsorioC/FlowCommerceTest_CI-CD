import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';

export interface SupabaseClaims {
  // Id del usuario en Supabase Auth: es también users.id en esta base.
  userId: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  sessionId: string;
  expiresAt: Date;
}

// Verifica el access token que emite Supabase Auth (JWT).
//
//   - Proyectos con claves asimétricas (por defecto en los nuevos): ES256 o
//     RS256, con las claves públicas de
//     <SUPABASE_URL>/auth/v1/.well-known/jwks.json (jose las cachea).
//   - Proyectos con el secreto compartido heredado: HS256 con
//     SUPABASE_JWT_SECRET.
//
// Se exige el algoritmo declarado en la cabecera Y que coincida con el tipo
// de clave (así un token «alg: none» o uno HS256 firmado con una clave pública
// no pasan), el emisor del proyecto y la audiencia «authenticated».
@Injectable()
export class SupabaseJwtVerifier {
  private readonly supabaseUrl: string | undefined;
  private readonly sharedSecret: string | undefined;
  private jwks: JWTVerifyGetKey | undefined;

  constructor(
    configService: ConfigService,
    // Solo para pruebas: claves públicas en vez de la descarga de JWKS.
    jwks?: JWTVerifyGetKey,
  ) {
    this.supabaseUrl = configService
      .get<string>('SUPABASE_URL')
      ?.replace(/\/$/, '');
    this.sharedSecret = configService.get<string>('SUPABASE_JWT_SECRET');
    this.jwks = jwks;
  }

  // Devuelve las claims o null si el token no es válido (firma, vencimiento,
  // emisor, audiencia o formato). Nunca lanza por un token malo.
  async verify(token: string): Promise<SupabaseClaims | null> {
    if (!this.supabaseUrl) {
      return null;
    }
    try {
      const { alg } = decodeProtectedHeader(token);
      const options = {
        issuer: `${this.supabaseUrl}/auth/v1`,
        audience: 'authenticated',
      };
      let payload: JWTPayload;
      if (alg === 'HS256') {
        if (!this.sharedSecret) {
          return null;
        }
        ({ payload } = await jwtVerify(
          token,
          new TextEncoder().encode(this.sharedSecret),
          { ...options, algorithms: ['HS256'] },
        ));
      } else if (alg === 'ES256' || alg === 'RS256') {
        ({ payload } = await jwtVerify(token, this.keys(), {
          ...options,
          algorithms: [alg],
        }));
      } else {
        return null;
      }
      return this.toClaims(payload);
    } catch {
      return null;
    }
  }

  private keys(): JWTVerifyGetKey {
    this.jwks ??= createRemoteJWKSet(
      new URL(`${this.supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
    return this.jwks;
  }

  private toClaims(payload: JWTPayload): SupabaseClaims | null {
    const email = payload.email;
    if (
      typeof payload.sub !== 'string' ||
      typeof email !== 'string' ||
      !payload.exp
    ) {
      return null;
    }
    const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
    const name = meta.name ?? meta.full_name;
    return {
      userId: payload.sub,
      email,
      name: typeof name === 'string' && name.trim() ? name.trim() : null,
      emailVerified: meta.email_verified === true,
      sessionId:
        typeof payload.session_id === 'string'
          ? payload.session_id
          : payload.sub,
      expiresAt: new Date(payload.exp * 1000),
    };
  }
}
