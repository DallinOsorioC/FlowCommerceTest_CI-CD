import { Test, TestingModule } from '@nestjs/testing';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { NotFoundException } from '../../../common/exceptions/domain.exceptions';
import { ProjectEntity } from '../../domain/entities/project.entity';
import { PROJECT_REPOSITORY } from '../../domain/repositories/project.repository';
import { GetProjectUseCase } from './get-project.use-case';
import { UpdateProjectUseCase } from './update-project.use-case';

describe('Project detail and settings use-cases', () => {
  let module: TestingModule;
  const authorizationService = { assertCan: jest.fn() };
  const projectRepository = { findById: jest.fn(), update: jest.fn() };

  const actorId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const now = new Date('2026-01-01T00:00:00.000Z');
  const project = new ProjectEntity(
    projectId,
    'Mi empresa',
    'mi-empresa',
    null,
    now,
    now,
    {
      legalName: 'Mi Empresa S.A.S.',
      taxId: '900123456-7',
      address: null,
      phone: null,
      email: null,
    },
    {
      taxPercent: 16,
      folioPrefix: 'MIE',
      validityDays: 15,
      defaultTerms: 'Pago a 30 días',
      currency: 'COP',
    },
  );

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        GetProjectUseCase,
        UpdateProjectUseCase,
        { provide: AuthorizationService, useValue: authorizationService },
        { provide: PROJECT_REPOSITORY, useValue: projectRepository },
      ],
    }).compile();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    authorizationService.assertCan.mockResolvedValue(undefined);
  });

  describe('get()', () => {
    it('returns the project with billing profile and quote settings', async () => {
      projectRepository.findById.mockResolvedValue(project);

      const result = await module
        .get(GetProjectUseCase)
        .execute({ actorUserId: actorId, projectId });

      expect(result.billing.legalName).toBe('Mi Empresa S.A.S.');
      expect(result.quoteSettings).toEqual({
        taxPercent: 16,
        folioPrefix: 'MIE',
        validityDays: 15,
        defaultTerms: 'Pago a 30 días',
        currency: 'COP',
      });
      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.PROJECT_READ,
        projectId,
      );
    });

    it('returns 404 when the project does not exist', async () => {
      projectRepository.findById.mockResolvedValue(null);

      await expect(
        module
          .get(GetProjectUseCase)
          .execute({ actorUserId: actorId, projectId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not read anything without PROJECT_READ', async () => {
      authorizationService.assertCan.mockRejectedValue(new Error('forbidden'));

      await expect(
        module
          .get(GetProjectUseCase)
          .execute({ actorUserId: actorId, projectId }),
      ).rejects.toThrow('forbidden');
      expect(projectRepository.findById).not.toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('requires PROJECT_UPDATE and forwards only the given fields', async () => {
      projectRepository.update.mockResolvedValue(project);

      await module.get(UpdateProjectUseCase).execute({
        actorUserId: actorId,
        projectId,
        name: 'Nuevo nombre',
        quoteSettings: { taxPercent: 16 },
      });

      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.PROJECT_UPDATE,
        projectId,
      );
      expect(projectRepository.update).toHaveBeenCalledWith(projectId, {
        name: 'Nuevo nombre',
        description: undefined,
        billing: undefined,
        quoteSettings: { taxPercent: 16 },
      });
    });

    it('never writes when the actor lacks PROJECT_UPDATE', async () => {
      authorizationService.assertCan.mockRejectedValue(new Error('forbidden'));

      await expect(
        module
          .get(UpdateProjectUseCase)
          .execute({ actorUserId: actorId, projectId, name: 'x' }),
      ).rejects.toThrow('forbidden');
      expect(projectRepository.update).not.toHaveBeenCalled();
    });

    it('returns 404 when the project vanished', async () => {
      projectRepository.update.mockResolvedValue(null);

      await expect(
        module
          .get(UpdateProjectUseCase)
          .execute({ actorUserId: actorId, projectId, name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
