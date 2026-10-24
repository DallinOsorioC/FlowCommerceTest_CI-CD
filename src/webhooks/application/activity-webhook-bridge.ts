import { Injectable } from '@nestjs/common';
import type { ActivitySink } from '../../activity/domain/activity';
import type { RecordActivityInput } from '../../activity/domain/activity';
import { ACTIVITY_TO_WEBHOOK_EVENT } from '../domain/webhook';
import { WebhookDispatcher } from './webhook-dispatcher';

// Metadata que sale hacia el exterior, por tipo de evento. Es una lista
// BLANCA: un campo nuevo en el historial no se filtra a terceros mientras no se
// agregue aquí a propósito. Fuera quedan el texto de los mensajes (preview),
// los correos de destino de una cotización y las referencias del proveedor de
// pagos.
const PUBLIC_METADATA: Record<string, readonly string[]> = {
  LEAD_CREATED: ['stage', 'source', 'origin'],
  LEAD_STAGE_CHANGED: ['from', 'to'],
  LEAD_ASSIGNED: ['from', 'to'],
  LEAD_CONVERTED: ['createdClient', 'markedAsWon'],
  QUOTE_CREATED: ['total', 'origin'],
  QUOTE_STATUS_CHANGED: ['from', 'to', 'total'],
  MESSAGE_SENT: ['messageId', 'messageType', 'templateName'],
  MESSAGE_RECEIVED: ['messageId', 'messageType', 'templateName'],
  FOLLOW_UP_CREATED: ['followUpId', 'followUpType', 'dueAt'],
  FOLLOW_UP_COMPLETED: ['followUpId', 'followUpType', 'outcome'],
  FOLLOW_UP_CANCELLED: ['followUpId', 'followUpType'],
  ATTACHMENT_ADDED: ['attachmentId', 'mimeType', 'sizeBytes'],
};

function publicMetadata(
  type: string,
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const allowed = PUBLIC_METADATA[type] ?? [];
  return Object.fromEntries(
    Object.entries(metadata ?? {}).filter(([key]) => allowed.includes(key)),
  );
}

// Convierte cada evento de actividad en un webhook saliente. El payload dice
// qué pasó y a quién (ids), sin el contenido de los mensajes ni datos de
// contacto: quien lo necesita consulta la API con su API key.
@Injectable()
export class ActivityWebhookBridge implements ActivitySink {
  constructor(private readonly dispatcher: WebhookDispatcher) {}

  onActivity(input: RecordActivityInput): void {
    const event = ACTIVITY_TO_WEBHOOK_EVENT[input.type];
    if (!event) {
      return;
    }
    this.dispatcher.publish(input.projectId, event, {
      title: input.title,
      actorUserId: input.actorUserId ?? null,
      leadId: input.leadId ?? null,
      clientId: input.clientId ?? null,
      quoteId: input.quoteId ?? null,
      metadata: publicMetadata(input.type, input.metadata),
    });
  }
}
