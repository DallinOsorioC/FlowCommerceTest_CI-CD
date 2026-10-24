import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  QUOTES_REPOSITORY,
  type ListQuotesFilter,
  type PaginatedQuotes,
  type QuoteRepository,
} from '../../domain/repositories/quote.repository';

export interface ListQuotesInput extends ListQuotesFilter {
  actorUserId: string;
  projectId: string;
}

@Injectable()
export class ListQuotesUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(QUOTES_REPOSITORY)
    private readonly quoteRepository: QuoteRepository,
  ) {}

  // Lista las cotizaciones del tenant. El projectId es obligatorio y se aplica
  // dentro de la consulta; los filtros solo pueden reducir el resultado.
  async execute(input: ListQuotesInput): Promise<PaginatedQuotes> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.QUOTE_READ,
      input.projectId,
    );

    return this.quoteRepository.listByProject(input.projectId, {
      status: input.status,
      clientId: input.clientId,
      leadId: input.leadId,
      createdByUserId: input.createdByUserId,
      origin: input.origin,
      search: input.search,
      from: input.from,
      to: input.to,
      sortBy: input.sortBy,
      order: input.order,
      page: input.page,
      limit: input.limit,
    });
  }
}
