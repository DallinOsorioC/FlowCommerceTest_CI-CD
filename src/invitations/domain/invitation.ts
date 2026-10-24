import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '@flowcommerce/types';

export type InvitationRole = Exclude<Role, 'OWNER'>;
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

export interface Invitation {
  id: string;
  projectId: string;
  email: string;
  role: InvitationRole;
  status: InvitationStatus;
  invitedByUserId: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  creadoEn: Date;
}

// Vigencia del enlace de invitación.
export const INVITATION_TTL_DAYS = 7;

// El token va SOLO en el enlace del correo (32 bytes aleatorios, base64url).
// En la base se guarda su SHA-256: si alguien leyera la tabla no podría
// aceptar invitaciones ajenas.
export function newInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const isExpiredInvitation = (invitation: Invitation, now: Date) =>
  invitation.expiresAt.getTime() <= now.getTime();
