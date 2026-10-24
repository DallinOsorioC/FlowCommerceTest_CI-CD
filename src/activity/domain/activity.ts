import type { ActivityEvent, ActivityType } from '@flowcommerce/types';

// Lo que pide quien registra un evento. Basta con el lead, el cliente o la
// cotización a los que se refiere; el texto ya viene listo para mostrar.
export interface RecordActivityInput {
  projectId: string;
  type: ActivityType;
  title: string;
  // null = el sistema (webhook de WhatsApp, IA, Pagos, recordatorios).
  actorUserId?: string | null;
  leadId?: string | null;
  clientId?: string | null;
  quoteId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ListActivityFilter {
  leadId?: string;
  // Historial del cliente: sus eventos y los de sus leads.
  clientId?: string;
  quoteId?: string;
  types?: ActivityType[];
  page?: number;
  limit?: number;
}

export type ActivityView = ActivityEvent;

// Siempre acotado por projectId: nadie lee la actividad de otro tenant.
export interface ActivityRepository {
  insert(input: RecordActivityInput): Promise<void>;
  list(
    projectId: string,
    filter: ListActivityFilter,
  ): Promise<{ events: ActivityView[]; total: number }>;
}

export const ACTIVITY_REPOSITORY = Symbol('ACTIVITY_REPOSITORY');

// Quien quiere enterarse de cada evento registrado (hoy: los webhooks
// salientes). Es opcional y NO puede lanzar ni bloquear: ActivityRecorder
// ignora sus fallos.
export interface ActivitySink {
  onActivity(input: RecordActivityInput): void;
}

export const ACTIVITY_SINK = Symbol('ACTIVITY_SINK');
