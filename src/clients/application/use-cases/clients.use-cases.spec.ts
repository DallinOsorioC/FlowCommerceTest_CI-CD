import { Test, TestingModule } from '@nestjs/testing';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import { Permission } from '@flowcommerce/types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { LEADS_REPOSITORY } from '../../../leads/domain/repositories/lead.repository';
import { MEMBERSHIP_REPOSITORY } from '../../../projects/domain/repositories/membership.repository';
import {
  CLIENTS_REPOSITORY,
  type ClientRepository,
} from '../../domain/repositories/client.repository';
import { CreateClientUseCase } from './create-client.use-case';
import { DeleteClientUseCase } from './delete-client.use-case';
import { GetClientUseCase } from './get-client.use-case';
import { ListClientsUseCase } from './list-clients.use-case';
import { UpdateClientUseCase } from './update-client.use-case';

describe('Clients use-cases', () => {
  let module: TestingModule;
  const authorizationService = { assertCan: jest.fn() };
  const clientRepository: Record<keyof ClientRepository, jest.Mock> = {
    findByIdInProject: jest.fn(),
    listByProject: jest.fn(),
    create: jest.fn(),
    updateInProject: jest.fn(),
    deleteInProject: jest.fn(),
    getStatsInProject: jest.fn(),
    getStatsForClientsInProject: jest.fn(),
    getSummaryInProject: jest.fn(),
    createFromLead: jest.fn(),
    findPossibleDuplicatesInProject: jest.fn(),
  };
  const membershipRepository = { findByUserAndProject: jest.fn() };
  const leadRepository = { findByIdInProject: jest.fn() };

  const actorId = '11111111-1111-4111-8111-111111111111';
  const memberId = '22222222-2222-4222-8222-222222222222';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const clientId = '44444444-4444-4444-8444-444444444444';
  const leadId = '77777777-7777-4777-8777-777777777777';
  const denied = new ForbiddenException(
    'Insufficient permissions for this project',
  );
  const client = { id: clientId, projectId, name: 'Rodrigo Castillo' };

  const createInput = {
    actorUserId: actorId,
    projectId,
    name: ' Rodrigo Castillo ',
    company: 'Transportes Quetzal',
    taxId: '7745213-8',
    email: null,
    phone: null,
    notes: null,
    assignedUserId: memberId,
    sourceLeadId: null,
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        CreateClientUseCase,
        ListClientsUseCase,
        GetClientUseCase,
        UpdateClientUseCase,
        DeleteClientUseCase,
        { provide: AuthorizationService, useValue: authorizationService },
        { provide: CLIENTS_REPOSITORY, useValue: clientRepository },
        { provide: MEMBERSHIP_REPOSITORY, useValue: membershipRepository },
        { provide: LEADS_REPOSITORY, useValue: leadRepository },
        { provide: ActivityRecorder, useValue: { record: jest.fn() } },
      ],
    }).compile();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authorizationService.assertCan.mockResolvedValue(undefined);
    membershipRepository.findByUserAndProject.mockResolvedValue({
      role: 'MEMBER',
    });
  });

  describe('create', () => {
    it('requires CLIENT_CREATE, validates the assignee and creates in the project', async () => {
      clientRepository.create.mockResolvedValue(client);

      await module.get(CreateClientUseCase).execute(createInput);

      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.CLIENT_CREATE,
        projectId,
      );
      expect(membershipRepository.findByUserAndProject).toHaveBeenCalledWith(
        memberId,
        projectId,
      );
      expect(clientRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId, name: 'Rodrigo Castillo' }),
      );
    });

    it('rejects an assignee from another project with 400', async () => {
      membershipRepository.findByUserAndProject.mockResolvedValue(null);

      await expect(
        module.get(CreateClientUseCase).execute(createInput),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(clientRepository.create).not.toHaveBeenCalled();
    });

    it('rejects a source lead from another project with 404', async () => {
      leadRepository.findByIdInProject.mockResolvedValue(null);

      await expect(
        module
          .get(CreateClientUseCase)
          .execute({ ...createInput, sourceLeadId: leadId }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(leadRepository.findByIdInProject).toHaveBeenCalledWith(
        leadId,
        projectId,
      );
      expect(clientRepository.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate tax id to 409', async () => {
      clientRepository.create.mockRejectedValue({ cause: { code: '23505' } });

      await expect(
        module.get(CreateClientUseCase).execute(createInput),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not touch anything when the permission is denied', async () => {
      authorizationService.assertCan.mockRejectedValueOnce(denied);

      await expect(
        module.get(CreateClientUseCase).execute(createInput),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(membershipRepository.findByUserAndProject).not.toHaveBeenCalled();
      expect(clientRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('list / get', () => {
    beforeEach(() => {
      clientRepository.getSummaryInProject.mockResolvedValue({
        activeClients: 0,
        billedSince: 0,
      });
    });

    it('lists with CLIENT_READ scoped to the project', async () => {
      clientRepository.listByProject.mockResolvedValue({
        clients: [],
        total: 0,
      });

      await module.get(ListClientsUseCase).execute({
        actorUserId: actorId,
        projectId,
        search: 'quetzal',
      });

      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.CLIENT_READ,
        projectId,
      );
      expect(clientRepository.listByProject).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({ search: 'quetzal' }),
      );
    });

    it('B10: adds the quotes and sales of each client with ONE query', async () => {
      const stats = { quotesCount: 3, paidQuotesCount: 1, salesTotal: 1000 };
      clientRepository.listByProject.mockResolvedValue({
        clients: [{ id: 'c1' }, { id: 'c2' }],
        total: 2,
      });
      clientRepository.getStatsForClientsInProject.mockResolvedValue(
        new Map([['c1', stats]]),
      );

      const result = await module.get(ListClientsUseCase).execute({
        actorUserId: actorId,
        projectId,
      });

      expect(
        clientRepository.getStatsForClientsInProject,
      ).toHaveBeenCalledTimes(1);
      expect(clientRepository.getStatsForClientsInProject).toHaveBeenCalledWith(
        ['c1', 'c2'],
        projectId,
      );
      expect(result.statsById.get('c1')).toEqual(stats);
    });

    it('adds the header summary: active clients and billed since 1 January (UTC)', async () => {
      clientRepository.listByProject.mockResolvedValue({
        clients: [],
        total: 0,
      });
      clientRepository.getStatsForClientsInProject.mockResolvedValue(new Map());
      clientRepository.getSummaryInProject.mockResolvedValue({
        activeClients: 32,
        billedSince: 1240600,
      });

      const result = await module
        .get(ListClientsUseCase)
        .execute(
          { actorUserId: actorId, projectId, search: 'solo este' },
          new Date('2026-10-23T12:00:00.000Z'),
        );

      expect(clientRepository.getSummaryInProject).toHaveBeenCalledWith(
        projectId,
        new Date('2026-01-01T00:00:00.000Z'),
      );
      expect(result.summary).toEqual({
        activeClients: 32,
        billedThisYear: 1240600,
      });
    });

    it('returns 404 for a client of another project', async () => {
      clientRepository.findByIdInProject.mockResolvedValue(null);

      await expect(
        module
          .get(GetClientUseCase)
          .execute({ actorUserId: actorId, projectId, clientId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('requires CLIENT_UPDATE and returns 404 outside the project', async () => {
      clientRepository.updateInProject.mockResolvedValue(null);

      await expect(
        module.get(UpdateClientUseCase).execute({
          actorUserId: actorId,
          projectId,
          clientId,
          name: 'Nuevo',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.CLIENT_UPDATE,
        projectId,
      );
    });

    it('validates a new assignee before writing', async () => {
      membershipRepository.findByUserAndProject.mockResolvedValue(null);

      await expect(
        module.get(UpdateClientUseCase).execute({
          actorUserId: actorId,
          projectId,
          clientId,
          assignedUserId: memberId,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(clientRepository.updateInProject).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('requires CLIENT_DELETE and deletes scoped by project', async () => {
      clientRepository.deleteInProject.mockResolvedValue(true);

      await module
        .get(DeleteClientUseCase)
        .execute({ actorUserId: actorId, projectId, clientId });

      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.CLIENT_DELETE,
        projectId,
      );
      expect(clientRepository.deleteInProject).toHaveBeenCalledWith(
        clientId,
        projectId,
      );
    });

    it('returns 404 when nothing was deleted', async () => {
      clientRepository.deleteInProject.mockResolvedValue(false);

      await expect(
        module
          .get(DeleteClientUseCase)
          .execute({ actorUserId: actorId, projectId, clientId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 409 when the client still has leads or quotes', async () => {
      clientRepository.deleteInProject.mockRejectedValue({
        cause: { code: '23503' },
      });

      await expect(
        module
          .get(DeleteClientUseCase)
          .execute({ actorUserId: actorId, projectId, clientId }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
