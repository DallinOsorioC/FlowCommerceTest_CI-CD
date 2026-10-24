import { ConfigService } from '@nestjs/config';
import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '../../../common/exceptions/domain.exceptions';
import { CloudWhatsAppGateway } from './cloud-whatsapp.gateway';

describe('CloudWhatsAppGateway', () => {
  const projectId = '33333333-3333-4333-8333-333333333333';
  const otherProjectId = '44444444-4444-4444-8444-444444444444';

  const config: Record<string, string> = {
    WHATSAPP_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: '123456789',
    WHATSAPP_GRAPH_BASE_URL: 'https://graph.test',
    WHATSAPP_GRAPH_API_VERSION: 'v21.0',
    WHATSAPP_PROJECT_ID: projectId,
    WHATSAPP_MAX_RETRIES: '2',
    WHATSAPP_RETRY_BASE_MS: '1',
    WHATSAPP_REQUEST_TIMEOUT_MS: '1000',
  };

  const configService = {
    get: jest.fn((key: string) => config[key]),
  } as unknown as ConfigService;

  const sendInput = {
    projectId,
    leadId: '77777777-7777-4777-8777-777777777777',
    phone: '+52 55 1234 5678',
    content: 'Hola Ana',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get = jest.fn((key: string) => config[key]);
  });

  it('posts text messages to Cloud API and returns the wamid', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ messages: [{ id: 'wamid.real-1' }] }),
    });

    const gateway = new CloudWhatsAppGateway(configService, fetchImpl);

    await expect(gateway.send(sendInput)).resolves.toEqual({
      whatsappMessageId: 'wamid.real-1',
      status: 'SENT',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.test/v21.0/123456789/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      messaging_product: 'whatsapp',
      to: '525512345678',
      type: 'text',
      text: { body: 'Hola Ana' },
    });
  });

  it('does not send when the WABA is bound to another projectId', async () => {
    const fetchImpl = jest.fn();
    const gateway = new CloudWhatsAppGateway(configService, fetchImpl);

    await expect(
      gateway.send({ ...sendInput, projectId: otherProjectId }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('retries retryable Graph failures and then succeeds', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () =>
          Promise.resolve({ error: { message: 'temporarily unavailable' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ messages: [{ id: 'wamid.after-retry' }] }),
      });

    const gateway = new CloudWhatsAppGateway(configService, fetchImpl);
    const result = await gateway.send(sendInput);

    expect(result.whatsappMessageId).toBe('wamid.after-retry');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('maps client Graph errors without retrying', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ error: { message: 'Recipient not valid' } }),
    });

    const gateway = new CloudWhatsAppGateway(configService, fetchImpl);

    await expect(gateway.send(sendInput)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails closed when credentials are missing', async () => {
    const emptyConfig = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;
    const fetchImpl = jest.fn();
    const gateway = new CloudWhatsAppGateway(emptyConfig, fetchImpl);

    await expect(gateway.send(sendInput)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('raises BadGateway after exhausting retries', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('network down'));
    const gateway = new CloudWhatsAppGateway(configService, fetchImpl);

    await expect(gateway.send(sendInput)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  describe('template management', () => {
    const template = {
      name: 'seguimiento',
      language: 'es',
      category: 'UTILITY' as const,
      bodyText: 'Hola {{1}}',
      bodyExamples: ['Ana'],
    };

    it('creates a template on the WABA with an example per variable', async () => {
      config.WHATSAPP_BUSINESS_ACCOUNT_ID = 'waba-1';
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'tpl-1', status: 'PENDING' }),
      });
      const gateway = new CloudWhatsAppGateway(configService, fetchImpl);

      await expect(
        gateway.createTemplate(projectId, template),
      ).resolves.toEqual({ id: 'tpl-1', status: 'PENDING' });

      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://graph.test/v21.0/waba-1/message_templates');
      expect(JSON.parse(init.body as string)).toMatchObject({
        name: 'seguimiento',
        components: [{ type: 'BODY', example: { body_text: [['Ana']] } }],
      });
      delete config.WHATSAPP_BUSINESS_ACCOUNT_ID;
    });

    it('does not call Meta in dry-run mode', async () => {
      config.WHATSAPP_TEMPLATES_DRY_RUN = 'true';
      const fetchImpl = jest.fn();
      const gateway = new CloudWhatsAppGateway(configService, fetchImpl);

      const created = await gateway.createTemplate(projectId, template);

      expect(created.id).toMatch(/^dry-run-/);
      expect(fetchImpl).not.toHaveBeenCalled();
      delete config.WHATSAPP_TEMPLATES_DRY_RUN;
    });
  });
});
