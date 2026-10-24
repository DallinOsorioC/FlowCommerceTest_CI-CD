/* eslint-disable @typescript-eslint/unbound-method -- los mocks de jest se inspeccionan como propiedades */
import { ConfigService } from '@nestjs/config';
import { Permission } from '@flowcommerce/types';
import type { AuthorizationService } from '../../authorization/application/services/authorization.service';
import { SecretCipher } from '../../common/crypto/secret-cipher';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../common/exceptions/domain.exceptions';
import {
  MAX_ENDPOINTS_PER_PROJECT,
  type WebhookEndpoint,
  type WebhooksRepository,
} from '../domain/webhook';
import type { WebhookDispatcher } from './webhook-dispatcher';
import { WebhooksUseCases } from './webhooks.use-cases';

describe('WebhooksUseCases', () => {
  const actorUserId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const id = '55555555-5555-4555-8555-555555555555';
  const env: Record<string, string> = { ENCRYPTION_KEY: 'f'.repeat(64) };
  const configService = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  const cipher = new SecretCipher(configService);

  const authorizationService = {
    assertCan: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuthorizationService>;
  const repository: jest.Mocked<WebhooksRepository> = {
    create: jest.fn(),
    listByProject: jest.fn(),
    findInProject: jest.fn(),
    update: jest.fn(),
    deleteInProject: jest.fn(),
    listSubscribed: jest.fn(),
    recordDelivery: jest.fn(),
    listDeliveries: jest.fn(),
  };
  const dispatcher = {
    deliver: jest.fn(),
    invalidate: jest.fn(),
  } as unknown as jest.Mocked<WebhookDispatcher>;
  const useCases = new WebhooksUseCases(
    authorizationService,
    configService,
    cipher,
    dispatcher,
    repository,
  );

  const stored = (): WebhookEndpoint => ({
    id,
    projectId,
    url: 'https://93.184.216.34/hook',
    description: null,
    events: ['lead.created'],
    secretPrefix: 'whsec_xxxxxx',
    active: true,
    createdByUserId: actorUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    repository.create.mockResolvedValue(stored());
    repository.listByProject.mockResolvedValue([]);
  });

  it('returns the secret once and stores it only encrypted', async () => {
    const { secret } = await useCases.create({
      actorUserId,
      projectId,
      url: 'https://93.184.216.34/hook',
      events: ['lead.created'],
    });

    expect(authorizationService.assertCan).toHaveBeenCalledWith(
      actorUserId,
      Permission.PROJECT_UPDATE,
      projectId,
    );
    const saved = repository.create.mock.calls[0][0];
    expect(saved.secretEncrypted).not.toContain(secret);
    expect(cipher.decrypt(saved.secretEncrypted)).toBe(secret);
    expect(secret.startsWith(saved.secretPrefix)).toBe(true);
  });

  it('rejects unknown events and empty subscriptions', async () => {
    await expect(
      useCases.create({
        actorUserId,
        projectId,
        url: 'https://93.184.216.34/hook',
        events: ['lead.exploded'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      useCases.create({
        actorUserId,
        projectId,
        url: 'https://93.184.216.34/hook',
        events: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('collapses a wildcard subscription to just "*"', async () => {
    await useCases.create({
      actorUserId,
      projectId,
      url: 'https://93.184.216.34/hook',
      events: ['lead.created', '*'],
    });

    expect(repository.create.mock.calls[0][0].events).toEqual(['*']);
  });

  it('refuses an internal URL at registration time', async () => {
    await expect(
      useCases.create({
        actorUserId,
        projectId,
        url: 'https://169.254.169.254/latest/meta-data',
        events: ['*'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rotates the secret and returns the new one', async () => {
    repository.update.mockResolvedValue(stored());

    const { secret } = await useCases.rotateSecret({
      actorUserId,
      projectId,
      id,
    });

    const patch = repository.update.mock.calls[0][2];
    expect(cipher.decrypt(patch.secretEncrypted as string)).toBe(secret);
  });

  it('404s for an endpoint of another project', async () => {
    repository.update.mockResolvedValue(null);
    repository.deleteInProject.mockResolvedValue(false);
    repository.findInProject.mockResolvedValue(null);

    await expect(
      useCases.update({ actorUserId, projectId, id, active: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      useCases.remove({ actorUserId, projectId, id }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      useCases.test({ actorUserId, projectId, id }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('caps the number of webhooks per project (409)', async () => {
    repository.listByProject.mockResolvedValue(
      Array.from({ length: MAX_ENDPOINTS_PER_PROJECT }, stored),
    );

    await expect(
      useCases.create({
        actorUserId,
        projectId,
        url: 'https://93.184.216.34/hook',
        events: ['*'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('forgets the cached endpoints after any change', async () => {
    repository.update.mockResolvedValue(stored());
    repository.deleteInProject.mockResolvedValue(true);

    await useCases.create({
      actorUserId,
      projectId,
      url: 'https://93.184.216.34/hook',
      events: ['*'],
    });
    await useCases.update({ actorUserId, projectId, id, active: false });
    await useCases.rotateSecret({ actorUserId, projectId, id });
    await useCases.remove({ actorUserId, projectId, id });

    expect(dispatcher.invalidate).toHaveBeenCalledTimes(4);
    expect(dispatcher.invalidate).toHaveBeenCalledWith(projectId);
  });

  it('the manual test uses one short attempt', async () => {
    repository.findInProject.mockResolvedValue({
      ...stored(),
      secretEncrypted: 'x',
    });
    dispatcher.deliver.mockResolvedValue({
      status: 'SUCCESS',
      attempts: 1,
      responseStatus: 200,
      error: null,
    });

    await useCases.test({ actorUserId, projectId, id });

    expect(dispatcher.deliver).toHaveBeenCalledWith(
      expect.anything(),
      'ping',
      expect.anything(),
      { maxAttempts: 1, timeoutMs: 8000 },
    );
  });
});
