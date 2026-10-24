import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { SafeUser } from '@flowcommerce/types';
import type { SessionInfo } from '../../domain/session.types';

// Expone el usuario autenticado que fija el AuthenticatedGuard.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SafeUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: SafeUser }>();
    return request.user;
  },
);

// Expone el id del usuario autenticado.
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<{ userId?: string }>();
    return request.userId;
  },
);

// Expone la sesión activa del usuario autenticado.
export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionInfo | undefined => {
    const request = ctx.switchToHttp().getRequest<{ session?: SessionInfo }>();
    return request.session;
  },
);
