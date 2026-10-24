import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  PRODUCTS_REPOSITORY,
  type PaginatedProducts,
  type ProductRepository,
} from '../../domain/repositories/product.repository';

export interface ListProductsInput {
  actorUserId: string;
  projectId: string;
  active?: boolean;
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ListProductsUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(PRODUCTS_REPOSITORY)
    private readonly productRepository: ProductRepository,
  ) {}

  // Catálogo del tenant (PRODUCT_READ: todos los roles). Los filtros solo
  // reducen el resultado dentro del projectId.
  async execute(input: ListProductsInput): Promise<PaginatedProducts> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PRODUCT_READ,
      input.projectId,
    );

    return this.productRepository.listByProject(input.projectId, {
      active: input.active,
      category: input.category,
      search: input.search,
      page: input.page,
      limit: input.limit,
    });
  }
}
