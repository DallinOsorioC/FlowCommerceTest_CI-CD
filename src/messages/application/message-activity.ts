import { ActivityType } from '@flowcommerce/types';
import type { ActivityRecorder } from '../../activity/application/activity-recorder';
import type { LeadEntity } from '../../leads/domain/entities/lead.entity';
import type { MessageEntity } from '../domain/entities/message.entity';

// Línea del historial de actividad para un mensaje de WhatsApp (enviado desde
// el CRM o recibido por el webhook). Como todo lo de actividad, nunca lanza:
// un problema aquí no puede tumbar el envío ni el webhook.
export async function recordMessageActivity(
  activity: ActivityRecorder,
  lead: LeadEntity,
  message: MessageEntity,
  actorUserId: string | null,
): Promise<void> {
  try {
    const outbound = message.direction === 'OUTBOUND';
    await activity.record({
      projectId: message.projectId,
      actorUserId,
      type: outbound
        ? ActivityType.MESSAGE_SENT
        : ActivityType.MESSAGE_RECEIVED,
      title: outbound
        ? `WhatsApp enviado a ${lead.name}`
        : `WhatsApp recibido de ${lead.name}`,
      leadId: lead.id,
      clientId: lead.clientId,
      metadata: {
        messageId: message.id,
        messageType: message.type,
        preview: String(message.content).slice(0, 120),
        ...(message.templateName ? { templateName: message.templateName } : {}),
      },
    });
  } catch {
    // ActivityRecorder ya registra sus propios errores.
  }
}
