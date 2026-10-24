import { Test, TestingModule } from '@nestjs/testing';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { MEMBERSHIP_REPOSITORY } from '../../domain/repositories/membership.repository';
import { RemoveMemberUseCase } from './remove-member.use-case';

describe('RemoveMemberUseCase', () => {
  let useCase: RemoveMemberUseCase;
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
        RemoveMemberUseCase,
        { provide: AuthorizationService, useValue: authorizationService },
        {
          provide: MEMBERSHIP_REPOSITORY,
          useValue: membershipRepository,
        },
      ],
    }).compile();

    useCase = module.get(RemoveMemberUseCase);
    jest.clearAllMocks();
    authorizationService.assertCan.mockResolvedValue(undefined);
  });

  const now = new Date('2026-01-01T00:00:00.000Z');
  const actorId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const targetMembershipId = '44444444-4444-4444-8444-444444444444';

  const membership = (role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER') => ({
    id: targetMembershipId,
    userId: '22222222-2222-4222-8222-222222222222',
    projectId,
    role,
    creadoEn: now,
    actualizadoEn: now,
  });

  const baseActor = (role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER') => ({
    id: 'actor-membership',
    userId: actorId,
    projectId,
    role,
    creadoEn: now,
    actualizadoEn: now,
  });

  it('lets an OWNER remove a MEMBER', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(
      baseActor('OWNER'),
    );
    membershipRepository.findByIdInProject.mockResolvedValue(
      membership('MEMBER'),
    );
    membershipRepository.deleteInProject.mockResolvedValue('deleted');

    await useCase.execute({
      actorUserId: actorId,
      projectId,
      targetMembershipId,
    });

    expect(authorizationService.assertCan).toHaveBeenCalledWith(
      actorId,
      Permission.MEMBER_REMOVE,
      projectId,
    );
    expect(membershipRepository.deleteInProject).toHaveBeenCalledWith(
      targetMembershipId,
      projectId,
    );
  });

  it('rejects an actor without MEMBER_REMOVE before touching memberships', async () => {
    authorizationService.assertCan.mockRejectedValueOnce(
      new ForbiddenException('Insufficient permissions for this project'),
    );

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetMembershipId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipRepository.findByUserAndProject).not.toHaveBeenCalled();
    expect(membershipRepository.findByIdInProject).not.toHaveBeenCalled();
    expect(membershipRepository.deleteInProject).not.toHaveBeenCalled();
  });

  it('returns 404 if the scoped delete affects no row', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(
      baseActor('OWNER'),
    );
    membershipRepository.findByIdInProject.mockResolvedValue(
      membership('MEMBER'),
    );
    membershipRepository.deleteInProject.mockResolvedValue('not_found');

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetMembershipId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an actor whose membership disappeared after the permission check', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(null);

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetMembershipId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipRepository.deleteInProject).not.toHaveBeenCalled();
  });

  it('rejects removing a membership from another project', async () => {
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
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(membershipRepository.findByIdInProject).toHaveBeenCalledWith(
      targetMembershipId,
      projectId,
    );
    expect(membershipRepository.deleteInProject).not.toHaveBeenCalled();
  });

  it('prevents an ADMIN from removing an OWNER', async () => {
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
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipRepository.deleteInProject).not.toHaveBeenCalled();
  });

  it('prevents removing the last OWNER', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(
      baseActor('OWNER'),
    );
    membershipRepository.findByIdInProject.mockResolvedValue(
      membership('OWNER'),
    );
    // El repositorio detecta el último OWNER dentro de la transacción.
    membershipRepository.deleteInProject.mockResolvedValue('last_owner');

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetMembershipId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipRepository.countOwners).not.toHaveBeenCalled();
  });

  it('allows removing an OWNER when another OWNER exists', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(
      baseActor('OWNER'),
    );
    membershipRepository.findByIdInProject.mockResolvedValue(
      membership('OWNER'),
    );
    membershipRepository.deleteInProject.mockResolvedValue('deleted');

    await useCase.execute({
      actorUserId: actorId,
      projectId,
      targetMembershipId,
    });

    expect(membershipRepository.deleteInProject).toHaveBeenCalledWith(
      targetMembershipId,
      projectId,
    );
  });
});
