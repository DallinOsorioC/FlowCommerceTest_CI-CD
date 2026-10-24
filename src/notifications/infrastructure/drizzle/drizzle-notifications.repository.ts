import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  sql,
  type SQL,
} from 'drizzle-orm';
import type {
  NotificationEntity,
  NotificationType,
  Role,
} from '@flowcommerce/types';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import {
  memberships,
  notifications,
  type NotificationRow,
} from '../../../db/schema';
import type { NotificationView } from '../../domain/notification';
import type {
  ListNotificationsFilter,
  NewNotification,
  NotificationsRepository,
} from '../../domain/notifications.repository';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

@Injectable()
export class DrizzleNotificationsRepository implements NotificationsRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  // ON CONFLICT DO NOTHING sobre (user_id, dedupe_key): si el job de
  // recordatorios corre dos veces, el segundo intento no duplica avisos.
  async createMany(items: readonly NewNotification[]): Promise<number> {
    if (items.length === 0) {
      return 0;
    }
    const inserted = await this.db
      .insert(notifications)
      .values([...items])
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    return inserted.length;
  }

  async findMemberIdsByRoles(
    projectId: string,
    roles: readonly Role[],
  ): Promise<string[]> {
    const rows = await this.db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.projectId, projectId),
          inArray(memberships.role, [...roles]),
        ),
      );
    return rows.map((row) => row.userId);
  }

  async filterMembers(
    projectId: string,
    userIds: readonly string[],
  ): Promise<string[]> {
    if (userIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.projectId, projectId),
          inArray(memberships.userId, [...userIds]),
        ),
      );
    return rows.map((row) => row.userId);
  }

  async listForUser(
    projectId: string,
    userId: string,
    filter: ListNotificationsFilter,
  ): Promise<{ notifications: NotificationView[]; total: number }> {
    const conditions: SQL[] = [
      eq(notifications.projectId, projectId),
      eq(notifications.userId, userId),
    ];
    if (filter.unread) {
      conditions.push(isNull(notifications.readAt));
    }
    if (filter.types) {
      conditions.push(
        filter.types.length > 0
          ? inArray(notifications.type, filter.types)
          : sql`false`,
      );
    }
    const where = and(...conditions);
    const limit = Math.min(
      Math.max(filter.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const page = Math.max(filter.page ?? 1, 1);

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ value: count() }).from(notifications).where(where),
    ]);

    return {
      notifications: rows.map((row) => this.toView(row)),
      total: totalRow?.value ?? 0,
    };
  }

  async countUnread(projectId: string, userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.projectId, projectId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
        ),
      );
    return row?.value ?? 0;
  }

  async markRead(
    id: string,
    projectId: string,
    userId: string,
    at: Date,
  ): Promise<boolean> {
    const updated = await this.db
      .update(notifications)
      .set({ readAt: at })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.projectId, projectId),
          eq(notifications.userId, userId),
        ),
      )
      .returning({ id: notifications.id });
    return updated.length > 0;
  }

  async markAllRead(
    projectId: string,
    userId: string,
    at: Date,
  ): Promise<number> {
    const updated = await this.db
      .update(notifications)
      .set({ readAt: at })
      .where(
        and(
          eq(notifications.projectId, projectId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });
    return updated.length;
  }

  private toView(row: NotificationRow): NotificationView {
    return {
      id: row.id,
      projectId: row.projectId,
      type: row.type as NotificationType,
      title: row.title,
      body: row.body,
      entityType: row.entityType as NotificationEntity | null,
      entityId: row.entityId,
      readAt: row.readAt,
      creadoEn: row.createdAt,
    };
  }
}
