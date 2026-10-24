import { Test, TestingModule } from '@nestjs/testing';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { ForbiddenException } from '../../../common/exceptions/domain.exceptions';
import { MEMBERSHIP_REPOSITORY } from '../../domain/repositories/membership.repository';
import { ListProjectMembersUseCase } from './list-project-members.use-case';

describe('ListProjectMembersUseCase', () => {
  let useCase: ListProjectMembersUseCase;
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
        ListProjectMembersUseCase,
        { provide: AuthorizationService, useValue: authorizationService },
        {
          provide: MEMBERSHIP_REPOSITORY,
          useValue: membershipRepository,
        },
      ],
    }).compile();

    useCase = module.get(ListProjectMembersUseCase);
    jest.clearAllMocks();
    authorizationService.assertCan.mockResolvedValue(undefined);
  });

  const now = new Date('2026-01-01T00:00:00.000Z');
  const actorId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';

  it('returns members for an actor with MEMBER_READ', async () => {
    membershipRepository.findMembersByProject.mockResolvedValue([
      {
        membership: {
          id: 'm1',
          userId: actorId,
          projectId,
          role: 'VIEWER',
          creadoEn: now,
          actualizadoEn: now,
        },
        userId: actorId,
        name: 'Ada Lovelace',
        email: 'ada@flowcommerce.local',
      },
    ]);

    const result = await useCase.execute({ actorUserId: actorId, projectId });

    expect(result).toHaveLength(1);
    expect(authorizationService.assertCan).toHaveBeenCalledWith(
      actorId,
      Permission.MEMBER_READ,
      projectId,
    );
    expect(membershipRepository.findMembersByProject).toHaveBeenCalledWith(
      projectId,
    );
  });

  it('rejects an actor without MEMBER_READ (e.g. a non-member)', async () => {
    authorizationService.assertCan.mockRejectedValueOnce(
      new ForbiddenException('Insufficient permissions for this project'),
    );

    await expect(
      useCase.execute({ actorUserId: actorId, projectId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipRepository.findMembersByProject).not.toHaveBeenCalled();
  });
});
