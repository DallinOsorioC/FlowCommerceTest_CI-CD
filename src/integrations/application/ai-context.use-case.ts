import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../authorization/application/services/authorization.service';
import { NotFoundException } from '../../common/exceptions/domain.exceptions';
import type { LeadEntity } from '../../leads/domain/entities/lead.entity';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../leads/domain/repositories/lead.repository';
import type { MessageEntity } from '../../messages/domain/entities/message.entity';
import {
  MESSAGES_REPOSITORY,
  type MessagesRepository,
} from '../../messages/domain/ports/messages.repository';
import type { ProductEntity } from '../../products/domain/entities/product.entity';
import {
  PRODUCTS_REPOSITORY,
  type ProductRepository,
} from '../../products/domain/repositories/product.repository';
import type { QuoteEntity } from '../../quotes/domain/entities/quote.entity';
import {
  QUOTES_REPOSITORY,
  type QuoteRepository,
} from '../../quotes/domain/repositories/quote.repository';

const CONTEXT_MESSAGES = 30;
const CONTEXT_QUOTES = 20;

// Lo que el servicio de IA necesita para analizar un lead y sugerir el
// siguiente paso o una cotización: el lead, su conversación reciente y sus
// cotizaciones. Se lee con los permisos de quien creó la API key.
@Injectable()
export class GetLeadContextForAiUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
    @Inject(MESSAGES_REPOSITORY)
    private readonly messagesRepository: MessagesRepository,
    @Inject(QUOTES_REPOSITORY)
    private readonly quoteRepository: QuoteRepository,
  ) {}

  async execute(input: {
    actorUserId: string;
    projectId: string;
    leadId: string;
  }): Promise<{
    lead: LeadEntity;
    messages: MessageEntity[];
    quotes: QuoteEntity[];
  }> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.LEAD_READ,
      input.projectId,
    );
    const lead = await this.leadRepository.findByIdInProject(
      input.leadId,
      input.projectId,
    );
    if (!lead) {
      throw new NotFoundException('Lead not found in this project');
    }
    const [page, quotes] = await Promise.all([
      this.messagesRepository.listByLeadInProject(lead.id, input.projectId, {
        limit: CONTEXT_MESSAGES,
      }),
      this.quoteRepository.listByProject(input.projectId, {
        leadId: lead.id,
        sortBy: 'createdAt',
        order: 'desc',
        limit: CONTEXT_QUOTES,
      }),
    ]);
    return { lead, messages: page.messages, quotes: quotes.quotes };
  }
}

// Catálogo ACTIVO (productos que se pueden cotizar), para que la IA arme
// partidas con productId reales.
@Injectable()
export class ListCatalogForAiUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(PRODUCTS_REPOSITORY)
    private readonly productRepository: ProductRepository,
  ) {}

  async execute(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<ProductEntity[]> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PRODUCT_READ,
      input.projectId,
    );
    const page = await this.productRepository.listByProject(input.projectId, {
      active: true,
      limit: 100,
    });
    return page.products;
  }
}
