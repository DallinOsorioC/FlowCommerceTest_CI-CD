import { NotFoundException } from '../../../common/exceptions/domain.exceptions';
import { UserEntity } from '../../domain/entities/user.entity';
import type { UserRepository } from '../../domain/repositories/user.repository';
import {
  GetMyProfileUseCase,
  UpdateMyProfileUseCase,
} from './profile.use-cases';

describe('Profile use-cases', () => {
  const repo: Record<keyof UserRepository, jest.Mock> = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    existsByEmail: jest.fn(),
    updateProfile: jest.fn(),
    setAvatar: jest.fn(),
    sharesProjectWith: jest.fn(),
  };
  const get = new GetMyProfileUseCase(repo);
  const update = new UpdateMyProfileUseCase(repo);
  const now = new Date();
  const user = new UserEntity(
    'u1',
    'Ana',
    'ana@example.com',
    now,
    now,
    true,
    '+57 300 000 0000',
    'Gerente',
  );

  beforeEach(() => jest.resetAllMocks());

  it('returns the profile with phone and position', async () => {
    repo.findById.mockResolvedValue(user);

    const profile = await get.execute('u1');

    expect(profile).toMatchObject({
      id: 'u1',
      phone: '+57 300 000 0000',
      position: 'Gerente',
    });
  });

  it('updates only phone and position of the session user', async () => {
    repo.updateProfile.mockResolvedValue(user);

    await update.execute('u1', { phone: '123', position: null });

    expect(repo.updateProfile).toHaveBeenCalledWith('u1', {
      phone: '123',
      position: null,
    });
  });

  it('returns 404 when the user no longer exists', async () => {
    repo.updateProfile.mockResolvedValue(null);
    repo.findById.mockResolvedValue(null);

    await expect(update.execute('u1', { phone: '1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(get.execute('u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
