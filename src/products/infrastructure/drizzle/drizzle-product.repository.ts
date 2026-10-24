import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { products, type ProductRow } from '../../../db/schema';
import { ProductEntity } from '../../domain/entities/product.entity';
import type {
  CreateProductInput,
  ListProductsFilter,
  PaginatedProducts,
  ProductRepository,
  UpdateProductInput,
} from '../../domain/repositories/product.repository';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

@Injectable()
export class DrizzleProductRepository implements ProductRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async findByIdInProject(
    id: string,
    projectId: string,
  ): Promise<ProductEntity | null> {
    const row = await this.db.query.products.findFirst({
      where: and(eq(products.id, id), eq(products.projectId, projectId)),
    });

    return row ? this.mapToEntity(row) : null;
  }

  async findManyByIdsInProject(
    ids: readonly string[],
    projectId: string,
  ): Promise<ProductEntity[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.db.query.products.findMany({
      where: and(
        eq(products.projectId, projectId),
        inArray(products.id, [...ids]),
      ),
    });

    return rows.map((row) => this.mapToEntity(row));
  }

  async listByProject(
    projectId: string,
    filter: ListProductsFilter = {},
  ): Promise<PaginatedProducts> {
    const conditions: SQL[] = [eq(products.projectId, projectId)];

    if (filter.active !== undefined) {
      conditions.push(eq(products.active, filter.active));
    }

    if (filter.category) {
      conditions.push(eq(products.category, filter.category));
    }

    if (filter.search) {
      const pattern = `%${this.escapeLikePattern(filter.search)}%`;
      const searchCondition = or(
        ilike(products.name, pattern),
        ilike(products.description, pattern),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const where = and(...conditions);

    // El total usa el MISMO where (incluido project_id) que las filas.
    const [totalRow] = await this.db
      .select({ value: count() })
      .from(products)
      .where(where);

    const limit = Math.min(
      Math.max(filter.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const page = Math.max(filter.page ?? 1, 1);

    const rows = await this.db.query.products.findMany({
      where,
      orderBy: (product) => [asc(product.name)],
      limit,
      offset: (page - 1) * limit,
    });

    return {
      products: rows.map((row) => this.mapToEntity(row)),
      total: totalRow?.value ?? 0,
    };
  }

  async create(input: CreateProductInput): Promise<ProductEntity> {
    const [row] = await this.db
      .insert(products)
      .values({
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        category: input.category,
        unit: input.unit,
        price: input.price,
        maxDiscountPercent: input.maxDiscountPercent,
      })
      .returning();

    return this.mapToEntity(row);
  }

  // projectId en el WHERE del UPDATE: nunca alcanza otro tenant.
  async updateInProject(
    id: string,
    projectId: string,
    input: UpdateProductInput,
  ): Promise<ProductEntity | null> {
    const changes: Partial<typeof products.$inferInsert> = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.description !== undefined)
      changes.description = input.description;
    if (input.category !== undefined) changes.category = input.category;
    if (input.unit !== undefined) changes.unit = input.unit;
    if (input.price !== undefined) changes.price = input.price;
    if (input.maxDiscountPercent !== undefined)
      changes.maxDiscountPercent = input.maxDiscountPercent;
    if (input.active !== undefined) changes.active = input.active;

    if (Object.keys(changes).length === 0) {
      return this.findByIdInProject(id, projectId);
    }

    const [row] = await this.db
      .update(products)
      .set(changes)
      .where(and(eq(products.id, id), eq(products.projectId, projectId)))
      .returning();

    return row ? this.mapToEntity(row) : null;
  }

  // Escapa los comodines de LIKE para que la búsqueda sea literal.
  private escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
  }

  private mapToEntity(row: ProductRow): ProductEntity {
    return new ProductEntity(
      row.id,
      row.projectId,
      row.name,
      row.description,
      row.category,
      row.unit,
      row.price,
      row.maxDiscountPercent,
      row.active,
      row.createdAt,
      row.updatedAt,
    );
  }
}
