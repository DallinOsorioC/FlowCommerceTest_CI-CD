import { Inject, Injectable } from '@nestjs/common';
import { Permission, QuoteStatus } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  CLIENTS_REPOSITORY,
  type ClientRepository,
} from '../../../clients/domain/repositories/client.repository';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { isInThePast } from '../../domain/quote-validity';
import { QuoteEntity } from '../../domain/entities/quote.entity';
import {
  QUOTES_REPOSITORY,
  type QuoteRepository,
  type UpdateDraftQuoteInput,
} from '../../domain/repositories/quote.repository';
import { QuoteItemsBuilder, type QuoteItemInput } from '../quote-items.builder';
import { rethrowQuoteReferenceError } from '../quote-reference-errors';

export interface UpdateQuoteInput {
  actorUserId: string;
  projectId: string;
  quoteId: string;
  clientId?: string | null;
  validUntil?: Date | null;
  notes?: string | null;
  terms?: string | null;
  // Si viene, REEMPLAZA todas las partidas y se recalculan los importes.
  items?: QuoteItemInput[];
  // Ajuste comercial (descuento global antes de IVA). Si viene sin `items`, se
  // recalculan los importes con las partidas que ya tiene el borrador.
  adjustment?: number;
}

@Injectable()
export class UpdateQuoteUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(QUOTES_REPOSITORY)
    private readonly quoteRepository: QuoteRepository,
    @Inject(CLIENTS_REPOSITORY)
    private readonly clientRepository: ClientRepository,
    private readonly itemsBuilder: QuoteItemsBuilder,
  ) {}

  // Edita un borrador (QUOTE_CREATE). Una cotización que ya salió de DRAFT es
  // un snapshot que alguien está revisando o ya vio el cliente: 409. El estado
  // se comprueba otra vez en el WHERE del UPDATE, así que una transición
  // concurrente tampoco puede colarse.
  async execute(input: UpdateQuoteInput): Promise<QuoteEntity> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.QUOTE_CREATE,
      input.projectId,
    );

    const current = await this.quoteRepository.findByIdInProject(
      input.quoteId,
      input.projectId,
    );
    if (!current) {
      throw new NotFoundException('Quote not found in this project');
    }
    if (current.status !== QuoteStatus.DRAFT) {
      throw new ConflictException(
        `Only DRAFT quotes can be edited (current status: ${current.status})`,
      );
    }

    if (input.clientId) {
      const client = await this.clientRepository.findByIdInProject(
        input.clientId,
        input.projectId,
      );
      if (!client) {
        throw new NotFoundException('Client not found in this project');
      }
      if (!client.active) {
        throw new ConflictException(`Client "${client.name}" is inactive`);
      }
    }

    // null sigue siendo "sin vencimiento"; una fecha pasada no tiene sentido.
    if (isInThePast(input.validUntil, new Date())) {
      throw new BadRequestException('validUntil must be in the future');
    }

    const changes: UpdateDraftQuoteInput = {
      clientId: input.clientId,
      validUntil: input.validUntil,
      notes: input.notes,
      terms: input.terms,
    };
    const adjustment = input.adjustment ?? current.adjustment;
    if (input.items) {
      const built = await this.itemsBuilder.build(
        input.projectId,
        input.items,
        adjustment,
      );
      changes.items = built.items;
      changes.totals = built.totals;
    } else if (input.adjustment !== undefined) {
      changes.totals = await this.itemsBuilder.recalculate(
        input.projectId,
        current.items,
        adjustment,
      );
    }

    let updated: QuoteEntity | null;
    try {
      updated = await this.quoteRepository.updateDraftInProject(
        input.quoteId,
        input.projectId,
        changes,
      );
    } catch (error) {
      rethrowQuoteReferenceError(error);
    }

    if (updated) {
      return updated;
    }

    const latest = await this.quoteRepository.findByIdInProject(
      input.quoteId,
      input.projectId,
    );
    if (!latest) {
      throw new NotFoundException('Quote not found in this project');
    }
    throw new ConflictException(
      `Only DRAFT quotes can be edited (current status: ${latest.status})`,
    );
  }
}
