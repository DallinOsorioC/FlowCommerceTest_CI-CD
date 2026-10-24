import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import {
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { isUniqueViolation } from '../../../common/utils/postgres-error';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { ProductEntity } from '../../domain/entities/product.entity';
import {
  PRODUCTS_REPOSITORY,
  type ProductRepository,
  type UpdateProductInput as RepoUpdateProductInput,
} from '../../domain/repositories/product.repository';

export interface UpdateProductInput extends RepoUpdateProductInput {
  actorUserId: string;
  projectId: string;
  productId: string;
}

@Injectable()
export class UpdateProductUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(PRODUCTS_REPOSITORY)
    private readonly productRepository: ProductRepository,
  ) {}

  // Edita o desactiva (active: false) un producto. Cambiar el precio NO toca
  // cotizaciones existentes: sus partidas guardan una copia del precio.
  async execute(input: UpdateProductInput): Promise<ProductEntity> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PRODUCT_MANAGE,
      input.projectId,
    );

    try {
      const updated = await this.productRepository.updateInProject(
        input.productId,
        input.projectId,
        {
          name: input.name?.trim(),
          description: input.description,
          category: input.category,
          unit: input.unit,
          price: input.price,
          maxDiscountPercent: input.maxDiscountPercent,
          active: input.active,
        },
      );

      if (!updated) {
        throw new NotFoundException('Product not found in this project');
      }

      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Another product with that name already exists in this project',
        );
      }
      throw error;
    }
  }
}
