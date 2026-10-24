import { Test, TestingModule } from '@nestjs/testing';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import { FollowUpType, Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { LEADS_REPOSITORY } from '../../../leads/domain/repositories/lead.repository';
import { MEMBERSHIP_REPOSITORY } from '../../../projects/domain/repositories/membership.repository';
import type { FollowUp } from '../../domain/follow-up';
import { FOLLOW_UPS_REPOSITORY } from '../../domain/repositories/follow-up.repository';
import {
  CreateFollowUpUseCase,
  UpdateFollowUpUseCase,
} from './follow-ups.use-cases';

describe('Follow-ups use cases', () => {
  let module: TestingModule;
  const authorizationService = { assertCan: jest.fn() };
  const repository = {
    create: jest.fn(),
    findByIdInProject: jest.fn(),
    listByProject: jest.fn(),
    updatePendingInProject: jest.fn(),
    deleteInProject: jest.fn(),
  };
  const leadRepository = {
    findByIdInProject: jest.fn(),
    touchLastContactInProject: jest.fn(),
  };
  const membershipRepository = { findByUserAndProject: jest.fn() };

  const actorId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const leadId = '77777777-7777-4777-8777-777777777777';
  const followUpId = '99999999-9999-4999-8999-999999999999';
  const dueAt = new Date('2026-10-22T15:00:00.000Z');

  const followUp = (status: FollowUp['status']): FollowUp => ({
    id: followUpId,
    projectId,
    leadId,
    lead: { id: leadId, name: 'Ana' },
    type: 'CALL',
    title: 'Llamar',
    notes: null,
    dueAt,
    status,
    overdue: false,
    assignedUserId: actorId,
    assignedUser: null,
    createdByUserId: actorId,
    completedAt: null,
    outcome: null,
    creadoEn: dueAt,
    actualizadoEn: dueAt,
  });

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        CreateFollowUpUseCase,
        UpdateFollowUpUseCase,
        { provide: AuthorizationService, useValue: authorizationService },
        { provide: FOLLOW_UPS_REPOSITORY, useValue: repository },
        { provide: LEADS_REPOSITORY, useValue: leadRepository },
        { provide: MEMBERSHIP_REPOSITORY, useValue: membershipRepository },
        { provide: ActivityRecorder, useValue: { record: jest.fn() } },
      ],
    }).compile();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    authorizationService.assertCan.mockResolvedValue(undefined);
    membershipRepository.findByUserAndProject.mockResolvedValue({
      role: 'MEMBER',
    });
  });

  describe('create', () => {
    const create = (extra: object = {}) =>
      module.get(CreateFollowUpUseCase).execute({
        actorUserId: actorId,
        projectId,
        leadId,
        type: FollowUpType.CALL,
        title: 'Llamar',
        dueAt,
        ...extra,
      });

    it('needs LEAD_UPDATE and assigns it to the creator by default', async () => {
      leadRepository.findByIdInProject.mockResolvedValue({ id: leadId });
      repository.create.mockResolvedValue(followUp('PENDING'));

      await create();

      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.LEAD_UPDATE,
        projectId,
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          leadId,
          assignedUserId: actorId,
          createdByUserId: actorId,
        }),
      );
    });

    it('answers 404 for a lead of another project', async () => {
      leadRepository.findByIdInProject.mockResolvedValue(null);

      await expect(create()).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects a responsible user who is not a member (400)', async () => {
      leadRepository.findByIdInProject.mockResolvedValue({ id: leadId });
      membershipRepository.findByUserAndProject.mockResolvedValue(null);

      await expect(
        create({ assignedUserId: '44444444-4444-4444-8444-444444444444' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    const update = (extra: object) =>
      module.get(UpdateFollowUpUseCase).execute({
        actorUserId: actorId,
        projectId,
        followUpId,
        ...extra,
      });

    it('completes it, stamps completedAt and touches the lead last contact', async () => {
      repository.findByIdInProject.mockResolvedValue(followUp('PENDING'));
      repository.updatePendingInProject.mockResolvedValue(followUp('DONE'));

      await update({ status: 'DONE', outcome: 'Pide demo' });

      expect(repository.updatePendingInProject).toHaveBeenCalledWith(
        followUpId,
        projectId,
        expect.objectContaining({
          status: 'DONE',
          outcome: 'Pide demo',
          completedAt: expect.any(Date) as Date,
        }),
      );
      expect(leadRepository.touchLastContactInProject).toHaveBeenCalledWith(
        leadId,
        projectId,
        expect.any(Date),
      );
    });

    it('refuses to change a follow-up that is already DONE (409)', async () => {
      repository.findByIdInProject.mockResolvedValue(followUp('DONE'));

      await expect(update({ title: 'Otro' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.updatePendingInProject).not.toHaveBeenCalled();
    });

    it('answers 409 when someone else closed it in between', async () => {
      repository.findByIdInProject.mockResolvedValue(followUp('PENDING'));
      repository.updatePendingInProject.mockResolvedValue(null);

      await expect(update({ status: 'CANCELLED' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(leadRepository.touchLastContactInProject).not.toHaveBeenCalled();
    });
  });
});
