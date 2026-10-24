import { Test, TestingModule } from '@nestjs/testing';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import { LeadStage, Permission } from '@flowcommerce/types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { LEADS_REPOSITORY } from '../../../leads/domain/repositories/lead.repository';
import { MEMBERSHIP_REPOSITORY } from '../../../projects/domain/repositories/membership.repository';
import { CLIENTS_REPOSITORY } from '../../domain/repositories/client.repository';
import { ConvertLeadToClientUseCase } from './convert-lead-to-client.use-case';

describe('ConvertLeadToClientUseCase', () => {
  let module: TestingModule;
  const authorizationService = { assertCan: jest.fn() };
  const leadRepository = {
    findByIdInProject: jest.fn(),
    linkClientInProject: jest.fn(),
  };
  const clientRepository = {
    createFromLead: jest.fn(),
    findByIdInProject: jest.fn(),
    findPossibleDuplicatesInProject: jest.fn(),
    getStatsInProject: jest.fn(),
  };
  const membershipRepository = { findByUserAndProject: jest.fn() };

  const actorId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const leadId = '77777777-7777-4777-8777-777777777777';
  const clientId = '44444444-4444-4444-8444-444444444444';
  const lead = {
    id: leadId,
    projectId,
    name: 'Andrea López',
    email: 'andrea@nova.gt',
    phone: '+502 5541 2288',
    company: 'Constructora Nova',
    assignedUserId: actorId,
    clientId: null,
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        ConvertLeadToClientUseCase,
        { provide: AuthorizationService, useValue: authorizationService },
        { provide: LEADS_REPOSITORY, useValue: leadRepository },
        { provide: CLIENTS_REPOSITORY, useValue: clientRepository },
        { provide: MEMBERSHIP_REPOSITORY, useValue: membershipRepository },
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
    // 1.ª lectura: el lead sin cliente; 2.ª (tras la transacción): ya vinculado.
    leadRepository.findByIdInProject
      .mockResolvedValueOnce(lead)
      .mockResolvedValue({ ...lead, clientId });
    clientRepository.createFromLead.mockResolvedValue({
      id: clientId,
      projectId,
      email: lead.email,
      company: lead.company,
    });
    clientRepository.findPossibleDuplicatesInProject.mockResolvedValue([]);
  });

  const run = (extra: Record<string, unknown> = {}) =>
    module
      .get(ConvertLeadToClientUseCase)
      .execute({ actorUserId: actorId, projectId, leadId, ...extra });

  it('requires CLIENT_CREATE and LEAD_UPDATE', async () => {
    await run();

    expect(authorizationService.assertCan).toHaveBeenCalledWith(
      actorId,
      Permission.CLIENT_CREATE,
      projectId,
    );
    expect(authorizationService.assertCan).toHaveBeenCalledWith(
      actorId,
      Permission.LEAD_UPDATE,
      projectId,
    );
  });

  it('creates the client from the lead and links the lead', async () => {
    const result = await run({ taxId: '7745213-8' });

    expect(clientRepository.createFromLead).toHaveBeenCalledWith({
      projectId,
      leadId,
      leadStage: undefined,
      name: 'Andrea López',
      company: 'Constructora Nova',
      // El NIT se guarda normalizado (C2).
      taxId: '77452138',
      email: 'andrea@nova.gt',
      phone: '+502 5541 2288',
      notes: null,
      assignedUserId: actorId,
    });
    expect(result.lead.clientId).toBe(clientId);
  });

  it('moves the lead to WON when asked', async () => {
    await run({ markAsWon: true });

    expect(clientRepository.createFromLead).toHaveBeenCalledWith(
      expect.objectContaining({ leadId, leadStage: LeadStage.WON }),
    );
  });

  it('returns 404 for a lead of another project', async () => {
    leadRepository.findByIdInProject.mockReset();
    leadRepository.findByIdInProject.mockResolvedValue(null);

    await expect(run()).rejects.toBeInstanceOf(NotFoundException);
    expect(clientRepository.createFromLead).not.toHaveBeenCalled();
  });

  it('returns 409 when the lead is already linked to a client', async () => {
    leadRepository.findByIdInProject.mockReset();
    leadRepository.findByIdInProject.mockResolvedValue({ ...lead, clientId });

    await expect(run()).rejects.toBeInstanceOf(ConflictException);
    expect(clientRepository.createFromLead).not.toHaveBeenCalled();
  });

  it('reports possible duplicates (same email or company) without blocking', async () => {
    const duplicate = { id: 'dup-1', name: 'Nova S.A.' };
    clientRepository.findPossibleDuplicatesInProject.mockResolvedValue([
      duplicate,
    ]);

    const result = await run();

    expect(result.possibleDuplicates).toEqual([duplicate]);
    expect(
      clientRepository.findPossibleDuplicatesInProject,
    ).toHaveBeenCalledWith(projectId, {
      email: 'andrea@nova.gt',
      company: 'Constructora Nova',
      excludeId: clientId,
    });
  });

  describe('with an existing clientId', () => {
    const existing = { id: clientId, projectId, active: true };

    beforeEach(() => {
      clientRepository.findByIdInProject.mockResolvedValue(existing);
      leadRepository.linkClientInProject.mockResolvedValue({
        ...lead,
        clientId,
      });
    });

    it('links the lead to the existing client without creating another', async () => {
      const result = await run({ clientId, markAsWon: true });

      expect(clientRepository.createFromLead).not.toHaveBeenCalled();
      expect(leadRepository.linkClientInProject).toHaveBeenCalledWith(
        leadId,
        projectId,
        clientId,
        LeadStage.WON,
      );
      expect(result.client).toBe(existing);
      expect(result.possibleDuplicates).toEqual([]);
    });

    it('returns 404 for a client of another project', async () => {
      clientRepository.findByIdInProject.mockResolvedValue(null);

      await expect(run({ clientId })).rejects.toBeInstanceOf(NotFoundException);
      expect(clientRepository.findByIdInProject).toHaveBeenCalledWith(
        clientId,
        projectId,
      );
      expect(leadRepository.linkClientInProject).not.toHaveBeenCalled();
    });

    it('returns 409 for an inactive client', async () => {
      clientRepository.findByIdInProject.mockResolvedValue({
        ...existing,
        active: false,
      });

      await expect(run({ clientId })).rejects.toBeInstanceOf(ConflictException);
      expect(leadRepository.linkClientInProject).not.toHaveBeenCalled();
    });

    it('returns 400 when combined with fields that only apply to a new client', async () => {
      await expect(run({ clientId, taxId: '1' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(leadRepository.linkClientInProject).not.toHaveBeenCalled();
    });

    it('returns 409 when a concurrent link won', async () => {
      leadRepository.linkClientInProject.mockResolvedValue(null);

      await expect(run({ clientId })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('answers 409 when a concurrent conversion won (the transaction already rolled back)', async () => {
    clientRepository.createFromLead.mockResolvedValue(null);

    await expect(run()).rejects.toBeInstanceOf(ConflictException);
  });

  it('answers 409 for a repeated tax id', async () => {
    clientRepository.createFromLead.mockRejectedValue(
      Object.assign(new Error('Failed query'), {
        cause: Object.assign(new Error('dup'), { code: '23505' }),
      }),
    );

    await expect(run({ taxId: '1' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('does nothing without permission', async () => {
    authorizationService.assertCan.mockRejectedValueOnce(
      new ForbiddenException('Insufficient permissions for this project'),
    );

    await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
    expect(leadRepository.findByIdInProject).not.toHaveBeenCalled();
  });
});
