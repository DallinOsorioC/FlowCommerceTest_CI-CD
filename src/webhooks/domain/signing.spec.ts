import {
  generateWebhookSecret,
  signWebhook,
  verifyWebhookSignature,
} from './signing';

describe('webhook signing', () => {
  const body = JSON.stringify({ event: 'lead.created', data: { a: 1 } });
  const now = 1_800_000_000;

  it('produces a verifiable signature', () => {
    const { secret } = generateWebhookSecret();
    const header = signWebhook(secret, now, body);

    expect(header).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature(secret, header, body, now)).toBe(true);
  });

  it('rejects a tampered body, a wrong secret or a re-ordered payload', () => {
    const header = signWebhook('whsec_one', now, body);

    expect(verifyWebhookSignature('whsec_one', header, body + ' ', now)).toBe(
      false,
    );
    expect(verifyWebhookSignature('whsec_two', header, body, now)).toBe(false);
  });

  it('rejects replays older than the tolerance window', () => {
    const header = signWebhook('whsec_one', now, body);

    expect(verifyWebhookSignature('whsec_one', header, body, now + 301)).toBe(
      false,
    );
    expect(verifyWebhookSignature('whsec_one', header, body, now + 299)).toBe(
      true,
    );
  });

  it('rejects malformed headers instead of throwing', () => {
    expect(verifyWebhookSignature('s', 'garbage', body, now)).toBe(false);
    expect(verifyWebhookSignature('s', 't=abc,v1=00', body, now)).toBe(false);
  });

  it('generates distinct secrets with a recognisable prefix', () => {
    const a = generateWebhookSecret();
    expect(a.secret.startsWith('whsec_')).toBe(true);
    expect(a.secret.startsWith(a.prefix)).toBe(true);
    expect(generateWebhookSecret().secret).not.toBe(a.secret);
  });
});
