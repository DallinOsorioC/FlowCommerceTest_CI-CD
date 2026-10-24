import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { memberships, users, type UserRow } from '../../../db/schema';
import { UserEntity } from '../../domain/entities/user.entity';
import type {
  CreateUserInput,
  UpdateUserProfileInput,
  UserRepository,
} from '../../domain/repositories/user.repository';

// Repositorio de usuarios sobre PostgreSQL usando Drizzle ORM.
@Injectable()
export class DrizzleUserRepository implements UserRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    const row = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    return row ? this.mapToEntity(row) : null;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const row = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });

    return row ? this.mapToEntity(row) : null;
  }

  async create(input: CreateUserInput): Promise<UserEntity> {
    const [row] = await this.db
      .insert(users)
      .values({
        ...(input.id ? { id: input.id } : {}),
        name: input.name,
        email: input.email,
      })
      .returning();

    return this.mapToEntity(row);
  }

  async existsByEmail(email: string): Promise<boolean> {
    const row = await this.db.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true },
    });

    return row !== undefined;
  }

  async updateProfile(
    id: string,
    input: UpdateUserProfileInput,
  ): Promise<UserEntity | null> {
    const changes: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) changes.name = input.name;
    if (input.phone !== undefined) changes.phone = input.phone;
    if (input.position !== undefined) changes.position = input.position;

    const [row] = await this.db
      .update(users)
      .set(changes)
      .where(eq(users.id, id))
      .returning();

    return row ? this.mapToEntity(row) : null;
  }

  // SELECT ... FOR UPDATE dentro de la transacción: dos subidas simultáneas
  // no pueden quedarse ambas con la misma "clave anterior".
  async setAvatar(
    id: string,
    avatarKey: string | null,
    imageUrl: string | null,
  ): Promise<{ previousKey: string | null } | undefined> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ avatarKey: users.avatarKey })
        .from(users)
        .where(eq(users.id, id))
        .for('update');
      if (!current) {
        return undefined;
      }
      await tx
        .update(users)
        .set({ avatarKey, image: imageUrl, updatedAt: new Date() })
        .where(eq(users.id, id));
      return { previousKey: current.avatarKey };
    });
  }

  async sharesProjectWith(
    userId: string,
    otherUserId: string,
  ): Promise<boolean> {
    if (userId === otherUserId) {
      return true;
    }
    const other = this.db
      .select({ projectId: memberships.projectId })
      .from(memberships)
      .where(eq(memberships.userId, otherUserId));
    const [row] = await this.db
      .select({ one: sql<number>`1` })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, userId),
          inArray(memberships.projectId, other),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  private mapToEntity(row: UserRow): UserEntity {
    return new UserEntity(
      row.id,
      row.name,
      row.email,
      row.createdAt,
      row.updatedAt,
      row.emailVerified,
      row.phone,
      row.position,
      row.avatarKey,
    );
  }
}
