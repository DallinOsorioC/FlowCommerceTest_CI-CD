import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import { buildPaginationMeta } from '../../../common/dto/pagination.dto';
import { CreateProductUseCase } from '../../application/use-cases/create-product.use-case';
import { GetProductUseCase } from '../../application/use-cases/get-product.use-case';
import { ListProductsUseCase } from '../../application/use-cases/list-products.use-case';
import { UpdateProductUseCase } from '../../application/use-cases/update-product.use-case';
import { CreateProductDto } from '../dto/create-product.dto';
import { ListProductsQueryDto } from '../dto/list-products-query.dto';
import { PaginatedProductsDto } from '../dto/paginated-products.dto';
import { ProductDto } from '../dto/product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';

// Catálogo oficial de precios del tenant. Leerlo: todos los roles
// (PRODUCT_READ). Crear, editar o desactivar: OWNER y ADMIN (PRODUCT_MANAGE).
// No existe DELETE: un producto se desactiva para no romper cotizaciones.
@ApiTags('products')
@Controller({ path: 'projects/:projectId/products', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
@ApiUnauthorizedResponse({ description: 'Sin sesión activa' })
@ApiForbiddenResponse({
  description: 'Sin el permiso requerido en el proyecto (o proyecto ajeno)',
})
export class ProductsController {
  constructor(
    private readonly createProductUseCase: CreateProductUseCase,
    private readonly listProductsUseCase: ListProductsUseCase,
    private readonly getProductUseCase: GetProductUseCase,
    private readonly updateProductUseCase: UpdateProductUseCase,
  ) {}

  @Post()
  @RequirePermission(Permission.PRODUCT_MANAGE)
  @ApiOperation({ summary: 'Crear un producto o servicio en el catálogo' })
  @ApiCreatedResponse({ type: ProductDto })
  @ApiBadRequestResponse({ description: 'Body inválido' })
  @ApiConflictResponse({ description: 'Ya existe un producto con ese nombre' })
  createProduct(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateProductDto,
  ): Promise<ProductDto> {
    return this.createProductUseCase
      .execute({
        actorUserId: userId,
        projectId,
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category ?? null,
        unit: dto.unit ?? null,
        price: dto.price,
        maxDiscountPercent: dto.maxDiscountPercent ?? 0,
      })
      .then((product) => product.toProduct());
  }

  @Get()
  @RequirePermission(Permission.PRODUCT_READ)
  @ApiOperation({
    summary: 'Listar el catálogo',
    description:
      'Ordenado por nombre. Usa ?active=true para el selector de productos de una cotización.',
  })
  @ApiOkResponse({ type: PaginatedProductsDto })
  async listProducts(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListProductsQueryDto,
  ): Promise<PaginatedProductsDto> {
    const result = await this.listProductsUseCase.execute({
      actorUserId: userId,
      projectId,
      active: query.active,
      category: query.category,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });

    return {
      data: result.products.map((product) => product.toProduct()),
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  }

  @Get(':productId')
  @RequirePermission(Permission.PRODUCT_READ)
  @ApiOperation({ summary: 'Ver un producto' })
  @ApiOkResponse({ type: ProductDto })
  @ApiNotFoundResponse({ description: 'No existe en este proyecto' })
  getProduct(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<ProductDto> {
    return this.getProductUseCase
      .execute({ actorUserId: userId, projectId, productId })
      .then((product) => product.toProduct());
  }

  @Patch(':productId')
  @RequirePermission(Permission.PRODUCT_MANAGE)
  @ApiOperation({
    summary: 'Editar o desactivar un producto',
    description:
      'PATCH parcial. { "active": false } desactiva el producto. Cambiar el precio no altera cotizaciones existentes.',
  })
  @ApiOkResponse({ type: ProductDto })
  @ApiBadRequestResponse({ description: 'Body inválido' })
  @ApiNotFoundResponse({ description: 'No existe en este proyecto' })
  @ApiConflictResponse({ description: 'Ya existe un producto con ese nombre' })
  updateProduct(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductDto> {
    return this.updateProductUseCase
      .execute({
        actorUserId: userId,
        projectId,
        productId,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        unit: dto.unit,
        price: dto.price,
        maxDiscountPercent: dto.maxDiscountPercent,
        active: dto.active,
      })
      .then((product) => product.toProduct());
  }
}
