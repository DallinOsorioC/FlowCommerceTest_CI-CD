import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, Role } from '@flowcommerce/types';
import type { ExecutionContext } from '@nestjs/common';
import { AuthorizationService } from '../../application/services/authorization.service';
import { ProjectPermissionGuard } from './project-permission.guard';

describe('ProjectPermissionGuard', () => {
  let guard: ProjectPermissionGuard;
  const reflector = { getAllAndOverride: jest.fn() };
  const authorizationService = {
    can: jest.fn(),
    canAll: jest.fn(),
    decide: jest.fn(),
    roleHasAny: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new ProjectPermissionGuard(
      reflector as unknown as Reflector,
      authorizationService as unknown as AuthorizationService,
    );
  });

  const projectId = '11111111-1111-4111-8111-111111111111';

  const mockContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
      getHandler: () => '',
      getClass: () => '',
    }) as unknown as ExecutionContext;

  it('passes through when no permission is required and there is no project', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const result = await guard.canActivate(mockContext({ userId: 'u1' }));

    expect(result).toBe(true);
    expect(authorizationService.decide).not.toHaveBeenCalled();
  });

  it('fails closed on a project-scoped route that forgot to declare permissions', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(
      guard.canActivate(mockContext({ userId: 'u1', params: { projectId } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorizationService.decide).not.toHaveBeenCalled();
  });

  it('rejects when there is no authenticated user', async () => {
    reflector.getAllAndOverride.mockReturnValue([Permission.PROJECT_READ]);

    await expect(guard.canActivate(mockContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when no projectId is present in the request', async () => {
    reflector.getAllAndOverride.mockReturnValue([Permission.PROJECT_READ]);

    await expect(
      guard.canActivate(mockContext({ userId: 'u1', params: {} })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a malformed projectId before it reaches the database', async () => {
    reflector.getAllAndOverride.mockReturnValue([Permission.PROJECT_READ]);

    await expect(
      guard.canActivate(
        mockContext({ userId: 'u1', params: { projectId: 'not-a-uuid' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorizationService.decide).not.toHaveBeenCalled();
  });

  it('rejects a request without the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue([Permission.MEMBER_INVITE]);
    authorizationService.decide.mockResolvedValue({
      allowed: false,
      role: Role.VIEWER,
    });

    await expect(
      guard.canActivate(mockContext({ userId: 'u1', params: { projectId } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves projectId from the route param and allows the request', async () => {
    reflector.getAllAndOverride.mockReturnValue([Permission.PROJECT_READ]);
    authorizationService.decide.mockResolvedValue({
      allowed: true,
      role: Role.ADMIN,
    });

    const request = {
      userId: 'u1',
      params: { projectId },
    } as Record<string, unknown>;

    const result = await guard.canActivate(mockContext(request));

    expect(result).toBe(true);
    expect(authorizationService.decide).toHaveBeenCalledWith(
      'u1',
      [Permission.PROJECT_READ],
      projectId,
    );
    expect(request.projectId).toBe(projectId);
    expect(request.userProjectRole).toBe('ADMIN');
  });
});
