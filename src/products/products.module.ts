import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CreateProductUseCase } from './application/use-cases/create-product.use-case';
import { GetProductUseCase } from './application/use-cases/get-product.use-case';
import { ListProductsUseCase } from './application/use-cases/list-products.use-case';
import { UpdateProductUseCase } from './application/use-cases/update-product.use-case';
import { PRODUCTS_REPOSITORY } from './domain/repositories/product.repository';
import { DrizzleProductRepository } from './infrastructure/drizzle/drizzle-product.repository';
import { ProductsController } from './presentation/controllers/products.controller';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [ProductsController],
  providers: [
    {
      provide: PRODUCTS_REPOSITORY,
      useClass: DrizzleProductRepository,
    },
    CreateProductUseCase,
    ListProductsUseCase,
    GetProductUseCase,
    UpdateProductUseCase,
  ],
  // Cotizaciones lo usa para validar y copiar precios de las partidas.
  exports: [PRODUCTS_REPOSITORY],
})
export class ProductsModule {}
