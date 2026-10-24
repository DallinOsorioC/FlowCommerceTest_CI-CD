/* eslint-disable @typescript-eslint/unbound-method -- los mocks de jest se inspeccionan como propiedades */
import { ActivityType } from '@flowcommerce/types';
import { ActivityWebhookBridge } from './activity-webhook-bridge';
import type { WebhookDispatcher } from './webhook-dispatcher';

describe('ActivityWebhookBridge', () => {
  const dispatcher = {
    publish: jest.fn(),
  } as unknown as jest.Mocked<WebhookDispatcher>;
  const bridge = new ActivityWebhookBridge(dispatcher);

  beforeEach(() => jest.clearAllMocks());

  const sentData = () => dispatcher.publish.mock.calls[0][2];

  it('never sends the text of a customer message to the webhook', () => {
    bridge.onActivity({
      projectId: 'p1',
      type: ActivityType.MESSAGE_RECEIVED,
      title: 'WhatsApp recibido de Ana',
      leadId: 'l1',
      metadata: {
        messageId: 'm1',
        messageType: 'TEXT',
        preview: 'Mi tarjeta es 4111 1111 1111 1111',
      },
    });

    expect(dispatcher.publish).toHaveBeenCalledWith(
      'p1',
      'message.received',
      expect.anything(),
    );
    expect(sentData().metadata).toEqual({
      messageId: 'm1',
      messageType: 'TEXT',
    });
    expect(JSON.stringify(sentData())).not.toContain('4111');
  });

  it('drops recipient emails and payment references', () => {
    bridge.onActivity({
      projectId: 'p1',
      type: ActivityType.QUOTE_SENT_BY_EMAIL,
      title: 'Cotización enviada',
      metadata: { to: 'cliente@empresa.com', cc: ['otro@empresa.com'] },
    });
    expect(sentData().metadata).toEqual({});

    dispatcher.publish.mockClear();
    bridge.onActivity({
      projectId: 'p1',
      type: ActivityType.QUOTE_PAYMENT_LINK_CREATED,
      title: 'Link de pago',
      metadata: { providerReference: 'pay_secret_ref' },
    });
    expect(sentData().metadata).toEqual({});
  });

  it('keeps the useful, non-sensitive fields', () => {
    bridge.onActivity({
      projectId: 'p1',
      type: ActivityType.QUOTE_STATUS_CHANGED,
      title: 'Cotización aprobada',
      quoteId: 'q1',
      metadata: { from: 'PENDING_APPROVAL', to: 'APPROVED', total: 500, x: 1 },
    });
    expect(sentData()).toMatchObject({
      quoteId: 'q1',
      metadata: { from: 'PENDING_APPROVAL', to: 'APPROVED', total: 500 },
    });
    expect(sentData().metadata).not.toHaveProperty('x');
  });
});
