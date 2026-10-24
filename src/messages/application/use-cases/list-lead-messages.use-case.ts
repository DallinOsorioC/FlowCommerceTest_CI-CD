import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { NotFoundException } from '../../../common/exceptions/domain.exceptions';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../../leads/domain/repositories/lead.repository';
import { windowOpenUntil } from '../../domain/conversation-window';
import type { MessageEntity } from '../../domain/entities/message.entity';
import {
  MESSAGES_REPOSITORY,
  type MessagesRepository,
} from '../../domain/ports/messages.repository';

export interface ListLeadMessagesInput {
  actorUserId: string;
  projectId: string;
  leadId: string;
  // Id del mensaje más antiguo que ya se muestra (scroll hacia arriba).
  before?: string;
  limit: number;
}

export interface LeadMessagesView {
  messages: MessageEntity[];
  // Valor para el próximo ?before= ; null cuando ya no hay más antiguos.
  nextCursor: string | null;
  windowOpenUntil: Date | null;
}

// Historial del chat con un lead. Leer no cambia nada: marcar como leído es
// una acción aparte (POST .../messages/read), así un GET nunca tiene efectos.
@Injectable()
export class ListLeadMessagesUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
    @Inject(MESSAGES_REPOSITORY)
    private readonly messagesRepository: MessagesRepository,
  ) {}

  async execute(input: ListLeadMessagesInput): Promise<LeadMessagesView> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.LEAD_READ,
      input.projectId,
    );

    // Un lead de otro tenant responde 404 igual que uno inexistente.
    const lead = await this.leadRepository.findByIdInProject(
      input.leadId,
      input.projectId,
    );
    if (!lead) {
      throw new NotFoundException('Lead not found in this project');
    }

    const [page, lastInboundAt] = await Promise.all([
      this.messagesRepository.listByLeadInProject(
        input.leadId,
        input.projectId,
        { before: input.before, limit: input.limit },
      ),
      this.messagesRepository.findLastInboundAtInProject(
        input.leadId,
        input.projectId,
      ),
    ]);

    return {
      messages: page.messages,
      nextCursor:
        page.hasMore && page.messages.length > 0 ? page.messages[0].id : null,
      windowOpenUntil: windowOpenUntil(lastInboundAt),
    };
  }
}
