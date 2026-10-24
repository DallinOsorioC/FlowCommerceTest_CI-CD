import type { SafeUser } from '@flowcommerce/types';

export interface SessionInfo {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface AuthenticatedSession {
  user: SafeUser;
  session: SessionInfo;
}
