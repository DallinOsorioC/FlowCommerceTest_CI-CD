import { createHmac, timingSafeEqual } from 'node:crypto';

// Contrato con el equipo de Pagos (ver docs: contrato-ia-pagos).

// Puerto hacia el servicio de Pagos: crear el link de pago de una cotización.
export interface CreatePaymentLinkInput {
  projectId: string;
  quoteId: string;
  folio: string;
  amount: number;
  currency: string;
  description: string;
  customer: { name: string; email: string | null };
}

export interface PaymentLink {
  url: string;
  // Id del link en el servicio de Pagos (para soporte).
  providerReference: string | null;
}

export interface PaymentsGateway {
  createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLink>;
}

export const PAYMENTS_GATEWAY = Symbol('PAYMENTS_GATEWAY');

// Eventos que Pagos envía a POST /api/v1/integrations/payments/webhook.
export const PAYMENT_EVENT_TYPES = [
  'payment.succeeded',
  'payment.failed',
  'payment_link.created',
] as const;
export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

export interface PaymentWebhookEvent {
  eventId: string;
  type: PaymentEventType;
  projectId: string;
  quoteId: string;
  amount: number | null;
  currency: string | null;
  reference: string | null;
  paymentLinkUrl: string | null;
}

export type PaymentEventResult = 'PROCESSED' | 'IGNORED';

export interface PaymentEventsRepository {
  exists(eventId: string): Promise<boolean>;
  // Idempotente: un event_id repetido no se inserta dos veces.
  record(input: {
    projectId: string;
    quoteId: string;
    eventId: string;
    type: string;
    amount: number | null;
    currency: string | null;
    reference: string | null;
    result: PaymentEventResult;
  }): Promise<void>;
}

export const PAYMENT_EVENTS_REPOSITORY = Symbol('PAYMENT_EVENTS_REPOSITORY');

// Firma del webhook, al estilo de Stripe:
//   X-FlowCommerce-Signature: t=<unix segundos>,v1=<hex>
//   v1 = HMAC-SHA256(PAYMENTS_WEBHOOK_SECRET, "<t>.<cuerpo crudo>")
// El timestamp dentro de la firma impide reenviar un evento viejo capturado
// (tolerancia de 5 minutos).
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function signPaymentPayload(
  rawBody: Buffer,
  secret: string,
  timestamp: number,
): string {
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

export function verifyPaymentSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  nowSeconds: number,
): boolean {
  if (!header) {
    return false;
  }
  const parts = new Map(
    header.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key, rest.join('=')] as const;
    }),
  );
  const timestamp = Number(parts.get('t'));
  const received = parts.get('v1');
  if (!Number.isInteger(timestamp) || !received) {
    return false;
  }
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }
  const expected = signPaymentPayload(rawBody, secret, timestamp).split(
    'v1=',
  )[1];
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

// Valida la forma del evento DESPUÉS de comprobar la firma. Se hace a mano (y
// no con un DTO) para tolerar campos nuevos que Pagos agregue en el futuro.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePaymentEvent(
  payload: unknown,
): PaymentWebhookEvent | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const p = payload as Record<string, unknown>;
  const text = (value: unknown, max: number): string | null =>
    typeof value === 'string' && value.trim() && value.length <= max
      ? value.trim()
      : null;
  const eventId = text(p.eventId, 255);
  const type = p.type as PaymentEventType;
  const projectId = text(p.projectId, 36);
  const quoteId = text(p.quoteId, 36);
  if (
    !eventId ||
    !PAYMENT_EVENT_TYPES.includes(type) ||
    !projectId ||
    !UUID_RE.test(projectId) ||
    !quoteId ||
    !UUID_RE.test(quoteId)
  ) {
    return null;
  }
  const amount =
    typeof p.amount === 'number' && Number.isFinite(p.amount) ? p.amount : null;
  const currency = text(p.currency, 3)?.toUpperCase() ?? null;
  const url = text(p.paymentLinkUrl, 2048);
  return {
    eventId,
    type,
    projectId,
    quoteId,
    amount,
    currency,
    reference: text(p.reference, 255),
    paymentLinkUrl: url && /^https:\/\//i.test(url) ? url : null,
  };
}

// Compara importes en centavos para no fallar por decimales de coma flotante.
export function sameAmount(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}
