/* eslint-disable @typescript-eslint/unbound-method -- los mocks de jest se inspeccionan como propiedades */
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ApiKeyScope,
  generateApiKey,
  type ApiKeysRepository,
} from '../../domain/api-key';
import { ApiKeyGuard, RequireScope } from './api-key.guard';

class Routes {
  @RequireScope(ApiKeyScope.LEADS_WRITE)
  write() {}

  open() {}
}

describe('ApiKeyGuard scopes', () => {
  const repository: jest.Mocked<ApiKeysRepository> = {
    create: jest.fn(),
    listByProject: jest.fn(),
    revokeInProject: jest.fn(),
    findActiveByHash: jest.fn(),
    touchLastUsed: jest.fn().mockResolvedValue(undefined),
  };
  const guard = new ApiKeyGuard(repository, new Reflector());
  const { key } = generateApiKey();

  const contextFor = (handler: () => void): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => Routes,
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: `Bearer ${key}` } }),
      }),
    }) as unknown as ExecutionContext;

  const principal = (scopes: ApiKeyScope[]) => ({
    keyId: 'k1',
    projectId: 'p1',
    actorUserId: 'u1',
    scopes,
  });

  beforeEach(() => jest.clearAllMocks());

  it('lets a key with the route scope through', async () => {
    repository.findActiveByHash.mockResolvedValue(
      principal([ApiKeyScope.LEADS_WRITE]),
    );
    await expect(
      guard.canActivate(contextFor(Routes.prototype.write)),
    ).resolves.toBe(true);
  });

  it('answers 403 (not 401) when the key lacks the scope', async () => {
    repository.findActiveByHash.mockResolvedValue(
      principal([ApiKeyScope.LEADS_READ]),
    );
    await expect(
      guard.canActivate(contextFor(Routes.prototype.write)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not demand a scope on routes that declare none', async () => {
    repository.findActiveByHash.mockResolvedValue(principal([]));
    await expect(
      guard.canActivate(contextFor(Routes.prototype.open)),
    ).resolves.toBe(true);
  });

  it('still answers 401 for an unknown key', async () => {
    repository.findActiveByHash.mockResolvedValue(null);
    await expect(
      guard.canActivate(contextFor(Routes.prototype.write)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('writes last_used_at at most once a minute per key', async () => {
    repository.findActiveByHash.mockResolvedValue(
      principal([ApiKeyScope.LEADS_WRITE]),
    );
    const fresh = new ApiKeyGuard(repository, new Reflector());

    await fresh.canActivate(contextFor(Routes.prototype.write));
    await fresh.canActivate(contextFor(Routes.prototype.write));
    await fresh.canActivate(contextFor(Routes.prototype.write));

    expect(repository.touchLastUsed).toHaveBeenCalledTimes(1);
  });
});
