import type {
  NotificationEntity,
  NotificationType,
  Role,
} from '@flowcommerce/types';
import type { NotificationView } from './notification';

export interface NewNotification {
  projectId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  entityType: NotificationEntity | null;
  entityId: string | null;
  dedupeKey: string | null;
}

export interface ListNotificationsFilter {
  unread?: boolean;
  // Cualquiera de estos tipos. Lista vacía = nada coincide.
  types?: NotificationType[];
  page?: number;
  limit?: number;
}

// Siempre acotado por (projectId, userId): nadie ve ni marca notificaciones
// de otra persona ni de otro proyecto.
export interface NotificationsRepository {
  // Inserta varias; las que repiten (userId, dedupeKey) se ignoran.
  createMany(items: readonly NewNotification[]): Promise<number>;
  // Usuarios miembros del proyecto con alguno de esos roles.
  findMemberIdsByRoles(
    projectId: string,
    roles: readonly Role[],
  ): Promise<string[]>;
  // De esos usuarios, cuáles son miembros del proyecto (descarta ex miembros).
  filterMembers(
    projectId: string,
    userIds: readonly string[],
  ): Promise<string[]>;
  listForUser(
    projectId: string,
    userId: string,
    filter: ListNotificationsFilter,
  ): Promise<{ notifications: NotificationView[]; total: number }>;
  countUnread(projectId: string, userId: string): Promise<number>;
  // false si no existe para ese usuario en ese proyecto.
  markRead(
    id: string,
    projectId: string,
    userId: string,
    at: Date,
  ): Promise<boolean>;
  markAllRead(projectId: string, userId: string, at: Date): Promise<number>;
}

export const NOTIFICATIONS_REPOSITORY = Symbol('NOTIFICATIONS_REPOSITORY');
