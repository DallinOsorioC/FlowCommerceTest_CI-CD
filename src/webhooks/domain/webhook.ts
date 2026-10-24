import { ActivityType } from '@flowcommerce/types';

// Catálogo público de eventos que Flowcommerce envía a los webhooks del
// proyecto. Cada uno nace de un evento de actividad (ActivityRecorder), así
// que lo que se ve en el historial del lead es exactamente lo que se notifica.
export const ACTIVITY_TO_WEBHOOK_EVENT: Record<ActivityType, string> = {
  LEAD_CREATED: 'lead.created',
  LEAD_STAGE_CHANGED: 'lead.stage_changed',
  LEAD_ASSIGNED: 'lead.assigned',
  LEAD_CONVERTED: 'lead.converted',
  CLIENT_CREATED: 'client.created',
  QUOTE_CREATED: 'quote.created',
  QUOTE_STATUS_CHANGED: 'quote.status_changed',
  QUOTE_SENT_BY_EMAIL: 'quote.sent',
  QUOTE_PAYMENT_LINK_CREATED: 'quote.payment_link_created',
  MESSAGE_SENT: 'message.sent',
  MESSAGE_RECEIVED: 'message.received',
  FOLLOW_UP_CREATED: 'followup.created',
  FOLLOW_UP_COMPLETED: 'followup.completed',
  FOLLOW_UP_CANCELLED: 'followup.cancelled',
  ATTACHMENT_ADDED: 'attachment.added',
};

// Envío de prueba que dispara el botón «Probar» del endpoint.
export const PING_EVENT = 'ping';
export const ALL_EVENTS = '*';

export const WEBHOOK_EVENTS: readonly string[] = Object.values(
  ACTIVITY_TO_WEBHOOK_EVENT,
);

// Tope por proyecto: cada endpoint multiplica el trabajo de cada evento.
export const MAX_ENDPOINTS_PER_PROJECT = 10;
// Envíos que se conservan en el historial de cada endpoint.
export const DELIVERY_LOG_LIMIT = 100;

export interface WebhookEndpoint {
  id: string;
  projectId: string;
  url: string;
  description: string | null;
  events: string[];
  secretPrefix: string;
  active: boolean;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Solo lo usa el dispatcher: incluye el secreto cifrado.
export interface WebhookEndpointWithSecret extends WebhookEndpoint {
  secretEncrypted: string;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  event: string;
  status: 'SUCCESS' | 'FAILED';
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  durationMs: number | null;
  createdAt: Date;
}

export interface WebhooksRepository {
  create(input: {
    projectId: string;
    url: string;
    description: string | null;
    events: string[];
    secretEncrypted: string;
    secretPrefix: string;
    createdByUserId: string;
  }): Promise<WebhookEndpoint>;
  listByProject(projectId: string): Promise<WebhookEndpoint[]>;
  findInProject(
    id: string,
    projectId: string,
  ): Promise<WebhookEndpointWithSecret | null>;
  update(
    id: string,
    projectId: string,
    patch: {
      url?: string;
      description?: string | null;
      events?: string[];
      active?: boolean;
      secretEncrypted?: string;
      secretPrefix?: string;
    },
  ): Promise<WebhookEndpoint | null>;
  deleteInProject(id: string, projectId: string): Promise<boolean>;
  // Endpoints ACTIVOS del proyecto suscritos al evento (o a "*").
  listSubscribed(
    projectId: string,
    event: string,
  ): Promise<WebhookEndpointWithSecret[]>;
  recordDelivery(input: {
    endpointId: string;
    projectId: string;
    event: string;
    status: 'SUCCESS' | 'FAILED';
    attempts: number;
    responseStatus: number | null;
    error: string | null;
    durationMs: number;
  }): Promise<void>;
  listDeliveries(
    endpointId: string,
    projectId: string,
    limit: number,
  ): Promise<WebhookDelivery[]>;
}

export const WEBHOOKS_REPOSITORY = Symbol('WEBHOOKS_REPOSITORY');
