import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt } from 'drizzle-orm';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import {
  memberships,
  projectInvitations,
  type ProjectInvitationRow,
} from '../../../db/schema';
import type {
  Invitation,
  InvitationRole,
  InvitationStatus,
} from '../../domain/invitation';
import type {
  CreateInvitationInput,
  InvitationsRepository,
} from '../../domain/invitations.repository';

@Injectable()
export class DrizzleInvitationsRepository implements InvitationsRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async replacePending(input: CreateInvitationInput): Promise<Invitation> {
    return this.db.transaction(async (tx) => {
      await tx
        .update(projectInvitations)
        .set({ status: 'REVOKED' })
        .where(
          and(
            eq(projectInvitations.projectId, input.projectId),
            eq(projectInvitations.email, input.email),
            eq(projectInvitations.status, 'PENDING'),
          ),
        );
      const [row] = await tx
        .insert(projectInvitations)
        .values(input)
        .returning();
      return this.toInvitation(row);
    });
  }

  async listPendingByProject(projectId: string): Promise<Invitation[]> {
    const rows = await this.db
      .select()
      .from(projectInvitations)
      .where(
        and(
          eq(projectInvitations.projectId, projectId),
          eq(projectInvitations.status, 'PENDING'),
          gt(projectInvitations.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(projectInvitations.createdAt))
      .limit(100);
    return rows.map((row) => this.toInvitation(row));
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    const [row] = await this.db
      .select()
      .from(projectInvitations)
      .where(eq(projectInvitations.tokenHash, tokenHash));
    return row ? this.toInvitation(row) : null;
  }

  async revokeInProject(id: string, projectId: string): Promise<boolean> {
    const updated = await this.db
      .update(projectInvitations)
      .set({ status: 'REVOKED' })
      .where(
        and(
          eq(projectInvitations.id, id),
          eq(projectInvitations.projectId, projectId),
          eq(projectInvitations.status, 'PENDING'),
        ),
      )
      .returning({ id: projectInvitations.id });
    return updated.length > 0;
  }

  // La invitación pasa a ACCEPTED solo si SIGUE pendiente (WHERE status):
  // aceptar dos veces a la vez crea una sola membresía.
  async accept(
    invitationId: string,
    userId: string,
    at: Date,
  ): Promise<'accepted' | 'not_pending' | 'already_member'> {
    return this.db.transaction(async (tx) => {
      const [invitation] = await tx
        .update(projectInvitations)
        .set({ status: 'ACCEPTED', acceptedAt: at, acceptedByUserId: userId })
        .where(
          and(
            eq(projectInvitations.id, invitationId),
            eq(projectInvitations.status, 'PENDING'),
          ),
        )
        .returning();
      if (!invitation) {
        return 'not_pending';
      }
      const inserted = await tx
        .insert(memberships)
        .values({
          userId,
          projectId: invitation.projectId,
          role: invitation.role as InvitationRole,
        })
        .onConflictDoNothing()
        .returning({ id: memberships.id });
      return inserted.length > 0 ? 'accepted' : 'already_member';
    });
  }

  private toInvitation(row: ProjectInvitationRow): Invitation {
    return {
      id: row.id,
      projectId: row.projectId,
      email: row.email,
      role: row.role as InvitationRole,
      status: row.status as InvitationStatus,
      invitedByUserId: row.invitedByUserId,
      expiresAt: row.expiresAt,
      acceptedAt: row.acceptedAt,
      creadoEn: row.createdAt,
    };
  }
}
