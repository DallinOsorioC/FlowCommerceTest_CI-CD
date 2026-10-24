import type { SafeUser, Role } from '@flowcommerce/types';
import type { SessionInfo } from '../domain/session.types';

// Extiende el Request de Express con la sesión y el contexto autorizado
// (userId, projectId y rol) que fijan los guards durante la petición.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SafeUser;
      session?: SessionInfo;
      userId?: string;
      projectId?: string;
      userProjectRole?: Role | null;
    }
  }
}

export {};
