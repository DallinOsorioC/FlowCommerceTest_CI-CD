import { Inject, Injectable } from '@nestjs/common';
import { Permission, type QuoteStatus } from '@flowcommerce/types';
import { QuoteLifecycleEvents } from '../quote-lifecycle.events';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import {
  PRODUCTS_REPOSITORY,
  type ProductRepository,
} from '../../../products/domain/repositories/product.repository';
import { QuoteEntity } from '../../domain/entities/quote.entity';
import { isExpired } from '../../domain/quote-validity';
import {
  ALLOWED_TRANSITIONS,
  permissionForTarget,
} from '../../domain/quote-transitions';
import {
  QUOTES_REPOSITORY,
  type QuoteRepository,
} from '../../domain/repositories/quote.repository';

export interface UpdateQuoteStatusInput {
  actorUserId: string;
  projectId: string;
  quoteId: string;
  status: QuoteStatus;
}

@Injectable()
export class UpdateQuoteStatusUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(QUOTES_REPOSITORY)
    private readonly quoteRepository: QuoteRepository,
    @Inject(PRODUCTS_REPOSITORY)
    private readonly productRepository: ProductRepository,
    private readonly lifecycle: QuoteLifecycleEvents,
  ) {}

  // Cambia el estado de una cotización.
  //
  // Toda transición es una escritura (QUOTE_CREATE, que VIEWER no tiene);
  // aprobar y pagar exigen además QUOTE_APPROVE. El permiso depende del estado
  // destino, no del endpoint.
  //
  // La escritura es ATÓMICA: UPDATE ... WHERE status = <estado leído>. Si otra
  // petición cambió el estado entre la lectura y la escritura, el UPDATE no
  // encuentra fila y se responde 409 en vez de pisar el cambio ajeno.
  async execute(input: UpdateQuoteStatusInput): Promise<QuoteEntity> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.QUOTE_CREATE,
      input.projectId,
    );
    const required = permissionForTarget(input.status);
    if (required !== Permission.QUOTE_CREATE) {
      await this.authorizationService.assertCan(
        input.actorUserId,
        required,
        input.projectId,
      );
    }

    const current = await this.quoteRepository.findByIdInProject(
      input.quoteId,
      input.projectId,
    );
    if (!current) {
      throw new NotFoundException('Quote not found in this project');
    }

    if (current.status === input.status) {
      throw new ConflictException(`Quote is already in status ${input.status}`);
    }

    if (!ALLOWED_TRANSITIONS[current.status].includes(input.status)) {
      throw new ConflictException(
        `Cannot change quote status from ${current.status} to ${input.status}`,
      );
    }

    // Una cotización vacía no puede pedir aprobación: no hay nada que aprobar.
    if (input.status === 'PENDING_APPROVAL' && current.items.length === 0) {
      throw new ConflictException(
        'A quote needs at least one item before requesting approval',
      );
    }

    if (input.status === 'PENDING_APPROVAL') {
      await this.assertItemsStillValid(current);
    }

    // B8: una cotización vencida no se puede aceptar; hay que hacer otra.
    const now = new Date();
    if (input.status === 'ACCEPTED' && isExpired(current.validUntil, now)) {
      throw new ConflictException(
        `Quote expired on ${current.validUntil!.toISOString().slice(0, 10)}; create a new version`,
      );
    }

    const updated = await this.quoteRepository.transitionStatusInProject(
      input.quoteId,
      input.projectId,
      { from: current.status, to: input.status, at: now },
    );
    if (updated) {
      await this.lifecycle.transitioned(
        updated,
        current.status,
        input.actorUserId,
      );
      return updated;
    }

    // Sin fila: o la borraron o alguien movió el estado entre medias.
    const latest = await this.quoteRepository.findByIdInProject(
      input.quoteId,
      input.projectId,
    );
    if (!latest) {
      throw new NotFoundException('Quote not found in this project');
    }
    throw new ConflictException(
      `Quote status changed concurrently to ${latest.status}; reload and retry`,
    );
  }

  // P1: el borrador guarda una copia de precio y descuento. Antes de pedir
  // aprobación se compara con el catálogo ACTUAL: si un producto se desactivó,
  // bajó su descuento máximo o cambió de precio, se responde 409 para que el
  // usuario vuelva a guardar las partidas (no se reprecia en silencio).
  private async assertItemsStillValid(quote: QuoteEntity): Promise<void> {
    const ids = [...new Set(quote.items.map((item) => item.productId))];
    const products = await this.productRepository.findManyByIdsInProject(
      ids,
      quote.projectId,
    );
    const byId = new Map(products.map((product) => [product.id, product]));

    for (const item of quote.items) {
      const product = byId.get(item.productId);
      if (!product || !product.active) {
        throw new ConflictException(
          `Product "${item.description}" is no longer active; edit the quote`,
        );
      }
      if (item.discountPercent > product.maxDiscountPercent) {
        throw new ConflictException(
          `Discount ${item.discountPercent}% on "${product.name}" exceeds the current maximum of ${product.maxDiscountPercent}%; edit the quote`,
        );
      }
      if (item.unitPrice !== product.price) {
        throw new ConflictException(
          `The price of "${product.name}" changed (${item.unitPrice} → ${product.price}); save the items again to update it`,
        );
      }
    }
  }
}
