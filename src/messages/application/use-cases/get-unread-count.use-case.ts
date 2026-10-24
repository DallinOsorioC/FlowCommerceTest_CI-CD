import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  MESSAGES_REPOSITORY,
  type MessagesRepository,
  type UnreadCounts,
} from '../../domain/ports/messages.repository';

// Contador para el globo del menú lateral ("Conversaciones 3"). Una sola
// consulta COUNT sobre el proyecto: el frontend puede pedirlo cada cierto
// tiempo sin cargar la bandeja completa.
@Injectable()
export class GetUnreadCountUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(MESSAGES_REPOSITORY)
    private readonly messagesRepository: MessagesRepository,
  ) {}

  async execute(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<UnreadCounts> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.LEAD_READ,
      input.projectId,
    );
    return this.messagesRepository.countUnreadInProject(input.projectId);
  }
}
