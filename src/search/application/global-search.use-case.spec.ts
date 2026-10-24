import { Permission, Role } from '@flowcommerce/types';
import { ForbiddenException } from '../../common/exceptions/domain.exceptions';
import { GlobalSearchUseCase } from './global-search.use-case';

describe('GlobalSearchUseCase', () => {
  const authorizationService = {
    decide: jest.fn(),
    roleHasAny: jest.fn(),
  };
  const repository = { search: jest.fn() };
  const useCase = new GlobalSearchUseCase(
    authorizationService as never,
    repository,
  );

  beforeEach(() => jest.resetAllMocks());

  it('searches only the sections the role can read, with the trimmed term', async () => {
    authorizationService.decide.mockResolvedValue({
      allowed: true,
      role: Role.VIEWER,
    });
    authorizationService.roleHasAny.mockImplementation(
      (_role: Role, [permission]: Permission[]) =>
        permission !== Permission.CLIENT_READ,
    );
    repository.search.mockResolvedValue({ leads: [], clients: [], quotes: [] });

    await useCase.execute({
      actorUserId: 'u',
      projectId: 'p',
      q: '  Ana ',
      limit: 5,
    });

    expect(repository.search).toHaveBeenCalledWith(
      'p',
      'Ana',
      ['leads', 'quotes'],
      5,
    );
  });

  it('rejects a user who is not a member (403)', async () => {
    authorizationService.decide.mockResolvedValue({
      allowed: false,
      role: null,
    });

    await expect(
      useCase.execute({ actorUserId: 'u', projectId: 'p', q: 'x', limit: 5 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.search).not.toHaveBeenCalled();
  });
});
