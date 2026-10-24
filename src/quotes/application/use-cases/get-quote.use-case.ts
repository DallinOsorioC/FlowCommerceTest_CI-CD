import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../common/exceptions/domain.exceptions';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { QuoteEntity } from '../../domain/entities/quote.entity';
import {
  QUOTES_REPOSITORY,
  type QuoteRepository,
} from '../../domain/repositories/quote.repository';

export interface GetQuoteInput {
  actorUserId: string;
  projectId: string;
  quoteId: string;
}

@Injectable()
export class GetQuoteUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(QUOTES_REPOSITORY)
    private readonly quoteRepository: QuoteRepository,
  ) {}

  // Obtiene una cotización; 404 si no pertenece al proyecto. Una cotización de
  // otro tenant es indistinguible de una inexistente: nunca 403, para no
  // confirmar que el id existe.
  async execute(input: GetQuoteInput): Promise<QuoteEntity> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.QUOTE_READ,
      input.projectId,
    );

    const quote = await this.quoteRepository.findByIdInProject(
      input.quoteId,
      input.projectId,
    );

    if (!quote) {
      throw new NotFoundException('Quote not found in this project');
    }

    return quote;
  }
}
