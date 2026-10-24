import { Injectable } from '@nestjs/common';
import {
  ActivityType,
  NotificationEntity,
  NotificationType,
  Role,
  type QuoteStatus,
} from '@flowcommerce/types';
import { ActivityRecorder } from '../../activity/application/activity-recorder';
import { NotificationPublisher } from '../../notifications/application/notification-publisher';
import type { QuoteEntity } from '../domain/entities/quote.entity';

// Etiquetas del frontend para el historial de actividad.
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_APPROVAL: 'Pendiente de aprobación',
  APPROVED: 'Aprobada',
  SENT: 'Enviada',
  ACCEPTED: 'Aceptada',
  PAID: 'Pagada',
  REJECTED: 'Rechazada',
};

// Efectos secundarios de un cambio de estado de una cotización: la
// notificación a quien corresponde y la línea del historial de actividad. Lo
// usan el cambio de estado manual y la confirmación de pago (webhook de
// Pagos), para que ambos caminos avisen igual. Nunca lanza.
@Injectable()
export class QuoteLifecycleEvents {
  constructor(
    private readonly notifications: NotificationPublisher,
    private readonly activity: ActivityRecorder,
  ) {}

  async created(quote: QuoteEntity, actorUserId: string | null): Promise<void> {
    await this.activity.record({
      projectId: quote.projectId,
      actorUserId,
      type: ActivityType.QUOTE_CREATED,
      title:
        quote.origin === 'AI'
          ? `Cotización ${quote.folio} generada por la IA`
          : `Cotización ${quote.folio} creada`,
      leadId: quote.leadId,
      clientId: quote.clientId,
      quoteId: quote.id,
      metadata: { total: quote.total, origin: quote.origin },
    });
  }

  // actorUserId null = el sistema (p. ej. el pago confirmado por Pagos).
  async transitioned(
    quote: QuoteEntity,
    from: QuoteStatus,
    actorUserId: string | null,
  ): Promise<void> {
    await this.activity.record({
      projectId: quote.projectId,
      actorUserId,
      type: ActivityType.QUOTE_STATUS_CHANGED,
      title: `Cotización ${quote.folio}: ${QUOTE_STATUS_LABELS[from]} → ${QUOTE_STATUS_LABELS[quote.status]}`,
      leadId: quote.leadId,
      clientId: quote.clientId,
      quoteId: quote.id,
      metadata: { from, to: quote.status, total: quote.total },
    });
    await this.notifyTransition(quote, from, actorUserId);
  }

  // Avisos del ciclo de vida: pedir aprobación avisa a quienes aprueban
  // (OWNER/ADMIN); el resto de cambios avisan a quien creó la cotización.
  private async notifyTransition(
    quote: QuoteEntity,
    from: QuoteStatus,
    actorUserId: string | null,
  ): Promise<void> {
    const toCreator = { userIds: [quote.createdByUserId] };
    const events: Partial<
      Record<
        QuoteStatus,
        {
          type: NotificationType;
          title: string;
          recipients: typeof toCreator | { roles: Role[] };
        }
      >
    > = {
      PENDING_APPROVAL: {
        type: NotificationType.QUOTE_PENDING_APPROVAL,
        title: `Cotización ${quote.folio} pendiente de aprobación`,
        recipients: { roles: [Role.OWNER, Role.ADMIN] },
      },
      APPROVED: {
        type: NotificationType.QUOTE_APPROVED,
        title: `Tu cotización ${quote.folio} fue aprobada`,
        recipients: toCreator,
      },
      ACCEPTED: {
        type: NotificationType.QUOTE_ACCEPTED,
        title: `El cliente aceptó la cotización ${quote.folio}`,
        recipients: toCreator,
      },
      REJECTED: {
        type: NotificationType.QUOTE_REJECTED,
        title: `El cliente rechazó la cotización ${quote.folio}`,
        recipients: toCreator,
      },
      PAID: {
        type: NotificationType.QUOTE_PAID,
        title: `La cotización ${quote.folio} fue pagada`,
        recipients: toCreator,
      },
    };
    const event =
      quote.status === 'DRAFT' && from === 'PENDING_APPROVAL'
        ? {
            type: NotificationType.QUOTE_RETURNED,
            title: `Tu cotización ${quote.folio} fue devuelta a borrador`,
            recipients: toCreator,
          }
        : events[quote.status];
    if (!event) {
      return;
    }
    await this.notifications.notify({
      projectId: quote.projectId,
      type: event.type,
      title: event.title,
      body: `Total: ${quote.total}`,
      entity: { type: NotificationEntity.QUOTE, id: quote.id },
      recipients: event.recipients,
      excludeUserId: actorUserId,
    });
  }
}
