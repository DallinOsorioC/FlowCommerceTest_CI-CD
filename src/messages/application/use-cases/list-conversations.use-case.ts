import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { windowOpenUntil } from '../../domain/conversation-window';
import {
  MESSAGES_REPOSITORY,
  type ConversationSummary,
  type MessagesRepository,
} from '../../domain/ports/messages.repository';

export interface ListConversationsInput {
  actorUserId: string;
  projectId: string;
  search?: string;
  unread?: boolean;
  page: number;
  limit: number;
}

export interface ConversationView extends Omit<
  ConversationSummary,
  'lastInboundAt'
> {
  // Hasta cuándo se puede escribir texto libre (null = el cliente nunca
  // escribió). Ver domain/conversation-window.ts.
  windowOpenUntil: Date | null;
}

// Bandeja de conversaciones (pantalla "Conversaciones"): un elemento por lead
// que tiene mensajes, con el último mensaje y los no leídos. Solo lectura:
// basta LEAD_READ, de modo que un VIEWER también ve las conversaciones.
@Injectable()
export class ListConversationsUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(MESSAGES_REPOSITORY)
    private readonly messagesRepository: MessagesRepository,
  ) {}

  async execute(
    input: ListConversationsInput,
  ): Promise<{ conversations: ConversationView[]; total: number }> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.LEAD_READ,
      input.projectId,
    );

    const { conversations, total } =
      await this.messagesRepository.listConversationsInProject(
        input.projectId,
        {
          search: input.search?.trim() || undefined,
          unread: input.unread,
          page: input.page,
          limit: input.limit,
        },
      );

    return {
      conversations: conversations.map(({ lastInboundAt, ...rest }) => ({
        ...rest,
        windowOpenUntil: windowOpenUntil(lastInboundAt),
      })),
      total,
    };
  }
}
