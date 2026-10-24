import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccessRequestStatus, Permission, Role } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { IDENTITY_ADMIN } from '../../../auth/application/ports/identity-admin';
import { MEMBERSHIP_REPOSITORY } from '../../../projects/domain/repositories/membership.repository';
import { PROJECT_REPOSITORY } from '../../../projects/domain/repositories/project.repository';
import { USER_REPOSITORY } from '../../../users/domain/repositories/user.repository';
import { AccessRequestEntity } from '../../domain/entities/access-request.entity';
import {
  ACCESS_REQUEST_REPOSITORY,
  type AccessRequestRepository,
} from '../../domain/repositories/access-request.repository';
import { ApproveAccessRequestUseCase } from './approve-access-request.use-case';
import { NotificationPublisher } from '../../../notifications/application/notification-publisher';
import { CreateAccessRequestUseCase } from './create-access-request.use-case';
import { ListAccessRequestsUseCase } from './list-access-requests.use-case';
import { RejectAccessRequestUseCase } from './reject-access-request.use-case';

describe('Access request use-cases', () => {
  const authorizationService = {
    assertCan: jest.fn(),
  };
  const accessRequestRepository: Record<
    keyof AccessRequestRepository,
    jest.Mock
  > = {
    findByIdAndProject: jest.fn(),
    findPendingByProjectAndEmail: jest.fn(),
    listByProject: jest.fn(),
    create: jest.fn(),
    approvePending: jest.fn(),
    revertApproved: jest.fn(),
    rejectPending: jest.fn(),
  };
  const userRepository = {
    findByEmail: jest.fn(),
    existsByEmail: jest.fn(),
    create: jest.fn(),
  };
  const projectRepository = { findById: jest.fn() };
  const membershipRepository = {
    findByUserAndProject: jest.fn(),
    create: jest.fn(),
  };
  const identityAdmin = { inviteByEmail: jest.fn() };

  const actorId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const requestId = '77777777-7777-4777-8777-777777777777';
  const now = new Date('2026-01-01T00:00:00.000Z');

  const entityFor = (status: AccessRequestStatus) =>
    new AccessRequestEntity(
      requestId,
      projectId,
      'adalovelace@gmail.com',
      status,
      status === AccessRequestStatus.PENDING ? null : now,
      status === AccessRequestStatus.PENDING ? null : actorId,
      now,
      now,
    );

  const pending = entityFor(AccessRequestStatus.PENDING);

  let module: TestingModule;

  beforeAll(async () => {
    Logger.overrideLogger(true);
    module = await Test.createTestingModule({
      providers: [
        CreateAccessRequestUseCase,
        ListAccessRequestsUseCase,
        ApproveAccessRequestUseCase,
        RejectAccessRequestUseCase,
        { provide: AuthorizationService, useValue: authorizationService },
        {
          provide: ACCESS_REQUEST_REPOSITORY,
          useValue: accessRequestRepository,
        },
        { provide: USER_REPOSITORY, useValue: userRepository },
        { provide: PROJECT_REPOSITORY, useValue: projectRepository },
        { provide: MEMBERSHIP_REPOSITORY, useValue: membershipRepository },
        { provide: IDENTITY_ADMIN, useValue: identityAdmin },
        { provide: NotificationPublisher, useValue: { notify: jest.fn() } },
      ],
    }).compile();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create()', () => {
    const createUseCase = () => module.get(CreateAccessRequestUseCase);

    it('normalizes the email before persisting', async () => {
      projectRepository.findById.mockResolvedValue({ id: projectId });
      userRepository.existsByEmail.mockResolvedValue(false);
      accessRequestRepository.findPendingByProjectAndEmail.mockResolvedValue(
        null,
      );
      accessRequestRepository.create.mockResolvedValue(pending);

      await createUseCase().execute({
        projectId,
        email: '  Ada.Lovelace@Gmail.COM ',
      });

      expect(userRepository.existsByEmail).toHaveBeenCalledWith(
        'adalovelace@gmail.com',
      );
      expect(accessRequestRepository.create).toHaveBeenCalledWith({
        projectId,
        email: 'adalovelace@gmail.com',
      });
    });

    it('rejects a project that does not exist (404)', async () => {
      projectRepository.findById.mockResolvedValue(null);

      await expect(
        createUseCase().execute({ projectId, email: 'ada@gmail.com' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('answers like a normal request for existing users, without creating anything (anti-enumeration)', async () => {
      projectRepository.findById.mockResolvedValue({ id: projectId });
      userRepository.existsByEmail.mockResolvedValue(true);

      await expect(
        createUseCase().execute({ projectId, email: 'ada@gmail.com' }),
      ).resolves.toBeUndefined();
      expect(accessRequestRepository.create).not.toHaveBeenCalled();
    });

    it('answers like a normal request for a duplicate PENDING request', async () => {
      projectRepository.findById.mockResolvedValue({ id: projectId });
      userRepository.existsByEmail.mockResolvedValue(false);
      accessRequestRepository.findPendingByProjectAndEmail.mockResolvedValue(
        pending,
      );

      await expect(
        createUseCase().execute({ projectId, email: 'ada@gmail.com' }),
      ).resolves.toBeUndefined();
      expect(accessRequestRepository.create).not.toHaveBeenCalled();
    });

    it('treats a unique violation from a simultaneous request as a duplicate', async () => {
      projectRepository.findById.mockResolvedValue({ id: projectId });
      userRepository.existsByEmail.mockResolvedValue(false);
      accessRequestRepository.findPendingByProjectAndEmail.mockResolvedValue(
        null,
      );
      accessRequestRepository.create.mockRejectedValue(
        Object.assign(new Error('Failed query'), {
          cause: Object.assign(new Error('dup'), { code: '23505' }),
        }),
      );

      await expect(
        createUseCase().execute({ projectId, email: 'ada@gmail.com' }),
      ).resolves.toBeUndefined();
    });

    it('rethrows unrelated database errors', async () => {
      projectRepository.findById.mockResolvedValue({ id: projectId });
      userRepository.existsByEmail.mockResolvedValue(false);
      accessRequestRepository.findPendingByProjectAndEmail.mockResolvedValue(
        null,
      );
      accessRequestRepository.create.mockRejectedValue(new Error('db down'));

      await expect(
        createUseCase().execute({ projectId, email: 'ada@gmail.com' }),
      ).rejects.toThrow('db down');
    });
  });

  describe('list()', () => {
    it('verifies MEMBER_INVITE and lists only the project', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      accessRequestRepository.listByProject.mockResolvedValue([pending]);

      const result = await module
        .get(ListAccessRequestsUseCase)
        .execute({ actorUserId: actorId, projectId });

      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.MEMBER_INVITE,
        projectId,
      );
      expect(accessRequestRepository.listByProject).toHaveBeenCalledWith(
        projectId,
      );
      expect(result[0]?.projectId).toBe(projectId);
    });
  });

  describe('approve()', () => {
    const approveUseCase = () => module.get(ApproveAccessRequestUseCase);

    it('invites the account in Supabase, creates the user with ITS id (MEMBER) and marks APPROVED', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      accessRequestRepository.findByIdAndProject.mockResolvedValue(pending);
      userRepository.findByEmail.mockResolvedValue(null);
      userRepository.create.mockResolvedValue({
        id: '99999999-9999-4999-8999-999999999999',
        name: 'adalovelace',
        email: 'adalovelace@gmail.com',
      });
      membershipRepository.findByUserAndProject.mockResolvedValue(null);
      membershipRepository.create.mockResolvedValue({});
      identityAdmin.inviteByEmail.mockResolvedValue({
        id: '99999999-9999-4999-8999-999999999999',
        alreadyExisted: false,
      });
      const approved = entityFor(AccessRequestStatus.APPROVED);
      accessRequestRepository.approvePending.mockResolvedValue(approved);

      const result = await approveUseCase().execute({
        actorUserId: actorId,
        projectId,
        requestId,
      });

      expect(identityAdmin.inviteByEmail).toHaveBeenCalledWith({
        email: 'adalovelace@gmail.com',
        name: 'adalovelace',
      });
      // users.id == id de la cuenta en Supabase Auth.
      expect(userRepository.create).toHaveBeenCalledWith({
        id: '99999999-9999-4999-8999-999999999999',
        name: 'adalovelace',
        email: 'adalovelace@gmail.com',
      });
      expect(membershipRepository.create).toHaveBeenCalledWith({
        userId: '99999999-9999-4999-8999-999999999999',
        projectId,
        role: Role.MEMBER,
      });
      expect(accessRequestRepository.approvePending).toHaveBeenCalledWith(
        requestId,
        projectId,
        actorId,
      );
      expect(result.status).toBe(AccessRequestStatus.APPROVED);
    });

    it('skips user/membership creation when they already exist', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      accessRequestRepository.findByIdAndProject.mockResolvedValue(pending);
      userRepository.findByEmail.mockResolvedValue({
        id: '99999999-9999-4999-8999-999999999999',
        name: 'adalovelace',
        email: 'adalovelace@gmail.com',
      });
      membershipRepository.findByUserAndProject.mockResolvedValue({
        id: 'm-1',
      });
      accessRequestRepository.approvePending.mockResolvedValue(
        entityFor(AccessRequestStatus.APPROVED),
      );

      await approveUseCase().execute({
        actorUserId: actorId,
        projectId,
        requestId,
      });

      expect(userRepository.create).not.toHaveBeenCalled();
      expect(membershipRepository.create).not.toHaveBeenCalled();
      // Ya tenía cuenta: no se invita de nuevo.
      expect(identityAdmin.inviteByEmail).not.toHaveBeenCalled();
    });

    it('reopens the request (back to PENDING) when Supabase cannot create the account', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      accessRequestRepository.findByIdAndProject.mockResolvedValue(pending);
      userRepository.findByEmail.mockResolvedValue(null);
      identityAdmin.inviteByEmail.mockRejectedValue(new Error('auth down'));
      accessRequestRepository.approvePending.mockResolvedValue(
        entityFor(AccessRequestStatus.APPROVED),
      );
      accessRequestRepository.revertApproved.mockResolvedValue(undefined);

      await expect(
        approveUseCase().execute({
          actorUserId: actorId,
          projectId,
          requestId,
        }),
      ).rejects.toThrow('auth down');

      expect(accessRequestRepository.revertApproved).toHaveBeenCalledWith(
        requestId,
        projectId,
        actorId,
      );
      expect(userRepository.create).not.toHaveBeenCalled();
      expect(membershipRepository.create).not.toHaveBeenCalled();
    });

    it('returns 404 for a request of another project', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      accessRequestRepository.findByIdAndProject.mockResolvedValue(null);

      await expect(
        approveUseCase().execute({
          actorUserId: actorId,
          projectId,
          requestId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an already-handled request with 409', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      accessRequestRepository.findByIdAndProject.mockResolvedValue(
        entityFor(AccessRequestStatus.APPROVED),
      );

      await expect(
        approveUseCase().execute({
          actorUserId: actorId,
          projectId,
          requestId,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it('surfaces conflicts when the PENDING claim is lost to a race', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      accessRequestRepository.findByIdAndProject.mockResolvedValue(pending);
      accessRequestRepository.approvePending.mockResolvedValue(null);

      await expect(
        approveUseCase().execute({
          actorUserId: actorId,
          projectId,
          requestId,
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      // El flip condicional se pierde ANTES de crear nada: quien perdió la
      // carrera no alcanzó a dar de alta usuario ni membresía, así que nadie
      // con la solicitud no aprobada termina con acceso al proyecto.
      expect(userRepository.findByEmail).not.toHaveBeenCalled();
      expect(membershipRepository.create).not.toHaveBeenCalled();
    });

    it('survives a concurrent user creation race via unique violation', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      accessRequestRepository.findByIdAndProject.mockResolvedValue(pending);
      accessRequestRepository.approvePending.mockResolvedValue(
        entityFor(AccessRequestStatus.APPROVED),
      );
      // La primera lectura no ve al usuario; la creación choca con el unique de
      // users.email porque otra aprobación concurrente lo creó primero; tras
      // releer se encuentra al ganador y se continúa con normalidad.
      const winner = {
        id: '99999999-9999-4999-8999-999999999999',
        name: 'adalovelace',
        email: 'adalovelace@gmail.com',
      };
      userRepository.findByEmail
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(winner);
      userRepository.create.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );
      membershipRepository.findByUserAndProject.mockResolvedValue(null);
      membershipRepository.create.mockResolvedValue({});
      identityAdmin.inviteByEmail.mockResolvedValue({
        id: '99999999-9999-4999-8999-999999999999',
        alreadyExisted: false,
      });

      const result = await approveUseCase().execute({
        actorUserId: actorId,
        projectId,
        requestId,
      });

      expect(result.status).toBe(AccessRequestStatus.APPROVED);
      expect(membershipRepository.create).toHaveBeenCalledWith({
        userId: winner.id,
        projectId,
        role: Role.MEMBER,
      });
    });

    it('survives a concurrent membership creation race via unique violation', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      accessRequestRepository.findByIdAndProject.mockResolvedValue(pending);
      accessRequestRepository.approvePending.mockResolvedValue(
        entityFor(AccessRequestStatus.APPROVED),
      );
      userRepository.findByEmail.mockResolvedValue({
        id: '99999999-9999-4999-8999-999999999999',
        name: 'adalovelace',
        email: 'adalovelace@gmail.com',
      });
      membershipRepository.findByUserAndProject.mockResolvedValue(null);
      membershipRepository.create.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );
      identityAdmin.inviteByEmail.mockResolvedValue({
        id: '99999999-9999-4999-8999-999999999999',
        alreadyExisted: false,
      });

      const result = await approveUseCase().execute({
        actorUserId: actorId,
        projectId,
        requestId,
      });

      expect(result.status).toBe(AccessRequestStatus.APPROVED);
    });

    it('propagates authorization denials', async () => {
      authorizationService.assertCan.mockRejectedValue(
        new ForbiddenException('Insufficient permissions for this project'),
      );

      await expect(
        approveUseCase().execute({
          actorUserId: actorId,
          projectId,
          requestId,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(accessRequestRepository.findByIdAndProject).not.toHaveBeenCalled();
    });
  });

  describe('reject()', () => {
    const rejectUseCase = () => module.get(RejectAccessRequestUseCase);

    it('marks a PENDING request as REJECTED', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      accessRequestRepository.findByIdAndProject.mockResolvedValue(pending);
      accessRequestRepository.rejectPending.mockResolvedValue(
        entityFor(AccessRequestStatus.REJECTED),
      );

      const result = await rejectUseCase().execute({
        actorUserId: actorId,
        projectId,
        requestId,
      });

      expect(accessRequestRepository.rejectPending).toHaveBeenCalledWith(
        requestId,
        projectId,
        actorId,
      );
      expect(result.status).toBe(AccessRequestStatus.REJECTED);
    });

    it('returns 404 for a request of another project', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      accessRequestRepository.findByIdAndProject.mockResolvedValue(null);

      await expect(
        rejectUseCase().execute({ actorUserId: actorId, projectId, requestId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an already-handled request with 409', async () => {
      authorizationService.assertCan.mockResolvedValue(undefined);
      accessRequestRepository.findByIdAndProject.mockResolvedValue(
        entityFor(AccessRequestStatus.REJECTED),
      );

      await expect(
        rejectUseCase().execute({ actorUserId: actorId, projectId, requestId }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
