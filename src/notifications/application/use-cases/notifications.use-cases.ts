import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_CATEGORY_TYPES,
  Permission,
  type NotificationCategory,
  type NotificationType,
} from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { NotFoundException } from '../../../common/exceptions/domain.exceptions';
import type { NotificationView } from '../../domain/notification';
import {
  NOTIFICATIONS_REPOSITORY,
  type NotificationsRepository,
} from '../../domain/notifications.repository';

interface ActorInProject {
  actorUserId: string;
  projectId: string;
}

// Casos de uso de la campana. Todos trabajan sobre las notificaciones del
// usuario de la sesión en ese proyecto: no hay forma de leer las de otro.
// Basta PROJECT_READ (cualquier miembro, también VIEWER).

@Injectable()
export class ListNotificationsUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(NOTIFICATIONS_REPOSITORY)
    private readonly repository: NotificationsRepository,
  ) {}

  async execute(
    input: ActorInProject & {
      unread?: boolean;
      type?: NotificationType;
      category?: NotificationCategory;
      page: number;
      limit: number;
    },
  ): Promise<{
    notifications: NotificationView[];
    total: number;
    unreadCount: number;
  }> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PROJECT_READ,
      input.projectId,
    );
    const [page, unreadCount] = await Promise.all([
      this.repository.listForUser(input.projectId, input.actorUserId, {
        unread: input.unread,
        types: this.typesFor(input.type, input.category),
        page: input.page,
        limit: input.limit,
      }),
      this.repository.countUnread(input.projectId, input.actorUserId),
    ]);
    return { ...page, unreadCount };
  }

  // type y category se combinan: gana lo que cumple ambos. Una combinación
  // imposible (category=QUOTE&type=MESSAGE_RECEIVED) da lista vacía.
  private typesFor(
    type?: NotificationType,
    category?: NotificationCategory,
  ): NotificationType[] | undefined {
    const ofCategory = category
      ? [...NOTIFICATION_CATEGORY_TYPES[category]]
      : undefined;
    if (type) {
      return !ofCategory || ofCategory.includes(type) ? [type] : [];
    }
    return ofCategory;
  }
}

@Injectable()
export class CountUnreadNotificationsUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(NOTIFICATIONS_REPOSITORY)
    private readonly repository: NotificationsRepository,
  ) {}

  async execute(input: ActorInProject): Promise<number> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PROJECT_READ,
      input.projectId,
    );
    return this.repository.countUnread(input.projectId, input.actorUserId);
  }
}

@Injectable()
export class MarkNotificationReadUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(NOTIFICATIONS_REPOSITORY)
    private readonly repository: NotificationsRepository,
  ) {}

  // La notificación de otra persona responde 404, igual que una inexistente.
  async execute(input: ActorInProject & { notificationId: string }) {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PROJECT_READ,
      input.projectId,
    );
    const found = await this.repository.markRead(
      input.notificationId,
      input.projectId,
      input.actorUserId,
      new Date(),
    );
    if (!found) {
      throw new NotFoundException('Notification not found');
    }
  }
}

@Injectable()
export class MarkAllNotificationsReadUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(NOTIFICATIONS_REPOSITORY)
    private readonly repository: NotificationsRepository,
  ) {}

  async execute(input: ActorInProject): Promise<number> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PROJECT_READ,
      input.projectId,
    );
    return this.repository.markAllRead(
      input.projectId,
      input.actorUserId,
      new Date(),
    );
  }
}
