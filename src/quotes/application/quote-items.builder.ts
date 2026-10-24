import { Injectable, Inject } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../common/exceptions/domain.exceptions';
import {
  PRODUCTS_REPOSITORY,
  type ProductRepository,
} from '../../products/domain/repositories/product.repository';
import { QuoteSettingsReader } from './quote-settings.reader';
import {
  AdjustmentExceedsBaseError,
  calculateQuote,
  type CalculatorLineInput,
} from '../domain/quote-calculator';
import type {
  QuoteItemDraft,
  QuoteTotals,
} from '../domain/repositories/quote.repository';

export interface QuoteItemInput {
  productId: string;
  quantity: number;
  // Si se omite, 0. No puede superar products.max_discount_percent.
  discountPercent?: number;
  // Si se omite, se usa el nombre del producto.
  description?: string;
}

export interface BuiltQuoteItems {
  items: QuoteItemDraft[];
  totals: QuoteTotals;
}

// Convierte las partidas del body en partidas persistibles. El cliente solo
// envía producto, cantidad y descuento: el PRECIO sale del catálogo y todos los
// importes los calcula el servidor.
@Injectable()
export class QuoteItemsBuilder {
  constructor(
    @Inject(PRODUCTS_REPOSITORY)
    private readonly productRepository: ProductRepository,
    private readonly settingsReader: QuoteSettingsReader,
  ) {}

  // Partidas nuevas o reemplazadas: el precio sale del catálogo.
  async build(
    projectId: string,
    inputs: readonly QuoteItemInput[],
    adjustment = 0,
  ): Promise<BuiltQuoteItems> {
    // El IVA sale de los ajustes del proyecto.
    const { taxPercent } = await this.settingsReader.get(projectId);

    if (inputs.length === 0) {
      return {
        items: [],
        totals: this.totals([], taxPercent, adjustment),
      };
    }

    const ids = [...new Set(inputs.map((item) => item.productId))];
    // Los ids de otro tenant simplemente no aparecen en el resultado.
    const products = await this.productRepository.findManyByIdsInProject(
      ids,
      projectId,
    );
    const byId = new Map(products.map((product) => [product.id, product]));

    const priced = inputs.map((input) => {
      const product = byId.get(input.productId);
      if (!product) {
        throw new NotFoundException('Product not found in this project');
      }
      if (!product.active) {
        throw new ConflictException(
          `Product "${product.name}" is inactive and cannot be quoted`,
        );
      }

      const discountPercent = input.discountPercent ?? 0;
      if (discountPercent > product.maxDiscountPercent) {
        throw new BadRequestException(
          `Discount ${discountPercent}% exceeds the maximum of ${product.maxDiscountPercent}% allowed for "${product.name}"`,
        );
      }

      return {
        productId: product.id,
        description: input.description?.trim() || product.name,
        quantity: input.quantity,
        unitPrice: product.price,
        discountPercent,
      };
    });

    const calculated = this.calculate(priced, taxPercent, adjustment);

    return {
      items: priced.map((line, index) => ({
        ...line,
        lineTotal: calculated.lines[index].lineTotal,
        position: index + 1,
      })),
      totals: this.pickTotals(calculated),
    };
  }

  // Recalcula los importes de un borrador SIN tocar sus partidas (p. ej. cuando
  // solo cambia el ajuste comercial). Usa los precios ya copiados en cada
  // partida, no los del catálogo, y el IVA vigente del proyecto.
  async recalculate(
    projectId: string,
    existing: readonly CalculatorLineInput[],
    adjustment: number,
  ): Promise<QuoteTotals> {
    const { taxPercent } = await this.settingsReader.get(projectId);
    return this.totals(existing, taxPercent, adjustment);
  }

  private totals(
    lines: readonly CalculatorLineInput[],
    taxPercent: number,
    adjustment: number,
  ): QuoteTotals {
    return this.pickTotals(this.calculate(lines, taxPercent, adjustment));
  }

  private calculate(
    lines: readonly CalculatorLineInput[],
    taxPercent: number,
    adjustment: number,
  ): ReturnType<typeof calculateQuote> {
    try {
      return calculateQuote(lines, taxPercent, adjustment);
    } catch (error) {
      if (error instanceof AdjustmentExceedsBaseError) {
        throw new BadRequestException(
          `The commercial adjustment (${error.adjustment}) cannot exceed the amount after line discounts (${error.maxAdjustment})`,
        );
      }
      throw error;
    }
  }

  private pickTotals(
    calculated: ReturnType<typeof calculateQuote>,
  ): QuoteTotals {
    return {
      subtotal: calculated.subtotal,
      discount: calculated.discount,
      adjustment: calculated.adjustment,
      taxPercent: calculated.taxPercent,
      tax: calculated.tax,
      total: calculated.total,
    };
  }
}
