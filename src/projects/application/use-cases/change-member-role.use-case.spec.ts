import { Test, TestingModule } from '@nestjs/testing';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { MEMBERSHIP_REPOSITORY } from '../../domain/repositories/membership.repository';
import { ChangeMemberRoleUseCase } from './change-member-role.use-case';

describe('ChangeMemberRoleUseCase', () => {
  let useCase: ChangeMemberRoleUseCase;
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
  const authorizationService = {
    assertCan: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChangeMemberRoleUseCase,
        { provide: AuthorizationService, useValue: authorizationService },
        {
          provide: MEMBERSHIP_REPOSITORY,
          useValue: membershipRepository,
        },
      ],
    }).compile();

    useCase = module.get(ChangeMemberRoleUseCase);
    jest.clearAllMocks();
    authorizationService.assertCan.mockResolvedValue(undefined);
  });

  const now = new Date('2026-01-01T00:00:00.000Z');
  const actorId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const targetMembershipId = '44444444-4444-4444-8444-444444444444';

  const membership = (
    role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER',
    id = targetMembershipId,
    memberId = '22222222-2222-4222-8222-222222222222',
  ) => ({
    id,
    userId: memberId,
    projectId,
    role,
    creadoEn: now,
    actualizadoEn: now,
  });

  const baseActor = (role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER') =>
    membership(role, 'actor-membership', actorId);

  it('lets an OWNER change a MEMBER to ADMIN', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(
      baseActor('OWNER'),
    );
    membershipRepository.findByIdInProject.mockResolvedValue(
      membership('MEMBER'),
    );
    membershipRepository.updateRoleInProject.mockResolvedValue({
      status: 'ok',
      membership: membership('ADMIN'),
    });
    membershipRepository.findMemberByIdInProject.mockResolvedValue({
      membership: membership('ADMIN'),
      userId: '22222222-2222-4222-8222-222222222222',
      name: 'Ada Lovelace',
      email: 'ada@flowcommerce.local',
    });

    const result = await useCase.execute({
      actorUserId: actorId,
      projectId,
      targetMembershipId,
      newRole: 'ADMIN',
    });

    expect(result.membership.role).toBe('ADMIN');
    expect(authorizationService.assertCan).toHaveBeenCalledWith(
      actorId,
      Permission.MEMBER_UPDATE_ROLE,
      projectId,
    );
    expect(membershipRepository.findByIdInProject).toHaveBeenCalledWith(
      targetMembershipId,
      projectId,
    );
    expect(membershipRepository.updateRoleInProject).toHaveBeenCalledWith(
      targetMembershipId,
      projectId,
      'ADMIN',
    );
  });

  it('rejects an actor without MEMBER_UPDATE_ROLE before touching memberships', async () => {
    authorizationService.assertCan.mockRejectedValueOnce(
      new ForbiddenException('Insufficient permissions for this project'),
    );

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetMembershipId,
        newRole: 'VIEWER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipRepository.findByUserAndProject).not.toHaveBeenCalled();
    expect(membershipRepository.findByIdInProject).not.toHaveBeenCalled();
    expect(membershipRepository.updateRoleInProject).not.toHaveBeenCalled();
  });

  it('rejects an actor whose membership disappeared after the permission check', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(null);

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetMembershipId,
        newRole: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipRepository.updateRoleInProject).not.toHaveBeenCalled();
  });

  it('rejects a membership that does not belong to the project (404)', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(
      baseActor('OWNER'),
    );
    // El repositorio filtra por (id, projectId): una membership de otro
    // proyecto no aparece.
    membershipRepository.findByIdInProject.mockResolvedValue(null);

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetMembershipId,
        newRole: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(membershipRepository.findByIdInProject).toHaveBeenCalledWith(
      targetMembershipId,
      projectId,
    );
    expect(membershipRepository.updateRoleInProject).not.toHaveBeenCalled();
  });

  it('returns 404 if the scoped update affects no row', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(
      baseActor('OWNER'),
    );
    membershipRepository.findByIdInProject.mockResolvedValue(
      membership('MEMBER'),
    );
    membershipRepository.updateRoleInProject.mockResolvedValue({
      status: 'not_found',
    });

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetMembershipId,
        newRole: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(membershipRepository.findMemberByIdInProject).not.toHaveBeenCalled();
  });

  it('prevents an ADMIN from changing an OWNER role', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(
      baseActor('ADMIN'),
    );
    membershipRepository.findByIdInProject.mockResolvedValue(
      membership('OWNER'),
    );

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetMembershipId,
        newRole: 'MEMBER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents demoting the last OWNER', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(
      baseActor('OWNER'),
    );
    membershipRepository.findByIdInProject.mockResolvedValue(
      membership('OWNER'),
    );
    // El repositorio detecta el último OWNER dentro de la transacción.
    membershipRepository.updateRoleInProject.mockResolvedValue({
      status: 'last_owner',
    });

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetMembershipId,
        newRole: 'MEMBER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipRepository.countOwners).not.toHaveBeenCalled();
  });

  it('allows demoting an OWNER when another OWNER exists', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(
      baseActor('OWNER'),
    );
    membershipRepository.findByIdInProject.mockResolvedValue(
      membership('OWNER'),
    );
    membershipRepository.updateRoleInProject.mockResolvedValue({
      status: 'ok',
      membership: membership('MEMBER'),
    });
    membershipRepository.findMemberByIdInProject.mockResolvedValue({
      membership: membership('MEMBER'),
      userId: '22222222-2222-4222-8222-222222222222',
      name: 'Ada Lovelace',
      email: 'ada@flowcommerce.local',
    });

    const result = await useCase.execute({
      actorUserId: actorId,
      projectId,
      targetMembershipId,
      newRole: 'MEMBER',
    });

    expect(result.membership.role).toBe('MEMBER');
  });

  it('prevents an ADMIN from granting OWNER', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(
      baseActor('ADMIN'),
    );
    membershipRepository.findByIdInProject.mockResolvedValue(
      membership('MEMBER'),
    );

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetMembershipId,
        newRole: 'OWNER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipRepository.updateRoleInProject).not.toHaveBeenCalled();
  });
});
