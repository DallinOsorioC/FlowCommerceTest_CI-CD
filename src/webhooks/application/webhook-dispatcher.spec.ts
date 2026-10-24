/* eslint-disable @typescript-eslint/unbound-method -- los mocks de jest se inspeccionan como propiedades */
import { ConfigService } from '@nestjs/config';
import { SecretCipher } from '../../common/crypto/secret-cipher';
import { verifyWebhookSignature } from '../domain/signing';
import type {
  WebhookEndpointWithSecret,
  WebhooksRepository,
} from '../domain/webhook';
import { WebhookDispatcher } from './webhook-dispatcher';

describe('WebhookDispatcher', () => {
  const projectId = '33333333-3333-4333-8333-333333333333';
  const secret = 'whsec_test_secret';
  const env: Record<string, string> = {
    ENCRYPTION_KEY: 'e'.repeat(64),
    // Receptor en localhost: el guard anti-SSRF se cubre en url-guard.spec.
    WEBHOOKS_ALLOW_PRIVATE_TARGETS: 'true',
    WEBHOOKS_RETRY_BASE_MS: '1',
    WEBHOOKS_MAX_ATTEMPTS: '3',
  };
  const configService = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  const cipher = new SecretCipher(configService);

  const repository: jest.Mocked<WebhooksRepository> = {
    create: jest.fn(),
    listByProject: jest.fn(),
    findInProject: jest.fn(),
    update: jest.fn(),
    deleteInProject: jest.fn(),
    listSubscribed: jest.fn(),
    recordDelivery: jest.fn().mockResolvedValue(undefined),
    listDeliveries: jest.fn(),
  };

  const endpoint = (
    url = 'http://localhost:4000/hook',
  ): WebhookEndpointWithSecret => ({
    id: '55555555-5555-4555-8555-555555555555',
    projectId,
    url,
    description: null,
    events: ['*'],
    secretPrefix: 'whsec_test_s',
    active: true,
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    secretEncrypted: cipher.encrypt(secret),
  });

  const respond = (status: number) =>
    Promise.resolve({ status, ok: status >= 200 && status < 300 } as Response);

  const build = (fetchImpl: jest.Mock) =>
    new WebhookDispatcher(configService, cipher, repository, fetchImpl);

  beforeEach(() => jest.clearAllMocks());

  it('POSTs a signed JSON body that the receiver can verify', async () => {
    const fetchImpl = jest.fn().mockReturnValue(respond(200));

    const result = await build(fetchImpl).deliver(endpoint(), 'lead.created', {
      leadId: 'l1',
    });

    expect(result).toMatchObject({ status: 'SUCCESS', attempts: 1 });
    const [, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;
    expect(JSON.parse(body)).toMatchObject({
      event: 'lead.created',
      projectId,
      data: { leadId: 'l1' },
    });
    expect(headers['X-Flowcommerce-Event']).toBe('lead.created');
    expect(
      verifyWebhookSignature(
        secret,
        headers['X-Flowcommerce-Signature'],
        body,
        Math.floor(Date.now() / 1000),
      ),
    ).toBe(true);
    expect(init.redirect).toBe('manual');
    expect(repository.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SUCCESS', event: 'lead.created' }),
    );
  });

  it('retries 5xx and then succeeds', async () => {
    const fetchImpl = jest
      .fn()
      .mockReturnValueOnce(respond(503))
      .mockReturnValueOnce(respond(200));

    const result = await build(fetchImpl).deliver(endpoint(), 'x', {});

    expect(result).toMatchObject({ status: 'SUCCESS', attempts: 2 });
  });

  it('gives up after the max attempts and records the failure', async () => {
    const fetchImpl = jest.fn().mockReturnValue(respond(500));

    const result = await build(fetchImpl).deliver(endpoint(), 'x', {});

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      status: 'FAILED',
      attempts: 3,
      responseStatus: 500,
    });
    expect(repository.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', attempts: 3 }),
    );
  });

  it('does not retry a 4xx (the receiver rejected it on purpose)', async () => {
    const fetchImpl = jest.fn().mockReturnValue(respond(410));

    const result = await build(fetchImpl).deliver(endpoint(), 'x', {});

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'FAILED', attempts: 1 });
  });

  it('treats a redirect as a failure instead of following it', async () => {
    const fetchImpl = jest.fn().mockReturnValue(respond(302));

    const result = await build(fetchImpl).deliver(endpoint(), 'x', {});

    expect(result).toMatchObject({ status: 'FAILED', responseStatus: 302 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries network errors', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockReturnValueOnce(respond(200));

    const result = await build(fetchImpl).deliver(endpoint(), 'x', {});

    expect(result).toMatchObject({ status: 'SUCCESS', attempts: 2 });
  });

  it('never calls an internal address when private targets are not allowed', async () => {
    const fetchImpl = jest.fn();
    const guarded = new WebhookDispatcher(
      {
        get: (key: string) =>
          key === 'WEBHOOKS_ALLOW_PRIVATE_TARGETS' ? 'false' : env[key],
      } as unknown as ConfigService,
      cipher,
      repository,
      fetchImpl,
    );

    const result = await guarded.deliver(
      endpoint('https://169.254.169.254/latest'),
      'x',
      {},
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'FAILED', attempts: 1 });
  });

  it('fans an event out only to the subscribed endpoints of the project', async () => {
    repository.listSubscribed.mockResolvedValue([endpoint(), endpoint()]);
    const fetchImpl = jest.fn().mockReturnValue(respond(200));

    await build(fetchImpl).fanOut(projectId, 'lead.created', {});

    expect(repository.listSubscribed).toHaveBeenCalledWith(
      projectId,
      'lead.created',
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('publish() never throws even if the repository fails', async () => {
    repository.listSubscribed.mockRejectedValue(new Error('db down'));
    const dispatcher = build(jest.fn());

    expect(() =>
      dispatcher.publish(projectId, 'lead.created', {}),
    ).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('publish() does nothing when WEBHOOKS_ENABLED=false', () => {
    const disabled = new WebhookDispatcher(
      {
        get: (key: string) => (key === 'WEBHOOKS_ENABLED' ? 'false' : env[key]),
      } as unknown as ConfigService,
      cipher,
      repository,
      jest.fn(),
    );

    disabled.publish(projectId, 'lead.created', {});

    expect(repository.listSubscribed).not.toHaveBeenCalled();
  });

  it('connects to the validated IP instead of resolving the name again', async () => {
    const strict = {
      get: (key: string) =>
        key === 'WEBHOOKS_ALLOW_PRIVATE_TARGETS' ? 'false' : env[key],
    } as unknown as ConfigService;
    const fetchImpl = jest.fn().mockReturnValue(respond(200));
    const dispatcher = new WebhookDispatcher(
      strict,
      cipher,
      repository,
      fetchImpl,
    );

    // Un literal IP público: no hace falta DNS en el test.
    await dispatcher.deliver(endpoint('https://93.184.216.34/hook'), 'x', {});

    const [, init] = fetchImpl.mock.calls[0] as [URL, { address: unknown }];
    expect(init.address).toEqual({ address: '93.184.216.34', family: 4 });
  });

  it('honours per-call options: one short attempt for the manual test', async () => {
    const fetchImpl = jest.fn().mockReturnValue(respond(500));

    const result = await build(fetchImpl).deliver(
      endpoint(),
      'ping',
      {},
      {
        maxAttempts: 1,
        timeoutMs: 1000,
      },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'FAILED', attempts: 1 });
  });

  it('remembers the endpoints of a project instead of querying on every event', async () => {
    repository.listSubscribed.mockResolvedValue([]);
    const dispatcher = build(jest.fn());

    await dispatcher.fanOut(projectId, 'lead.created', {});
    await dispatcher.fanOut(projectId, 'lead.created', {});
    expect(repository.listSubscribed).toHaveBeenCalledTimes(1);

    dispatcher.invalidate(projectId);
    await dispatcher.fanOut(projectId, 'lead.created', {});
    expect(repository.listSubscribed).toHaveBeenCalledTimes(2);
  });

  it('never runs more deliveries at once than WEBHOOKS_MAX_CONCURRENCY', async () => {
    let running = 0;
    let peak = 0;
    const fetchImpl = jest.fn().mockImplementation(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 15));
      running -= 1;
      return { status: 200, ok: true } as Response;
    });
    const limited = new WebhookDispatcher(
      {
        get: (key: string) =>
          key === 'WEBHOOKS_MAX_CONCURRENCY' ? '2' : env[key],
      } as unknown as ConfigService,
      cipher,
      repository,
      fetchImpl,
    );

    await Promise.all(
      Array.from({ length: 6 }, () => limited.deliver(endpoint(), 'x', {})),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(peak).toBe(2);
  });
});
