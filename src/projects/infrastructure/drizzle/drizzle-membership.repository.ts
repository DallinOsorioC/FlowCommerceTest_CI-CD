import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { Role, UserMembership } from '@flowcommerce/types';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import {
  clients,
  leads,
  memberships,
  type MembershipRow,
} from '../../../db/schema';
import { MembershipEntity } from '../../domain/entities/membership.entity';
import { avatarUrlFor } from '../../../users/domain/entities/user.entity';
import type {
  CreateMembershipInput,
  MembershipRepository,
  ProjectMember,
  RemoveMemberResult,
  RoleChangeResult,
} from '../../domain/repositories/membership.repository';

interface MembershipWithProject extends MembershipRow {
  project: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

@Injectable()
export class DrizzleMembershipRepository implements MembershipRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  // El projectId va SIEMPRE en el WHERE: una membership de otro proyecto
  // devuelve null, igual que una inexistente.
  async findByIdInProject(
    id: string,
    projectId: string,
  ): Promise<MembershipEntity | null> {
    const row = await this.db.query.memberships.findFirst({
      where: and(eq(memberships.id, id), eq(memberships.projectId, projectId)),
    });

    return row ? this.mapToEntity(row) : null;
  }

  async findMemberByIdInProject(
    id: string,
    projectId: string,
  ): Promise<ProjectMember | null> {
    const row = await this.db.query.memberships.findFirst({
      where: and(eq(memberships.id, id), eq(memberships.projectId, projectId)),
      with: {
        user: {
          columns: { name: true, email: true },
        },
      },
    });

    if (!row) {
      return null;
    }

    const member = row;
    return {
      membership: this.mapToEntity(row),
      userId: row.userId,
      name: member.user.name,
      email: member.user.email,
    };
  }

  async findByUserAndProject(
    userId: string,
    projectId: string,
  ): Promise<MembershipEntity | null> {
    const row = await this.db.query.memberships.findFirst({
      where: and(
        eq(memberships.userId, userId),
        eq(memberships.projectId, projectId),
      ),
    });

    return row ? this.mapToEntity(row) : null;
  }

  // Lista los miembros de un proyecto con nombre, email, teléfono, puesto y
  // foto del usuario (una sola consulta).
  async findMembersByProject(projectId: string): Promise<ProjectMember[]> {
    const rows = await this.db.query.memberships.findMany({
      where: eq(memberships.projectId, projectId),
      with: {
        user: {
          columns: {
            name: true,
            email: true,
            phone: true,
            position: true,
            avatarKey: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      membership: this.mapToEntity(row),
      userId: row.userId,
      name: row.user.name,
      email: row.user.email,
      phone: row.user.phone,
      position: row.user.position,
      avatarUrl: avatarUrlFor(row.userId, row.user.avatarKey),
    }));
  }

  async findMyProjects(userId: string): Promise<UserMembership[]> {
    const rows = await this.db.query.memberships.findMany({
      where: eq(memberships.userId, userId),
      with: {
        project: true,
      },
    });

    return (rows as MembershipWithProject[]).map((row) => ({
      project: {
        id: row.project.id,
        name: row.project.name,
        slug: row.project.slug,
        description: row.project.description,
        creadoEn: row.project.createdAt,
        actualizadoEn: row.project.updatedAt,
      },
      role: row.role as Role,
    }));
  }

  async create(input: CreateMembershipInput): Promise<MembershipEntity> {
    const [row] = await this.db
      .insert(memberships)
      .values({
        userId: input.userId,
        projectId: input.projectId,
        role: input.role,
      })
      .returning();

    return this.mapToEntity(row);
  }

  // Protección del último OWNER sin carreras:
  //   1. SELECT ... FOR UPDATE de los OWNER del proyecto (siempre en el mismo
  //      orden, por id, para no provocar interbloqueos).
  //   2. SELECT ... FOR UPDATE de la membership objetivo.
  //   3. Decidir y escribir dentro de la misma transacción.
  // Si A degrada a B y B degrada a A a la vez, la segunda transacción espera
  // el bloqueo de la primera; al continuar vuelve a leer las filas y ya ve un
  // solo OWNER, así que responde 'last_owner'. Nunca quedan las dos aplicadas.
  async updateRoleInProject(
    id: string,
    projectId: string,
    role: Role,
  ): Promise<RoleChangeResult> {
    return this.db.transaction(async (tx) => {
      const locked = await this.lockOwnersAndTarget(tx, id, projectId);
      if (!locked) {
        return { status: 'not_found' } as const;
      }
      if (
        locked.target.role === 'OWNER' &&
        role !== 'OWNER' &&
        locked.ownerCount <= 1
      ) {
        return { status: 'last_owner' } as const;
      }

      const [row] = await tx
        .update(memberships)
        .set({ role })
        .where(
          and(eq(memberships.id, id), eq(memberships.projectId, projectId)),
        )
        .returning();

      return { status: 'ok', membership: this.mapToEntity(row) } as const;
    });
  }

  async deleteInProject(
    id: string,
    projectId: string,
  ): Promise<RemoveMemberResult> {
    return this.db.transaction(async (tx) => {
      const locked = await this.lockOwnersAndTarget(tx, id, projectId);
      if (!locked) {
        return 'not_found';
      }
      if (locked.target.role === 'OWNER' && locked.ownerCount <= 1) {
        return 'last_owner';
      }

      // Quien sale del equipo deja de ser responsable de leads y clientes de
      // ESTE proyecto. project_id va en el WHERE: en otros proyectos donde
      // sigue siendo miembro no se toca nada.
      const userId = locked.target.userId;
      await tx
        .update(leads)
        .set({ assignedUserId: null })
        .where(
          and(eq(leads.projectId, projectId), eq(leads.assignedUserId, userId)),
        );
      await tx
        .update(clients)
        .set({ assignedUserId: null })
        .where(
          and(
            eq(clients.projectId, projectId),
            eq(clients.assignedUserId, userId),
          ),
        );

      await tx
        .delete(memberships)
        .where(
          and(eq(memberships.id, id), eq(memberships.projectId, projectId)),
        );
      return 'deleted';
    });
  }

  private async lockOwnersAndTarget(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    id: string,
    projectId: string,
  ): Promise<{ target: MembershipRow; ownerCount: number } | null> {
    const owners = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.projectId, projectId),
          eq(memberships.role, 'OWNER'),
        ),
      )
      .orderBy(asc(memberships.id))
      .for('update');

    const [target] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.id, id), eq(memberships.projectId, projectId)))
      .for('update');

    return target ? { target, ownerCount: owners.length } : null;
  }

  // Cuenta los OWNER del proyecto; evita que se demote o elimine al último.
  async countOwners(projectId: string): Promise<number> {
    const result = await this.db
      .select({ count: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.projectId, projectId),
          eq(memberships.role, 'OWNER'),
        ),
      );

    return result.length;
  }

  private mapToEntity(row: MembershipRow): MembershipEntity {
    return new MembershipEntity(
      row.id,
      row.userId,
      row.projectId,
      row.role as Role,
      row.createdAt,
      row.updatedAt,
    );
  }
}
