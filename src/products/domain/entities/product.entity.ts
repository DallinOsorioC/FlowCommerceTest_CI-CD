import type { Product, ProductId } from '@flowcommerce/types';

// Producto o servicio del catálogo, siempre atado a su proyecto (tenant).
export class ProductEntity implements Product {
  constructor(
    public readonly id: ProductId,
    public readonly projectId: string,
    public readonly name: string,
    public readonly description: string | null,
    public readonly category: string | null,
    public readonly unit: string | null,
    public readonly price: number,
    public readonly maxDiscountPercent: number,
    public readonly active: boolean,
    public readonly creadoEn: Date,
    public readonly actualizadoEn: Date,
  ) {}

  toProduct(): Product {
    return {
      id: this.id,
      projectId: this.projectId,
      name: this.name,
      description: this.description,
      category: this.category,
      unit: this.unit,
      price: this.price,
      maxDiscountPercent: this.maxDiscountPercent,
      active: this.active,
      creadoEn: this.creadoEn,
      actualizadoEn: this.actualizadoEn,
    };
  }
}
