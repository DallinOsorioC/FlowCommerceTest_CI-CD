import type { Invitation, InvitationRole } from './invitation';

export interface CreateInvitationInput {
  projectId: string;
  email: string;
  role: InvitationRole;
  tokenHash: string;
  invitedByUserId: string;
  expiresAt: Date;
}

export interface InvitationsRepository {
  // Revoca la pendiente anterior para ese correo (si hay) y crea la nueva,
  // en una transacción: "reenviar" invalida el enlace viejo.
  replacePending(input: CreateInvitationInput): Promise<Invitation>;
  listPendingByProject(projectId: string): Promise<Invitation[]>;
  findByTokenHash(tokenHash: string): Promise<Invitation | null>;
  // false si no existe en el proyecto o ya no estaba pendiente.
  revokeInProject(id: string, projectId: string): Promise<boolean>;
  // Atómico: marca ACCEPTED solo si sigue PENDING y crea la membresía.
  // 'accepted' | 'not_pending' | 'already_member'.
  accept(
    invitationId: string,
    userId: string,
    at: Date,
  ): Promise<'accepted' | 'not_pending' | 'already_member'>;
}

export const INVITATIONS_REPOSITORY = Symbol('INVITATIONS_REPOSITORY');
