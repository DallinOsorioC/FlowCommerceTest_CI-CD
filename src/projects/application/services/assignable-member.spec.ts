import { BadRequestException } from '../../../common/exceptions/domain.exceptions';
import type { MembershipRepository } from '../../domain/repositories/membership.repository';
import { assertAssignableMember } from './assignable-member';

describe('assertAssignableMember', () => {
  const projectId = '33333333-3333-4333-8333-333333333333';
  const userId = '22222222-2222-4222-8222-222222222222';
  const findByUserAndProject = jest.fn();
  const repository = {
    findByUserAndProject,
  } as unknown as MembershipRepository;

  beforeEach(() => jest.clearAllMocks());

  it('accepts no assignee without querying', async () => {
    await assertAssignableMember(repository, null, projectId);
    await assertAssignableMember(repository, undefined, projectId);
    expect(findByUserAndProject).not.toHaveBeenCalled();
  });

  it('accepts a member of the same project', async () => {
    findByUserAndProject.mockResolvedValue({ role: 'MEMBER' });
    await assertAssignableMember(repository, userId, projectId);
    expect(findByUserAndProject).toHaveBeenCalledWith(userId, projectId);
  });

  it('rejects a user who is not a member of the project with 400', async () => {
    findByUserAndProject.mockResolvedValue(null);
    await expect(
      assertAssignableMember(repository, userId, projectId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
