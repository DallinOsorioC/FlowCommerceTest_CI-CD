import { Test, TestingModule } from '@nestjs/testing';
import { MessageDirection, Permission } from '@flowcommerce/types';
import {
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../../leads/domain/repositories/lead.repository';
import { MessageEntity } from '../../domain/entities/message.entity';
import {
  MESSAGES_REPOSITORY,
  type MessagesRepository,
} from '../../domain/ports/messages.repository';
import { GetUnreadCountUseCase } from './get-unread-count.use-case';
import { ListConversationsUseCase } from './list-conversations.use-case';
import { ListLeadMessagesUseCase } from './list-lead-messages.use-case';
import { MarkConversationReadUseCase } from './mark-conversation-read.use-case';

describe('Conversations use cases', () => {
  let module: TestingModule;
  const authorizationService = { assertCan: jest.fn() };
  const leadRepository: Partial<Record<keyof LeadRepository, jest.Mock>> = {
    findByIdInProject: jest.fn(),
  };
  const messagesRepository: Partial<
    Record<keyof MessagesRepository, jest.Mock>
  > = {
    listByLeadInProject: jest.fn(),
    findLastInboundAtInProject: jest.fn(),
    markInboundAsReadInProject: jest.fn(),
    listConversationsInProject: jest.fn(),
    countUnreadInProject: jest.fn(),
  };

  const actorId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const leadId = '77777777-7777-4777-8777-777777777777';

  const message = (id: string, minutesAgo = 0) =>
    new MessageEntity(
      id,
      projectId,
      leadId,
      `wamid.${id}`,
      MessageDirection.INBOUND,
      'Hola',
      'RECEIVED',
      new Date(Date.now() - minutesAgo * 60_000),
    );

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        ListConversationsUseCase,
        GetUnreadCountUseCase,
        ListLeadMessagesUseCase,
        MarkConversationReadUseCase,
        { provide: AuthorizationService, useValue: authorizationService },
        { provide: LEADS_REPOSITORY, useValue: leadRepository },
        { provide: MESSAGES_REPOSITORY, useValue: messagesRepository },
      ],
    }).compile();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authorizationService.assertCan.mockResolvedValue(undefined);
    leadRepository.findByIdInProject!.mockResolvedValue({ id: leadId });
  });

  describe('ListConversationsUseCase', () => {
    it('requires LEAD_READ and adds the 24 h window to each conversation', async () => {
      const lastInboundAt = new Date('2026-10-15T10:00:00.000Z');
      messagesRepository.listConversationsInProject!.mockResolvedValue({
        conversations: [
          {
            lead: { id: leadId, name: 'Ana' },
            lastMessage: message('m1'),
            unreadCount: 2,
            lastInboundAt,
          },
        ],
        total: 1,
      });

      const result = await module.get(ListConversationsUseCase).execute({
        actorUserId: actorId,
        projectId,
        search: '  Ana  ',
        unread: true,
        page: 1,
        limit: 20,
      });

      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.LEAD_READ,
        projectId,
      );
      expect(
        messagesRepository.listConversationsInProject,
      ).toHaveBeenCalledWith(projectId, {
        search: 'Ana',
        unread: true,
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(1);
      expect(result.conversations[0].unreadCount).toBe(2);
      expect(result.conversations[0].windowOpenUntil).toEqual(
        new Date('2026-10-16T10:00:00.000Z'),
      );
      expect(result.conversations[0]).not.toHaveProperty('lastInboundAt');
    });

    it('returns no window when the client never wrote', async () => {
      messagesRepository.listConversationsInProject!.mockResolvedValue({
        conversations: [
          {
            lead: { id: leadId, name: 'Ana' },
            lastMessage: message('m1'),
            unreadCount: 0,
            lastInboundAt: null,
          },
        ],
        total: 1,
      });

      const result = await module
        .get(ListConversationsUseCase)
        .execute({ actorUserId: actorId, projectId, page: 1, limit: 20 });

      expect(result.conversations[0].windowOpenUntil).toBeNull();
    });

    it('does not query when authorization fails', async () => {
      authorizationService.assertCan.mockRejectedValue(
        new ForbiddenException('Insufficient permissions for this project'),
      );

      await expect(
        module
          .get(ListConversationsUseCase)
          .execute({ actorUserId: actorId, projectId, page: 1, limit: 20 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        messagesRepository.listConversationsInProject,
      ).not.toHaveBeenCalled();
    });
  });

  describe('GetUnreadCountUseCase', () => {
    it('returns the project counters', async () => {
      messagesRepository.countUnreadInProject!.mockResolvedValue({
        conversations: 3,
        messages: 5,
      });

      await expect(
        module
          .get(GetUnreadCountUseCase)
          .execute({ actorUserId: actorId, projectId }),
      ).resolves.toEqual({ conversations: 3, messages: 5 });
      expect(messagesRepository.countUnreadInProject).toHaveBeenCalledWith(
        projectId,
      );
    });
  });

  describe('ListLeadMessagesUseCase', () => {
    const execute = (before?: string) =>
      module.get(ListLeadMessagesUseCase).execute({
        actorUserId: actorId,
        projectId,
        leadId,
        before,
        limit: 2,
      });

    it('returns the page with the cursor of its oldest message when there are more', async () => {
      messagesRepository.listByLeadInProject!.mockResolvedValue({
        messages: [message('older', 10), message('newer', 5)],
        hasMore: true,
      });
      messagesRepository.findLastInboundAtInProject!.mockResolvedValue(
        new Date('2026-10-15T10:00:00.000Z'),
      );

      const result = await execute('cursor-id');

      expect(messagesRepository.listByLeadInProject).toHaveBeenCalledWith(
        leadId,
        projectId,
        { before: 'cursor-id', limit: 2 },
      );
      expect(result.messages.map((item) => item.id)).toEqual([
        'older',
        'newer',
      ]);
      expect(result.nextCursor).toBe('older');
      expect(result.windowOpenUntil).toEqual(
        new Date('2026-10-16T10:00:00.000Z'),
      );
    });

    it('has no next cursor on the last page', async () => {
      messagesRepository.listByLeadInProject!.mockResolvedValue({
        messages: [message('only')],
        hasMore: false,
      });
      messagesRepository.findLastInboundAtInProject!.mockResolvedValue(null);

      const result = await execute();

      expect(result.nextCursor).toBeNull();
      expect(result.windowOpenUntil).toBeNull();
    });

    it('answers 404 for a lead of another tenant without reading messages', async () => {
      leadRepository.findByIdInProject!.mockResolvedValue(null);

      await expect(execute()).rejects.toBeInstanceOf(NotFoundException);
      expect(messagesRepository.listByLeadInProject).not.toHaveBeenCalled();
    });
  });

  describe('MarkConversationReadUseCase', () => {
    const execute = () =>
      module
        .get(MarkConversationReadUseCase)
        .execute({ actorUserId: actorId, projectId, leadId });

    it('needs the permission of whoever attends the chat and marks the inbound messages', async () => {
      messagesRepository.markInboundAsReadInProject!.mockResolvedValue(2);

      await execute();

      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.WHATSAPP_SEND_MESSAGE,
        projectId,
      );
      expect(
        messagesRepository.markInboundAsReadInProject,
      ).toHaveBeenCalledWith(leadId, projectId, expect.any(Date));
    });

    it('answers 404 for a lead of another tenant', async () => {
      leadRepository.findByIdInProject!.mockResolvedValue(null);

      await expect(execute()).rejects.toBeInstanceOf(NotFoundException);
      expect(
        messagesRepository.markInboundAsReadInProject,
      ).not.toHaveBeenCalled();
    });
  });
});
