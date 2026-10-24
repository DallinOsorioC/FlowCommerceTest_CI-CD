import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  API_KEY_PREFIX,
  API_KEYS_REPOSITORY,
  hashApiKey,
  type ApiKeyPrincipal,
  type ApiKeyScope,
  type ApiKeysRepository,
} from '../../domain/api-key';

const TOUCH_EVERY_MS = 60_000;

const REQUIRED_SCOPE = 'integration:required-scope';

// Marca la ruta con el scope que la API key debe tener.
export const RequireScope = (scope: ApiKeyScope) =>
  SetMetadata(REQUIRED_SCOPE, scope);

type IntegrationRequest = Request & { integration?: ApiKeyPrincipal };

// Autentica a un servicio externo (IA) por su API key:
//   Authorization: Bearer fc_live_...   (o  X-Api-Key: fc_live_...)
// El proyecto sale de la clave, NUNCA de la ruta ni del body: con la clave de
// un proyecto no se puede tocar otro.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly lastTouched = new Map<string, number>();

  constructor(
    @Inject(API_KEYS_REPOSITORY)
    private readonly repository: ApiKeysRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IntegrationRequest>();
    const key = this.extractKey(request);
    if (!key) {
      throw new UnauthorizedException('Missing API key');
    }
    const principal = await this.repository.findActiveByHash(hashApiKey(key));
    if (!principal) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }
    // La clave válida pero sin el scope de la ruta es 403, no 401: se sabe
    // quién es, simplemente no tiene permiso para esto.
    const required = this.reflector.getAllAndOverride<ApiKeyScope | undefined>(
      REQUIRED_SCOPE,
      [context.getHandler(), context.getClass()],
    );
    if (required && !principal.scopes.includes(required)) {
      throw new ForbiddenException(`API key lacks the "${required}" scope`);
    }
    request.integration = principal;
    // "Último uso" para que el admin vea qué claves siguen activas. Si falla,
    // no se bloquea la petición.
    // A lo sumo una escritura por minuto y clave: el dato solo se muestra en
    // la lista del admin, no hace falta un UPDATE por petición.
    const now = Date.now();
    if (now - (this.lastTouched.get(principal.keyId) ?? 0) >= TOUCH_EVERY_MS) {
      this.lastTouched.set(principal.keyId, now);
      void this.repository
        .touchLastUsed(principal.keyId, new Date(now))
        .catch((error: unknown) =>
          this.logger.warn(`Could not update API key usage: ${String(error)}`),
        );
    }
    return true;
  }

  private extractKey(request: Request): string | null {
    const header = request.headers.authorization;
    const bearer =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice('Bearer '.length).trim()
        : null;
    const apiKeyHeader = request.headers['x-api-key'];
    const value =
      bearer ?? (typeof apiKeyHeader === 'string' ? apiKeyHeader.trim() : null);
    return value && value.startsWith(API_KEY_PREFIX) && value.length < 200
      ? value
      : null;
  }
}

// Proyecto y usuario con los que actúa la integración (los fija ApiKeyGuard).
export const CurrentIntegration = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ApiKeyPrincipal => {
    const request = context.switchToHttp().getRequest<IntegrationRequest>();
    if (!request.integration) {
      throw new UnauthorizedException('Missing API key');
    }
    return request.integration;
  },
);
