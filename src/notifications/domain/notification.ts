import type {
  NotificationEntity,
  NotificationType,
  Role,
} from '@flowcommerce/types';

// Notificación tal como la ve su destinatario (campana del frontend).
export interface NotificationView {
  id: string;
  projectId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  entityType: NotificationEntity | null;
  entityId: string | null;
  readAt: Date | null;
  creadoEn: Date;
}

// Lo que pide quien publica un aviso. Los destinatarios pueden ser usuarios
// concretos, todos los miembros con ciertos roles, o ambos.
export interface NotifyInput {
  projectId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  entity?: { type: NotificationEntity; id: string };
  recipients: {
    userIds?: ReadonlyArray<string | null | undefined>;
    roles?: readonly Role[];
  };
  // Quien provocó el evento no se avisa a sí mismo.
  excludeUserId?: string | null;
  // Avisos automáticos: evita repetirlos (uno por usuario y clave).
  dedupeKey?: string;
}
