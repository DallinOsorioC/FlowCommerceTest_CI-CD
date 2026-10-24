import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import {
  QUOTES_REPOSITORY,
  type QuoteRepository,
} from '../../domain/repositories/quote.repository';

export interface DeleteQuoteInput {
  actorUserId: string;
  projectId: string;
  quoteId: string;
}

@Injectable()
export class DeleteQuoteUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(QUOTES_REPOSITORY)
    private readonly quoteRepository: QuoteRepository,
  ) {}

  // Solo se borran borradores (QUOTE_CREATE): el resto del ciclo es historial
  // comercial. El DELETE comprueba el estado en el WHERE, así que no puede
  // borrar una cotización que acaba de salir de DRAFT.
  async execute(input: DeleteQuoteInput): Promise<void> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.QUOTE_CREATE,
      input.projectId,
    );

    const deleted = await this.quoteRepository.deleteDraftInProject(
      input.quoteId,
      input.projectId,
    );
    if (deleted) {
      return;
    }

    const current = await this.quoteRepository.findByIdInProject(
      input.quoteId,
      input.projectId,
    );
    if (!current) {
      throw new NotFoundException('Quote not found in this project');
    }
    throw new ConflictException(
      `Only DRAFT quotes can be deleted (current status: ${current.status})`,
    );
  }
}
