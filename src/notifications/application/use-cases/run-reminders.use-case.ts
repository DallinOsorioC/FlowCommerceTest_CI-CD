import { Inject, Injectable } from '@nestjs/common';
import {
  NotificationEntity,
  NotificationType,
  Role,
} from '@flowcommerce/types';
import { NotificationPublisher } from '../notification-publisher';
import {
  REMINDERS_READER,
  type RemindersReader,
} from '../../domain/reminders.reader';

// Lote máximo por ejecución: si hubiera más, salen en la siguiente.
const BATCH = 500;

// Días sin contacto para avisar de un lead abierto («Lead sin actividad»).
export const STALE_LEAD_DAYS = 7;

// Recordatorios automáticos (los dispara el scheduler cada pocos minutos):
//   - FOLLOW_UP_DUE: un seguimiento pendiente llegó a su fecha → aviso al
//     responsable (o a quien lo creó si no tiene responsable).
//   - QUOTE_EXPIRED: una cotización enviada venció sin respuesta → aviso a
//     quien la creó y a OWNER/ADMIN. No cambia su estado (B8: un estado
//     EXPIRED cambiaría el ciclo de vida y es decisión de negocio).
//   - LEAD_STALE: un lead abierto lleva STALE_LEAD_DAYS sin contacto → aviso
//     al responsable (o a OWNER/ADMIN si no tiene). Se vuelve a avisar solo si
//     hubo un contacto nuevo y el lead se enfrió otra vez.
// Idempotente: cada aviso lleva una dedupeKey, así que repetir el job no
// duplica nada.
@Injectable()
export class RunRemindersUseCase {
  constructor(
    @Inject(REMINDERS_READER)
    private readonly reader: RemindersReader,
    private readonly publisher: NotificationPublisher,
  ) {}

  async execute(
    now = new Date(),
  ): Promise<{ followUps: number; quotes: number; staleLeads: number }> {
    const staleBefore = new Date(
      now.getTime() - STALE_LEAD_DAYS * 24 * 60 * 60 * 1000,
    );
    const [dueFollowUps, expiredQuotes, staleLeads] = await Promise.all([
      this.reader.findDueFollowUps(now, BATCH),
      this.reader.findExpiredSentQuotes(now, BATCH),
      this.reader.findStaleLeads(staleBefore, BATCH),
    ]);

    let followUps = 0;
    for (const item of dueFollowUps) {
      followUps += await this.publisher.notify({
        projectId: item.projectId,
        type: NotificationType.FOLLOW_UP_DUE,
        title: `Seguimiento pendiente: ${item.title}`,
        body: `Lead ${item.leadName} · vence ${item.dueAt.toISOString()}`,
        entity: { type: NotificationEntity.FOLLOW_UP, id: item.id },
        recipients: {
          userIds: [item.assignedUserId ?? item.createdByUserId],
        },
        dedupeKey: `follow-up-due:${item.id}`,
      });
    }

    let quotes = 0;
    for (const quote of expiredQuotes) {
      quotes += await this.publisher.notify({
        projectId: quote.projectId,
        type: NotificationType.QUOTE_EXPIRED,
        title: `La cotización ${quote.folio} venció sin respuesta`,
        body: `Vigente hasta ${quote.validUntil.toISOString().slice(0, 10)}. Crea una nueva versión si el cliente sigue interesado.`,
        entity: { type: NotificationEntity.QUOTE, id: quote.id },
        recipients: {
          userIds: [quote.createdByUserId],
          roles: [Role.OWNER, Role.ADMIN],
        },
        dedupeKey: `quote-expired:${quote.id}`,
      });
    }

    let stale = 0;
    for (const lead of staleLeads) {
      const lastDay = lead.lastActivityAt.toISOString().slice(0, 10);
      stale += await this.publisher.notify({
        projectId: lead.projectId,
        type: NotificationType.LEAD_STALE,
        title: `Lead sin actividad: ${lead.name}`,
        body: `Lleva ${STALE_LEAD_DAYS} días o más sin contacto (último: ${lastDay}).`,
        entity: { type: NotificationEntity.LEAD, id: lead.id },
        recipients: lead.assignedUserId
          ? { userIds: [lead.assignedUserId] }
          : { roles: [Role.OWNER, Role.ADMIN] },
        dedupeKey: `lead-stale:${lead.id}:${lastDay}`,
      });
    }

    return { followUps, quotes, staleLeads: stale };
  }
}
