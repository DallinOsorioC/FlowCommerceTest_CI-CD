import type { ProductId } from '@flowcommerce/types';
import type { ProductEntity } from '../entities/product.entity';

export interface CreateProductInput {
  projectId: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string | null;
  price: number;
  maxDiscountPercent: number;
}

// Campos mutables. Todos opcionales; `active` es como se desactiva un producto
// (no existe borrado). El projectId no se puede cambiar.
export interface UpdateProductInput {
  name?: string;
  description?: string | null;
  category?: string | null;
  unit?: string | null;
  price?: number;
  maxDiscountPercent?: number;
  active?: boolean;
}

// Filtros siempre ADITIVOS al projectId.
export interface ListProductsFilter {
  active?: boolean;
  category?: string;
  // Coincidencia parcial sobre nombre y descripción.
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedProducts {
  products: ProductEntity[];
  total: number;
}

// Catálogo con ámbito de tenant: todo método lleva el projectId en su firma y
// en el WHERE. No hay `delete`: un producto citado por cotizaciones debe
// sobrevivir, así que solo se desactiva.
export interface ProductRepository {
  findByIdInProject(
    id: ProductId,
    projectId: string,
  ): Promise<ProductEntity | null>;
  // Varios productos del MISMO proyecto; los ids de otro tenant simplemente no
  // aparecen en el resultado. Lo usan las partidas de cotización.
  findManyByIdsInProject(
    ids: readonly ProductId[],
    projectId: string,
  ): Promise<ProductEntity[]>;
  listByProject(
    projectId: string,
    filter?: ListProductsFilter,
  ): Promise<PaginatedProducts>;
  create(input: CreateProductInput): Promise<ProductEntity>;
  // null si el producto no existe en ese proyecto.
  updateInProject(
    id: ProductId,
    projectId: string,
    input: UpdateProductInput,
  ): Promise<ProductEntity | null>;
}

export const PRODUCTS_REPOSITORY = Symbol('PRODUCTS_REPOSITORY');
