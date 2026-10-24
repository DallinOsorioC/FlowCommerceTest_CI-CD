import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { NotFoundException } from '../../../common/exceptions/domain.exceptions';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../../leads/domain/repositories/lead.repository';
import {
  MESSAGES_REPOSITORY,
  type MessagesRepository,
} from '../../domain/ports/messages.repository';

// Marca como leídos los mensajes del cliente en esa conversación. Lo hace
// quien ATIENDE el chat (WHATSAPP_SEND_MESSAGE): un VIEWER puede mirar, pero
// no debe "apagar" los no leídos del equipo. Es idempotente: repetirlo no
// cambia nada.
@Injectable()
export class MarkConversationReadUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
    @Inject(MESSAGES_REPOSITORY)
    private readonly messagesRepository: MessagesRepository,
  ) {}

  async execute(input: {
    actorUserId: string;
    projectId: string;
    leadId: string;
  }): Promise<void> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.WHATSAPP_SEND_MESSAGE,
      input.projectId,
    );

    const lead = await this.leadRepository.findByIdInProject(
      input.leadId,
      input.projectId,
    );
    if (!lead) {
      throw new NotFoundException('Lead not found in this project');
    }

    await this.messagesRepository.markInboundAsReadInProject(
      input.leadId,
      input.projectId,
      new Date(),
    );
  }
}
