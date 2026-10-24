import { Role } from '@flowcommerce/types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/domain.exceptions';
import { hashInvitationToken, type Invitation } from '../domain/invitation';
import {
  AcceptInvitationUseCase,
  InviteMemberUseCase,
} from './invitations.use-cases';

describe('Invitations use cases', () => {
  const repository = {
    replacePending: jest.fn(),
    listPendingByProject: jest.fn(),
    findByTokenHash: jest.fn(),
    revokeInProject: jest.fn(),
    accept: jest.fn(),
  };
  const userRepository = { findByEmail: jest.fn(), findById: jest.fn() };

  const invitation = (extra: Partial<Invitation> = {}): Invitation => ({
    id: 'inv-1',
    projectId: 'p1',
    email: 'nuevo@empresa.test',
    role: 'MEMBER',
    status: 'PENDING',
    invitedByUserId: 'owner',
    expiresAt: new Date(Date.now() + 86_400_000),
    acceptedAt: null,
    creadoEn: new Date(),
    ...extra,
  });

  beforeEach(() => jest.resetAllMocks());

  describe('InviteMemberUseCase', () => {
    const authorizationService = { decide: jest.fn() };
    const projectRepository = { findById: jest.fn() };
    const membershipRepository = { findByUserAndProject: jest.fn() };
    const emailSender = { send: jest.fn() };
    const config = { get: jest.fn() };
    const useCase = new InviteMemberUseCase(
      authorizationService as never,
      repository,
      projectRepository as never,
      membershipRepository as never,
      userRepository as never,
      emailSender,
      config as never,
    );
    const run = (role: 'ADMIN' | 'MEMBER' | 'VIEWER' = 'MEMBER') =>
      useCase.execute({
        actorUserId: 'actor',
        projectId: 'p1',
        email: ' Nuevo@Empresa.test ',
        role,
      });

    it('stores only the token hash and emails the link with the raw token', async () => {
      authorizationService.decide.mockResolvedValue({
        allowed: true,
        role: Role.OWNER,
      });
      projectRepository.findById.mockResolvedValue({ name: 'Nova' });
      userRepository.findById.mockResolvedValue({ name: 'Diego' });
      repository.replacePending.mockResolvedValue(invitation());
      config.get.mockReturnValue('https://app.flow.test/');

      await run();

      const [stored] = repository.replacePending.mock.calls[0] as [
        { email: string; tokenHash: string },
      ];
      expect(stored.email).toBe('nuevo@empresa.test');
      const [mail] = emailSender.send.mock.calls[0] as [
        { to: string; text: string },
      ];
      const token = /token=([^\s]+)/.exec(mail.text)?.[1] ?? '';
      expect(mail.to).toBe('nuevo@empresa.test');
      expect(mail.text).toContain(
        'https://app.flow.test/invitations/accept?token=',
      );
      expect(hashInvitationToken(decodeURIComponent(token))).toBe(
        stored.tokenHash,
      );
    });

    it('does not let an ADMIN invite another ADMIN (403)', async () => {
      authorizationService.decide.mockResolvedValue({
        allowed: true,
        role: Role.ADMIN,
      });

      await expect(run('ADMIN')).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.replacePending).not.toHaveBeenCalled();
    });

    it('answers 409 when the email already belongs to a member', async () => {
      authorizationService.decide.mockResolvedValue({
        allowed: true,
        role: Role.OWNER,
      });
      userRepository.findByEmail.mockResolvedValue({ id: 'u2' });
      membershipRepository.findByUserAndProject.mockResolvedValue({});

      await expect(run()).rejects.toBeInstanceOf(ConflictException);
    });

    it('revokes the invitation if the email cannot be sent', async () => {
      authorizationService.decide.mockResolvedValue({
        allowed: true,
        role: Role.OWNER,
      });
      projectRepository.findById.mockResolvedValue({ name: 'Nova' });
      repository.replacePending.mockResolvedValue(invitation());
      emailSender.send.mockRejectedValue(new Error('smtp down'));

      await expect(run()).rejects.toThrow('smtp down');
      expect(repository.revokeInProject).toHaveBeenCalledWith('inv-1', 'p1');
    });
  });

  describe('AcceptInvitationUseCase', () => {
    const useCase = new AcceptInvitationUseCase(
      repository,
      userRepository as never,
    );
    const accept = () =>
      useCase.execute({ actorUserId: 'u1', token: 'x'.repeat(43) });

    it('creates the membership when the session email matches', async () => {
      repository.findByTokenHash.mockResolvedValue(invitation());
      userRepository.findById.mockResolvedValue({
        email: 'NUEVO@empresa.test',
      });
      repository.accept.mockResolvedValue('accepted');

      await expect(accept()).resolves.toEqual({
        projectId: 'p1',
        role: 'MEMBER',
      });
    });

    it.each([
      ['unknown or revoked token', null, NotFoundException],
      ['already used', invitation({ status: 'ACCEPTED' }), ConflictException],
      [
        'expired',
        invitation({ expiresAt: new Date(Date.now() - 1000) }),
        BadRequestException,
      ],
    ])('rejects an invitation that is %s', async (_label, found, error) => {
      repository.findByTokenHash.mockResolvedValue(found);
      await expect(accept()).rejects.toBeInstanceOf(error);
      expect(repository.accept).not.toHaveBeenCalled();
    });

    it('rejects a session of another email (403)', async () => {
      repository.findByTokenHash.mockResolvedValue(invitation());
      userRepository.findById.mockResolvedValue({ email: 'otra@x.test' });

      await expect(accept()).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.accept).not.toHaveBeenCalled();
    });
  });
});
