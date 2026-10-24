import { Test, TestingModule } from '@nestjs/testing';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import { LeadSource, LeadStage, Permission } from '@flowcommerce/types';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { MEMBERSHIP_REPOSITORY } from '../../../projects/domain/repositories/membership.repository';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../domain/repositories/lead.repository';
import { LEAD_REFERENCES_READER } from '../../domain/repositories/lead-references.reader';
import { NotificationPublisher } from '../../../notifications/application/notification-publisher';
import { CreateLeadUseCase } from './create-lead.use-case';
import { DeleteLeadUseCase } from './delete-lead.use-case';
import { GetLeadUseCase } from './get-lead.use-case';
import { ListLeadsUseCase } from './list-leads.use-case';
import { UpdateLeadUseCase } from './update-lead.use-case';

describe('Leads use-cases (tenant isolation)', () => {
  let module: TestingModule;
  const notifications = { notify: jest.fn() };
  const referencesReader = {
    findClientInProject: jest.fn(),
    findProductInProject: jest.fn(),
  };
  const authorizationService = {
    assertCan: jest.fn(),
  };
  const leadRepository: Record<keyof LeadRepository, jest.Mock> = {
    findByIdInProject: jest.fn(),
    findByPhoneDigitsInProject: jest.fn(),
    listByProject: jest.fn(),
    findOrCreateByPhoneInProject: jest.fn(),
    touchLastContactInProject: jest.fn(),
    create: jest.fn(),
    updateInProject: jest.fn(),
    linkClientInProject: jest.fn(),
    deleteInProject: jest.fn(),
  };
  const membershipRepository = { findByUserAndProject: jest.fn() };

  const actorId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const leadId = '77777777-7777-4777-8777-777777777777';
  const foreignLeadId = '88888888-8888-4888-8888-888888888888';
  const now = new Date('2026-01-01T00:00:00.000Z');

  const lead = {
    id: leadId,
    projectId,
    name: 'Ana Torres',
    email: 'ana@example.com',
    phone: '+52 55 1234 5678',
    stage: LeadStage.NEW,
    score: 0,
    creadoEn: now,
    actualizadoEn: now,
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        CreateLeadUseCase,
        ListLeadsUseCase,
        GetLeadUseCase,
        UpdateLeadUseCase,
        DeleteLeadUseCase,
        {
          provide: AuthorizationService,
          useValue: authorizationService,
        },
        {
          provide: LEADS_REPOSITORY,
          useValue: leadRepository,
        },
        {
          provide: MEMBERSHIP_REPOSITORY,
          useValue: membershipRepository,
        },
        { provide: LEAD_REFERENCES_READER, useValue: referencesReader },
        { provide: NotificationPublisher, useValue: notifications },
        { provide: ActivityRecorder, useValue: { record: jest.fn() } },
      ],
    }).compile();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Por defecto, cliente y producto existen y están activos.
    referencesReader.findClientInProject.mockResolvedValue({
      name: 'Acme',
      active: true,
    });
    referencesReader.findProductInProject.mockResolvedValue({
      name: 'Licencia',
      active: true,
    });
  });

  describe('create()', () => {
    it('only creates within the authorized project', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.create.mockResolvedValue(lead);

      const created = await module.get(CreateLeadUseCase).execute({
        actorUserId: actorId,
        projectId,
        name: 'Ana Torres',
        email: 'ana@example.com',
        phone: '+52 55 1234 5678',
        stage: LeadStage.NEW,
        score: 0,
      });

      expect(created.id).toBe(leadId);
      expect(leadRepository.create).toHaveBeenCalledWith({
        projectId,
        name: 'Ana Torres',
        email: 'ana@example.com',
        phone: '+52 55 1234 5678',
        stage: LeadStage.NEW,
        score: 0,
        company: null,
        source: null,
        estimatedValue: null,
        notes: null,
        assignedUserId: null,
        clientId: null,
        interestProductId: null,
        lastContactAt: null,
        contactPosition: null,
        origin: 'MANUAL',
      });
      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.LEAD_CREATE,
        projectId,
      );
    });

    it('validates the responsible user as a member of the project', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      membershipRepository.findByUserAndProject.mockResolvedValue(null);

      await expect(
        module.get(CreateLeadUseCase).execute({
          actorUserId: actorId,
          projectId,
          name: 'Ana Torres',
          email: null,
          phone: null,
          stage: LeadStage.NEW,
          score: 0,
          assignedUserId: foreignLeadId,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(membershipRepository.findByUserAndProject).toHaveBeenCalledWith(
        foreignLeadId,
        projectId,
      );
      expect(leadRepository.create).not.toHaveBeenCalled();
    });

    it('maps a client or product of another project to 404', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.create.mockRejectedValueOnce({
        cause: {
          code: '23503',
          constraint_name: 'leads_client_id_project_id_clients_fk',
        },
      });

      await expect(
        module.get(CreateLeadUseCase).execute({
          actorUserId: actorId,
          projectId,
          name: 'Ana Torres',
          email: null,
          phone: null,
          stage: LeadStage.NEW,
          score: 0,
          clientId: foreignLeadId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('C4/P4: refuses an inactive client or interest product (409)', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      referencesReader.findClientInProject.mockResolvedValueOnce({
        name: 'Acme',
        active: false,
      });
      const base = {
        actorUserId: actorId,
        projectId,
        name: 'Ana',
        email: null,
        phone: null,
        stage: LeadStage.NEW,
        score: 0,
      };

      await expect(
        module.get(CreateLeadUseCase).execute({ ...base, clientId: leadId }),
      ).rejects.toBeInstanceOf(ConflictException);

      referencesReader.findProductInProject.mockResolvedValueOnce({
        name: 'Licencia',
        active: false,
      });
      await expect(
        module
          .get(CreateLeadUseCase)
          .execute({ ...base, interestProductId: leadId }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(leadRepository.create).not.toHaveBeenCalled();
    });

    it('stores the pipeline fields', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      membershipRepository.findByUserAndProject.mockResolvedValue({
        role: 'MEMBER',
      });
      leadRepository.create.mockResolvedValue(lead);
      const lastContactAt = new Date('2026-09-11T15:00:00.000Z');

      await module.get(CreateLeadUseCase).execute({
        actorUserId: actorId,
        projectId,
        name: 'Andrea López',
        email: null,
        phone: null,
        stage: LeadStage.NEGOTIATION,
        score: 0,
        company: 'Constructora Nova',
        source: LeadSource.REFERRAL,
        estimatedValue: 28900,
        notes: 'Necesita integración con su ERP',
        assignedUserId: actorId,
        lastContactAt,
      });

      expect(leadRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: LeadStage.NEGOTIATION,
          company: 'Constructora Nova',
          source: LeadSource.REFERRAL,
          estimatedValue: 28900,
          assignedUserId: actorId,
          lastContactAt,
        }),
      );
    });

    it('does not persist anything when the actor lacks LEAD_CREATE', async () => {
      authorizationService.assertCan.mockRejectedValue(new Error('forbidden'));

      await expect(
        module.get(CreateLeadUseCase).execute({
          actorUserId: actorId,
          projectId,
          name: 'Ana Torres',
          email: null,
          phone: null,
          stage: LeadStage.NEW,
          score: 0,
        }),
      ).rejects.toThrow('forbidden');

      expect(leadRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('list()', () => {
    it('always scopes the query by projectId, even with no filters', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.listByProject.mockResolvedValue({
        leads: [lead],
        total: 1,
      });

      const result = await module
        .get(ListLeadsUseCase)
        .execute({ actorUserId: actorId, projectId });

      expect(result.leads).toEqual([lead]);
      expect(result.total).toBe(1);
      expect(leadRepository.listByProject).toHaveBeenCalledWith(projectId, {
        stage: undefined,
        search: undefined,
        page: undefined,
        limit: undefined,
      });
      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.LEAD_READ,
        projectId,
      );
    });

    it('keeps the tenant when stage/search/pagination are applied', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.listByProject.mockResolvedValue({ leads: [], total: 0 });

      await module.get(ListLeadsUseCase).execute({
        actorUserId: actorId,
        projectId,
        stage: LeadStage.QUALIFIED,
        search: 'ana',
        page: 2,
        limit: 10,
      });

      // El projectId sigue siendo el primer argumento: ningún filtro lo sustituye.
      expect(leadRepository.listByProject).toHaveBeenCalledWith(projectId, {
        stage: LeadStage.QUALIFIED,
        search: 'ana',
        page: 2,
        limit: 10,
      });
    });

    it('forwards the pipeline filters and sorting, still scoped by project', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.listByProject.mockResolvedValue({ leads: [], total: 0 });
      const createdFrom = new Date('2026-09-01T00:00:00.000Z');

      await module.get(ListLeadsUseCase).execute({
        actorUserId: actorId,
        projectId,
        stages: [LeadStage.NEW, LeadStage.NEGOTIATION],
        assignedUserId: actorId,
        source: LeadSource.WEBSITE,
        createdFrom,
        sortBy: 'estimatedValue',
        order: 'desc',
      });

      expect(leadRepository.listByProject).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({
          stages: [LeadStage.NEW, LeadStage.NEGOTIATION],
          assignedUserId: actorId,
          source: LeadSource.WEBSITE,
          createdFrom,
          sortBy: 'estimatedValue',
          order: 'desc',
        }),
      );
    });

    it('returns the repository total so the page can be built', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.listByProject.mockResolvedValue({
        leads: [lead],
        total: 137,
      });

      const result = await module
        .get(ListLeadsUseCase)
        .execute({ actorUserId: actorId, projectId });

      expect(result.total).toBe(137);
    });
  });

  describe('get()', () => {
    it('resolves a lead scoped to the project', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.findByIdInProject.mockResolvedValue(lead);

      const result = await module
        .get(GetLeadUseCase)
        .execute({ actorUserId: actorId, projectId, leadId });

      expect(result.id).toBe(leadId);
      expect(leadRepository.findByIdInProject).toHaveBeenCalledWith(
        leadId,
        projectId,
      );
    });

    it('returns 404 for a lead that exists in another project (IDOR)', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.findByIdInProject.mockResolvedValue(null);

      await expect(
        module.get(GetLeadUseCase).execute({
          actorUserId: actorId,
          projectId,
          leadId: foreignLeadId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(leadRepository.findByIdInProject).toHaveBeenCalledWith(
        foreignLeadId,
        projectId,
      );
    });

    it('never reads a lead without the project scope', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.findByIdInProject.mockResolvedValue(lead);

      await module
        .get(GetLeadUseCase)
        .execute({ actorUserId: actorId, projectId, leadId });

      // Si alguien reintrodujera un findById(id) global, esta aserción lo detecta.
      expect(leadRepository).not.toHaveProperty('findById');
    });
  });

  describe('update()', () => {
    it('scopes the query by (leadId, projectId)', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.updateInProject.mockResolvedValue({
        ...lead,
        stage: LeadStage.QUALIFIED,
      });

      const result = await module.get(UpdateLeadUseCase).execute({
        actorUserId: actorId,
        projectId,
        leadId,
        stage: LeadStage.QUALIFIED,
      });

      expect(result.stage).toBe(LeadStage.QUALIFIED);
      expect(leadRepository.updateInProject).toHaveBeenCalledWith(
        leadId,
        projectId,
        {
          name: undefined,
          email: undefined,
          phone: undefined,
          stage: LeadStage.QUALIFIED,
          score: undefined,
        },
      );
      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.LEAD_UPDATE,
        projectId,
      );
    });

    it('propagates an explicit null to clear a contact field', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.updateInProject.mockResolvedValue({
        ...lead,
        email: null,
      });

      await module.get(UpdateLeadUseCase).execute({
        actorUserId: actorId,
        projectId,
        leadId,
        email: null,
      });

      expect(leadRepository.updateInProject).toHaveBeenCalledWith(
        leadId,
        projectId,
        expect.objectContaining({ email: null }),
      );
    });

    it('does not touch leads outside the project (404)', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.updateInProject.mockResolvedValue(null);

      await expect(
        module.get(UpdateLeadUseCase).execute({
          actorUserId: actorId,
          projectId,
          leadId: foreignLeadId,
          name: 'Hijacked',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(leadRepository.updateInProject).toHaveBeenCalledWith(
        foreignLeadId,
        projectId,
        expect.objectContaining({ name: 'Hijacked' }),
      );
    });

    it('rejects a responsible user from another project before writing', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      membershipRepository.findByUserAndProject.mockResolvedValue(null);

      await expect(
        module.get(UpdateLeadUseCase).execute({
          actorUserId: actorId,
          projectId,
          leadId,
          assignedUserId: foreignLeadId,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(leadRepository.updateInProject).not.toHaveBeenCalled();
    });

    it('maps an interest product of another project to 404', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.updateInProject.mockRejectedValueOnce({
        cause: {
          code: '23503',
          constraint_name: 'leads_interest_product_id_project_id_products_fk',
        },
      });

      await expect(
        module.get(UpdateLeadUseCase).execute({
          actorUserId: actorId,
          projectId,
          leadId,
          interestProductId: foreignLeadId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not write anything when the actor lacks LEAD_UPDATE', async () => {
      authorizationService.assertCan.mockRejectedValue(new Error('forbidden'));

      await expect(
        module.get(UpdateLeadUseCase).execute({
          actorUserId: actorId,
          projectId,
          leadId,
          name: 'X',
        }),
      ).rejects.toThrow('forbidden');

      expect(leadRepository.updateInProject).not.toHaveBeenCalled();
    });
  });

  describe('delete()', () => {
    it('scopes the delete by (leadId, projectId)', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.deleteInProject.mockResolvedValue('DELETED');

      await module
        .get(DeleteLeadUseCase)
        .execute({ actorUserId: actorId, projectId, leadId });

      expect(leadRepository.deleteInProject).toHaveBeenCalledWith(
        leadId,
        projectId,
      );
      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.LEAD_DELETE,
        projectId,
      );
    });

    it('does not delete leads outside the project (404)', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.deleteInProject.mockResolvedValue('NOT_FOUND');

      await expect(
        module.get(DeleteLeadUseCase).execute({
          actorUserId: actorId,
          projectId,
          leadId: foreignLeadId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(leadRepository.deleteInProject).toHaveBeenCalledWith(
        foreignLeadId,
        projectId,
      );
    });

    it('refuses with 409 when the lead has quotes beyond DRAFT or messages', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      leadRepository.deleteInProject.mockResolvedValue('HAS_HISTORY');

      await expect(
        module
          .get(DeleteLeadUseCase)
          .execute({ actorUserId: actorId, projectId, leadId }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not delete anything when the actor lacks LEAD_DELETE', async () => {
      authorizationService.assertCan.mockRejectedValue(new Error('forbidden'));

      await expect(
        module.get(DeleteLeadUseCase).execute({
          actorUserId: actorId,
          projectId,
          leadId,
        }),
      ).rejects.toThrow('forbidden');

      expect(leadRepository.deleteInProject).not.toHaveBeenCalled();
    });
  });
});
