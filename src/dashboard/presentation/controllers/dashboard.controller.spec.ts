import { INestApplication, VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { Permission, Role } from '@flowcommerce/types';
import { SESSION_MANAGER } from '../../../auth/application/ports/session-manager';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { REQUIRED_PERMISSIONS_KEY } from '../../../authorization/presentation/decorators/require-permission.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { GlobalExceptionFilter } from '../../../common/filters/global-exception.filter';
import { MEMBERSHIP_REPOSITORY } from '../../../projects/domain/repositories/membership.repository';
import { GetDashboardUseCase } from '../../application/use-cases/get-dashboard.use-case';
import { buildDashboard } from '../../domain/build-dashboard';
import { ProjectIdFormatGuard } from '../guards/project-id-format.guard';
import { DashboardController } from './dashboard.controller';

// Autorización del endpoint a nivel HTTP, sin base de datos: guards reales
// (AuthenticatedGuard, ProjectIdFormatGuard, ProjectPermissionGuard) y la
// matriz ROLE_PERMISSIONS real; solo se simulan la sesión y las membresías.
describe('DashboardController (authorization)', () => {
  let app: INestApplication<App>;

  const memberUserId = '11111111-1111-4111-8111-111111111111';
  const outsiderUserId = '22222222-2222-4222-8222-222222222222';
  const noPermissionUserId = '44444444-4444-4444-8444-444444444444';
  const projectA = '33333333-3333-4333-8333-333333333333';
  const projectB = '55555555-5555-4555-8555-555555555555';

  const dashboard = buildDashboard({
    leadsByStage: [],
    quotesByStatus: [],
    salesByMonth: [],
    leadsByMonth: [],
  });

  const getDashboardUseCase = { execute: jest.fn() };
  const sessionManager = { getSession: jest.fn() };
  const membershipRepository = { findByUserAndProject: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        AuthorizationService,
        { provide: GetDashboardUseCase, useValue: getDashboardUseCase },
        { provide: SESSION_MANAGER, useValue: sessionManager },
        { provide: MEMBERSHIP_REPOSITORY, useValue: membershipRepository },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // La cabecera x-test-user simula la cookie de sesión.
    sessionManager.getSession.mockImplementation((headers: Headers) => {
      const userId = headers.get('x-test-user');
      if (!userId) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        user: { id: userId, name: 'Test', email: 't@flowcommerce.test' },
        session: { id: `s-${userId}`, userId, expiresAt: new Date() },
      });
    });

    // memberUserId es VIEWER de projectA (el rol mínimo con PROJECT_READ);
    // noPermissionUserId tiene una membresía cuyo rol no concede PROJECT_READ;
    // outsiderUserId no pertenece a ningún proyecto.
    membershipRepository.findByUserAndProject.mockImplementation(
      (userId: string, projectId: string) => {
        if (userId === memberUserId && projectId === projectA) {
          return Promise.resolve({ role: Role.VIEWER });
        }
        if (userId === noPermissionUserId && projectId === projectA) {
          return Promise.resolve({ role: 'NO_PERMISSIONS' });
        }
        return Promise.resolve(null);
      },
    );

    getDashboardUseCase.execute.mockResolvedValue(dashboard);
  });

  const get = (projectId: string, userId?: string) => {
    const req = request(app.getHttpServer()).get(
      `/api/v1/projects/${projectId}/dashboard`,
    );
    return userId ? req.set('x-test-user', userId) : req;
  };

  it('declares PROJECT_READ and the guards in the expected order', () => {
    const reflector = new Reflector();
    const handler = Object.getOwnPropertyDescriptor(
      DashboardController.prototype,
      'getDashboard',
    )?.value as () => unknown;

    expect(
      reflector.get<readonly Permission[]>(REQUIRED_PERMISSIONS_KEY, handler),
    ).toEqual([Permission.PROJECT_READ]);

    // '__guards__' es la clave de metadata que escribe @UseGuards.
    expect(reflector.get<unknown[]>('__guards__', DashboardController)).toEqual(
      [AuthenticatedGuard, ProjectIdFormatGuard, ProjectPermissionGuard],
    );
  });

  it('returns 200 with the dashboard for an authorized user', async () => {
    const response = await get(projectA, memberUserId).expect(200);

    expect(response.body).toEqual(dashboard);
    expect(getDashboardUseCase.execute).toHaveBeenCalledWith({
      actorUserId: memberUserId,
      projectId: projectA,
    });
  });

  it('returns 403 for a user without PROJECT_READ in the project', async () => {
    await get(projectA, noPermissionUserId).expect(403);
    expect(getDashboardUseCase.execute).not.toHaveBeenCalled();
  });

  it('returns 403 for a member of another project (no cross-tenant access)', async () => {
    await get(projectB, memberUserId).expect(403);
    await get(projectA, outsiderUserId).expect(403);
    expect(getDashboardUseCase.execute).not.toHaveBeenCalled();
  });

  it('answers a foreign project and a non-existent one identically (anti-enumeration)', async () => {
    const foreign = await get(projectB, memberUserId).expect(403);
    const missing = await get(
      '66666666-6666-4666-8666-666666666666',
      memberUserId,
    ).expect(403);

    const strip = (body: Record<string, unknown>) => ({
      ...body,
      path: undefined,
      timestamp: undefined,
    });
    expect(strip(foreign.body as Record<string, unknown>)).toEqual(
      strip(missing.body as Record<string, unknown>),
    );
  });

  it('returns 400 for an invalid projectId without touching memberships', async () => {
    await get('not-a-uuid', memberUserId).expect(400);
    expect(membershipRepository.findByUserAndProject).not.toHaveBeenCalled();
    expect(getDashboardUseCase.execute).not.toHaveBeenCalled();
  });

  it('returns 401 without a session, before validating the projectId', async () => {
    await get(projectA).expect(401);
    await get('not-a-uuid').expect(401);
    expect(getDashboardUseCase.execute).not.toHaveBeenCalled();
  });
});
