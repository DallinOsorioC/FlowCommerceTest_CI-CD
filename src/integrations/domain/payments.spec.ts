import {
  parsePaymentEvent,
  sameAmount,
  signPaymentPayload,
  verifyPaymentSignature,
} from './payments';

describe('payments contract', () => {
  const secret = 'whsec_test';
  const body = Buffer.from('{"eventId":"evt_1"}');
  const now = 1_800_000_000;

  describe('verifyPaymentSignature', () => {
    it('accepts a body signed with the shared secret', () => {
      const header = signPaymentPayload(body, secret, now);
      expect(verifyPaymentSignature(body, header, secret, now)).toBe(true);
    });

    it('rejects a different secret, a tampered body or a missing header', () => {
      const header = signPaymentPayload(body, secret, now);
      expect(verifyPaymentSignature(body, header, 'other', now)).toBe(false);
      expect(
        verifyPaymentSignature(
          Buffer.from('{"eventId":"evt_2"}'),
          header,
          secret,
          now,
        ),
      ).toBe(false);
      expect(verifyPaymentSignature(body, undefined, secret, now)).toBe(false);
      expect(verifyPaymentSignature(body, 'v1=abc', secret, now)).toBe(false);
    });

    it('rejects a replay older than 5 minutes', () => {
      const header = signPaymentPayload(body, secret, now - 301);
      expect(verifyPaymentSignature(body, header, secret, now)).toBe(false);
    });
  });

  describe('parsePaymentEvent', () => {
    const valid = {
      eventId: 'evt_1',
      type: 'payment.succeeded',
      projectId: '33333333-3333-4333-8333-333333333333',
      quoteId: '55555555-5555-4555-8555-555555555555',
      amount: 1008,
      currency: 'gtq',
      reference: 'pi_123',
    };

    it('normalizes a valid event and ignores unknown fields', () => {
      expect(parsePaymentEvent({ ...valid, extra: true })).toEqual({
        ...valid,
        currency: 'GTQ',
        paymentLinkUrl: null,
      });
    });

    it('rejects unknown types and ids that are not uuids', () => {
      expect(parsePaymentEvent({ ...valid, type: 'refund' })).toBeNull();
      expect(parsePaymentEvent({ ...valid, quoteId: '1' })).toBeNull();
      expect(parsePaymentEvent(null)).toBeNull();
    });

    it('only keeps https payment links', () => {
      expect(
        parsePaymentEvent({ ...valid, paymentLinkUrl: 'http://pay.test/x' })
          ?.paymentLinkUrl,
      ).toBeNull();
      expect(
        parsePaymentEvent({ ...valid, paymentLinkUrl: 'https://pay.test/x' })
          ?.paymentLinkUrl,
      ).toBe('https://pay.test/x');
    });
  });

  it('compares amounts in cents', () => {
    expect(sameAmount(0.1 + 0.2, 0.3)).toBe(true);
    expect(sameAmount(1008, 1008.01)).toBe(false);
  });
});
