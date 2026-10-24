import { Test, TestingModule } from '@nestjs/testing';
import { Permission } from '@flowcommerce/types';
import { ForbiddenException } from '../../../common/exceptions/domain.exceptions';
import { MEMBERSHIP_REPOSITORY } from '../../../projects/domain/repositories/membership.repository';
import { AuthorizationService } from './authorization.service';

describe('AuthorizationService', () => {
  let service: AuthorizationService;
  const membershipRepository = {
    findByIdInProject: jest.fn(),
    findMemberByIdInProject: jest.fn(),
    findByUserAndProject: jest.fn(),
    findMembersByProject: jest.fn(),
    findMyProjects: jest.fn(),
    create: jest.fn(),
    updateRoleInProject: jest.fn(),
    deleteInProject: jest.fn(),
    countOwners: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthorizationService,
        {
          provide: MEMBERSHIP_REPOSITORY,
          useValue: membershipRepository,
        },
      ],
    }).compile();

    service = module.get(AuthorizationService);
    jest.clearAllMocks();
  });

  const userId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';

  it('ALLOWs when the user is a member with the required permission', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue({
      id: 'm1',
      userId,
      projectId,
      role: 'ADMIN',
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });

    await expect(
      service.can(userId, Permission.MEMBER_INVITE, projectId),
    ).resolves.toBe(true);
  });

  it('DENYs when the membership exists but the role lacks the permission', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue({
      id: 'm1',
      userId,
      projectId,
      role: 'VIEWER',
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });

    await expect(
      service.can(userId, Permission.MEMBER_INVITE, projectId),
    ).resolves.toBe(false);
  });

  it('DENYs when the user has no membership', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(null);

    await expect(
      service.can(userId, Permission.PROJECT_READ, projectId),
    ).resolves.toBe(false);
  });

  it('requires ALL permissions for canAll', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue({
      id: 'm1',
      userId,
      projectId,
      role: 'ADMIN',
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });

    await expect(
      service.canAll(
        userId,
        [Permission.MEMBER_READ, Permission.MEMBER_INVITE],
        projectId,
      ),
    ).resolves.toBe(true);

    await expect(
      service.canAll(
        userId,
        [Permission.MEMBER_READ, Permission.PROJECT_DELETE],
        projectId,
      ),
    ).resolves.toBe(false);
  });

  it('exposes the resolved role in decide', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue({
      id: 'm1',
      userId,
      projectId,
      role: 'OWNER',
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });

    const decision = await service.decide(
      userId,
      [Permission.PROJECT_DELETE],
      projectId,
    );

    expect(decision.allowed).toBe(true);
    expect(decision.role).toBe('OWNER');
  });

  it('assertCan throws ForbiddenException when not allowed', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(null);

    await expect(
      service.assertCan(userId, Permission.LEAD_CREATE, projectId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assertCan resolves when allowed', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue({
      id: 'm1',
      userId,
      projectId,
      role: 'OWNER',
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });

    await expect(
      service.assertCan(userId, Permission.LEAD_CREATE, projectId),
    ).resolves.toBeUndefined();
  });
});
