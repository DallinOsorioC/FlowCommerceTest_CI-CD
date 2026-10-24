import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { ConflictException } from '../../../common/exceptions/domain.exceptions';
import { isUniqueViolation } from '../../../common/utils/postgres-error';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { ProductEntity } from '../../domain/entities/product.entity';
import {
  PRODUCTS_REPOSITORY,
  type ProductRepository,
} from '../../domain/repositories/product.repository';

export interface CreateProductInput {
  actorUserId: string;
  projectId: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string | null;
  price: number;
  maxDiscountPercent: number;
}

@Injectable()
export class CreateProductUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(PRODUCTS_REPOSITORY)
    private readonly productRepository: ProductRepository,
  ) {}

  // Alta en el catálogo tras verificar PRODUCT_MANAGE (OWNER/ADMIN). El nombre
  // es único por proyecto: un duplicado responde 409, no 500.
  async execute(input: CreateProductInput): Promise<ProductEntity> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PRODUCT_MANAGE,
      input.projectId,
    );

    try {
      return await this.productRepository.create({
        projectId: input.projectId,
        name: input.name.trim(),
        description: input.description,
        category: input.category,
        unit: input.unit,
        price: input.price,
        maxDiscountPercent: input.maxDiscountPercent,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `A product named "${input.name.trim()}" already exists in this project`,
        );
      }
      throw error;
    }
  }
}
