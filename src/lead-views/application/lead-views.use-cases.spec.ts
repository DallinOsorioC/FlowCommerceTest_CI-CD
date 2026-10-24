/* eslint-disable @typescript-eslint/unbound-method -- los mocks de jest se inspeccionan como propiedades */
import { Permission } from '@flowcommerce/types';
import type { AuthorizationService } from '../../authorization/application/services/authorization.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../common/exceptions/domain.exceptions';
import {
  MAX_VIEWS_PER_USER,
  type LeadViewsRepository,
} from '../domain/lead-view';
import { LeadViewsUseCases } from './lead-views.use-cases';

describe('LeadViewsUseCases', () => {
  const actorUserId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const id = '55555555-5555-4555-8555-555555555555';

  const authorizationService = {
    assertCan: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuthorizationService>;
  const repository: jest.Mocked<LeadViewsRepository> = {
    list: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const useCases = new LeadViewsUseCases(authorizationService, repository);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.count.mockResolvedValue(0);
  });

  it('saves the view for the actor, keeping only known filters', async () => {
    await useCases.create({
      actorUserId,
      projectId,
      name: '  Mis leads en negociación ',
      filters: {
        stages: ['NEGOTIATION'],
        assignedUserId: actorUserId,
        sortBy: 'estimatedValue',
        order: 'desc',
        search: '',
        // Un campo que no es filtro: no se guarda.
        projectId: 'otro-proyecto',
      } as never,
    });

    expect(authorizationService.assertCan).toHaveBeenCalledWith(
      actorUserId,
      Permission.PROJECT_READ,
      projectId,
    );
    expect(repository.create).toHaveBeenCalledWith({
      projectId,
      userId: actorUserId,
      name: 'Mis leads en negociación',
      filters: {
        stages: ['NEGOTIATION'],
        assignedUserId: actorUserId,
        sortBy: 'estimatedValue',
        order: 'desc',
      },
    });
  });

  it('rejects a blank name', async () => {
    await expect(
      useCases.create({ actorUserId, projectId, name: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('stops at the per-user cap', async () => {
    repository.count.mockResolvedValue(MAX_VIEWS_PER_USER);

    await expect(
      useCases.create({ actorUserId, projectId, name: 'Una más' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('only touches the actor’s own views (scoped by user and project)', async () => {
    repository.update.mockResolvedValue(null);
    repository.delete.mockResolvedValue(false);

    await expect(
      useCases.update({ actorUserId, projectId, id, name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      useCases.remove({ actorUserId, projectId, id }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.update).toHaveBeenCalledWith(
      id,
      projectId,
      actorUserId,
      expect.anything(),
    );
    expect(repository.delete).toHaveBeenCalledWith(id, projectId, actorUserId);
  });
});
