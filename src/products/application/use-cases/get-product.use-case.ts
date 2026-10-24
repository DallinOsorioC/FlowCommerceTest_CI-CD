import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { NotFoundException } from '../../../common/exceptions/domain.exceptions';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { ProductEntity } from '../../domain/entities/product.entity';
import {
  PRODUCTS_REPOSITORY,
  type ProductRepository,
} from '../../domain/repositories/product.repository';

export interface GetProductInput {
  actorUserId: string;
  projectId: string;
  productId: string;
}

@Injectable()
export class GetProductUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(PRODUCTS_REPOSITORY)
    private readonly productRepository: ProductRepository,
  ) {}

  // Un producto de otro tenant responde 404, igual que uno inexistente.
  async execute(input: GetProductInput): Promise<ProductEntity> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PRODUCT_READ,
      input.projectId,
    );

    const product = await this.productRepository.findByIdInProject(
      input.productId,
      input.projectId,
    );

    if (!product) {
      throw new NotFoundException('Product not found in this project');
    }

    return product;
  }
}
