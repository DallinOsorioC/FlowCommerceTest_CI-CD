import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Firma de los webhooks salientes. El receptor verifica que el envío viene de
// Flowcommerce y no se manipuló, y rechaza los muy viejos (anti-replay).
//
// Cabecera:  X-Flowcommerce-Signature: t=<unix seg>,v1=<hex>
// v1 = HMAC-SHA256( secreto, "<t>.<cuerpo crudo>" )
//
// Verificación del lado del receptor: recalcular v1 con el cuerpo CRUDO (sin
// re-serializar el JSON), compararlo en tiempo constante y exigir que |ahora - t|
// sea menor a 5 minutos.
export const SIGNATURE_HEADER = 'X-Flowcommerce-Signature';
export const SIGNATURE_TOLERANCE_SECONDS = 300;
export const SECRET_PREFIX = 'whsec_';

export function generateWebhookSecret(): { secret: string; prefix: string } {
  const secret = `${SECRET_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { secret, prefix: secret.slice(0, 12) };
}

export function signWebhook(
  secret: string,
  timestampSeconds: number,
  body: string,
): string {
  const v1 = createHmac('sha256', secret)
    .update(`${timestampSeconds}.${body}`, 'utf8')
    .digest('hex');
  return `t=${timestampSeconds},v1=${v1}`;
}

// Misma verificación que debe hacer el receptor; se expone para los tests y
// para documentarla con código ejecutable.
export function verifyWebhookSignature(
  secret: string,
  header: string,
  body: string,
  nowSeconds: number,
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((part) => part.trim().split('=') as [string, string]),
  );
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v1) {
    return false;
  }
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }
  const expected = signWebhook(secret, timestamp, body).split('v1=')[1];
  const received = Buffer.from(parts.v1, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}
