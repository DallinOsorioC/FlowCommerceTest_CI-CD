import { Test, TestingModule } from '@nestjs/testing';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { USER_REPOSITORY } from '../../../users/domain/repositories/user.repository';
import { MEMBERSHIP_REPOSITORY } from '../../domain/repositories/membership.repository';
import { AddMemberUseCase } from './add-member.use-case';

describe('AddMemberUseCase', () => {
  let useCase: AddMemberUseCase;
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
  const userRepository = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    existsByEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddMemberUseCase,
        { provide: AuthorizationService, useValue: authorizationService },
        {
          provide: MEMBERSHIP_REPOSITORY,
          useValue: membershipRepository,
        },
        {
          provide: USER_REPOSITORY,
          useValue: userRepository,
        },
      ],
    }).compile();

    useCase = module.get(AddMemberUseCase);
    jest.clearAllMocks();
    authorizationService.assertCan.mockResolvedValue(undefined);
  });

  const now = new Date('2026-01-01T00:00:00.000Z');
  const actorId = '11111111-1111-4111-8111-111111111111';
  const targetId = '22222222-2222-4222-8222-222222222222';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const membershipId = '44444444-4444-4444-8444-444444444444';

  const baseActor = (role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER') => ({
    id: `member-${role}`,
    userId: actorId,
    projectId,
    role,
    creadoEn: now,
    actualizadoEn: now,
  });

  it('adds a member when the actor is an OWNER', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValueOnce(
      baseActor('OWNER'),
    );
    membershipRepository.findByUserAndProject.mockResolvedValueOnce(null);
    userRepository.findById.mockResolvedValue({
      id: targetId,
      name: 'Ada Lovelace',
      email: 'ada@flowcommerce.local',
    });
    membershipRepository.create.mockResolvedValue({
      id: membershipId,
      userId: targetId,
      projectId,
      role: 'MEMBER',
      creadoEn: now,
      actualizadoEn: now,
    });

    const result = await useCase.execute({
      actorUserId: actorId,
      projectId,
      targetUserId: targetId,
      role: 'MEMBER',
    });

    expect(result.membership.role).toBe('MEMBER');
    expect(result.name).toBe('Ada Lovelace');
    expect(result.email).toBe('ada@flowcommerce.local');
    expect(membershipRepository.create).toHaveBeenCalledWith({
      userId: targetId,
      projectId,
      role: 'MEMBER',
    });
  });

  it('checks MEMBER_INVITE before anything else and blocks when denied', async () => {
    authorizationService.assertCan.mockRejectedValueOnce(
      new ForbiddenException('Insufficient permissions for this project'),
    );

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetUserId: targetId,
        role: 'VIEWER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorizationService.assertCan).toHaveBeenCalledWith(
      actorId,
      Permission.MEMBER_INVITE,
      projectId,
    );
    expect(membershipRepository.findByUserAndProject).not.toHaveBeenCalled();
    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(membershipRepository.create).not.toHaveBeenCalled();
  });

  it('rejects an actor whose membership disappeared after the permission check', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValue(null);

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetUserId: targetId,
        role: 'MEMBER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipRepository.create).not.toHaveBeenCalled();
  });

  it('prevents an ADMIN from granting OWNER', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValueOnce(
      baseActor('ADMIN'),
    );

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetUserId: targetId,
        role: 'OWNER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipRepository.create).not.toHaveBeenCalled();
  });

  it('lets an ADMIN grant MEMBER', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValueOnce(
      baseActor('ADMIN'),
    );
    membershipRepository.findByUserAndProject.mockResolvedValueOnce(null);
    userRepository.findById.mockResolvedValue({
      id: targetId,
      name: 'Ada Lovelace',
      email: 'ada@flowcommerce.local',
    });
    membershipRepository.create.mockResolvedValue({
      id: membershipId,
      userId: targetId,
      projectId,
      role: 'MEMBER',
      creadoEn: now,
      actualizadoEn: now,
    });

    const result = await useCase.execute({
      actorUserId: actorId,
      projectId,
      targetUserId: targetId,
      role: 'MEMBER',
    });

    expect(result.membership.role).toBe('MEMBER');
  });

  it('rejects adding a user that does not exist', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValueOnce(
      baseActor('OWNER'),
    );
    userRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetUserId: targetId,
        role: 'MEMBER',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects adding a user who is already a member', async () => {
    membershipRepository.findByUserAndProject.mockResolvedValueOnce(
      baseActor('OWNER'),
    );
    userRepository.findById.mockResolvedValue({
      id: targetId,
      name: 'Ada Lovelace',
      email: 'ada@flowcommerce.local',
    });
    membershipRepository.findByUserAndProject.mockResolvedValueOnce(
      baseActor('MEMBER'),
    );

    await expect(
      useCase.execute({
        actorUserId: actorId,
        projectId,
        targetUserId: targetId,
        role: 'MEMBER',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(membershipRepository.create).not.toHaveBeenCalled();
  });
});
