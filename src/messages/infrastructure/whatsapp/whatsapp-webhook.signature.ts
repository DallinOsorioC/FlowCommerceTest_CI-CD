import { createHmac, timingSafeEqual } from 'node:crypto';

// Meta firma el cuerpo crudo con el App Secret y lo manda en
// X-Hub-Signature-256 como "sha256=<hex>". Hay que hashear el buffer original,
// no el JSON re-serializado: cualquier cambio de espacios invalidaría la firma.
export function verifyWhatsAppSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) {
    return false;
  }

  const expected = createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  const received = signatureHeader.slice('sha256='.length);
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function signWhatsAppPayload(
  rawBody: Buffer,
  appSecret: string,
): string {
  const digest = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}
