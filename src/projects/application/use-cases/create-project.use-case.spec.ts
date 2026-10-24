import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '../../../common/exceptions/domain.exceptions';
import { PROJECT_REPOSITORY } from '../../domain/repositories/project.repository';
import { CreateProjectUseCase, normalizeSlug } from './create-project.use-case';

describe('CreateProjectUseCase', () => {
  let useCase: CreateProjectUseCase;
  const projectRepository = {
    findById: jest.fn(),
    findBySlug: jest.fn(),
    create: jest.fn(),
    createWithOwner: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateProjectUseCase,
        {
          provide: PROJECT_REPOSITORY,
          useValue: projectRepository,
        },
      ],
    }).compile();

    useCase = module.get(CreateProjectUseCase);
    jest.clearAllMocks();
  });

  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const projectId = '11111111-1111-4111-8111-111111111111';
  const ownerId = '22222222-2222-4222-8222-222222222222';
  const membershipId = '33333333-3333-4333-8333-333333333333';

  const projectEntity = (slug: string) => ({
    id: projectId,
    name: 'My Project',
    slug,
    description: null,
    creadoEn: createdAt,
    actualizadoEn: createdAt,
    toProject: () => ({
      id: projectId,
      name: 'My Project',
      slug,
      description: null,
      creadoEn: createdAt,
      actualizadoEn: createdAt,
    }),
  });

  const ownerEntity = {
    id: membershipId,
    userId: ownerId,
    projectId,
    role: 'OWNER',
    creadoEn: createdAt,
    actualizadoEn: createdAt,
  };

  it('creates a project with the actor as OWNER and returns it', async () => {
    projectRepository.findBySlug.mockResolvedValue(null);
    projectRepository.createWithOwner.mockResolvedValue({
      project: projectEntity('my-project'),
      ownerMembership: ownerEntity,
    });

    const result = await useCase.execute({
      ownerUserId: ownerId,
      name: 'My Project',
      slug: 'my-project',
    });

    expect(projectRepository.findBySlug).toHaveBeenCalledWith('my-project');
    expect(projectRepository.createWithOwner).toHaveBeenCalledWith({
      name: 'My Project',
      slug: 'my-project',
      description: null,
      ownerUserId: ownerId,
    });
    expect(result).toEqual({
      id: projectId,
      name: 'My Project',
      slug: 'my-project',
      description: null,
      creadoEn: createdAt,
      actualizadoEn: createdAt,
    });
  });

  it('normalizes the slug before creating', async () => {
    projectRepository.findBySlug.mockResolvedValue(null);
    projectRepository.createWithOwner.mockResolvedValue({
      project: projectEntity('my-project'),
      ownerMembership: ownerEntity,
    });

    await useCase.execute({
      ownerUserId: ownerId,
      name: 'My Project',
      slug: '  My Project  ',
    });

    expect(projectRepository.createWithOwner).toHaveBeenCalledWith({
      name: 'My Project',
      slug: 'my-project',
      description: null,
      ownerUserId: ownerId,
    });
  });

  it('rejects a duplicate slug with ConflictException', async () => {
    projectRepository.findBySlug.mockResolvedValue(projectEntity('my-project'));

    await expect(
      useCase.execute({
        ownerUserId: ownerId,
        name: 'My Project',
        slug: 'my-project',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(projectRepository.createWithOwner).not.toHaveBeenCalled();
  });

  it('converts whitespace runs to hyphens and lowercases the slug', () => {
    expect(normalizeSlug('  Alpha   Beta  ')).toBe('alpha-beta');
    expect(normalizeSlug('Hello-World')).toBe('hello-world');
  });
});
