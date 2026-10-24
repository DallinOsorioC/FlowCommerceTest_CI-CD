import { Test, TestingModule } from '@nestjs/testing';
import { Permission } from '@flowcommerce/types';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  PRODUCTS_REPOSITORY,
  type ProductRepository,
} from '../../domain/repositories/product.repository';
import { CreateProductUseCase } from './create-product.use-case';
import { GetProductUseCase } from './get-product.use-case';
import { ListProductsUseCase } from './list-products.use-case';
import { UpdateProductUseCase } from './update-product.use-case';

describe('Products use-cases', () => {
  let module: TestingModule;
  const authorizationService = { assertCan: jest.fn() };
  const productRepository: Record<keyof ProductRepository, jest.Mock> = {
    findByIdInProject: jest.fn(),
    findManyByIdsInProject: jest.fn(),
    listByProject: jest.fn(),
    create: jest.fn(),
    updateInProject: jest.fn(),
  };

  const actorId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const productId = '55555555-5555-4555-8555-555555555555';
  const now = new Date('2026-01-01T00:00:00.000Z');
  const product = {
    id: productId,
    projectId,
    name: 'Licencia Pro',
    description: null,
    category: 'Licencias',
    unit: 'usuario',
    price: 1450,
    maxDiscountPercent: 10,
    active: true,
    creadoEn: now,
    actualizadoEn: now,
  };
  const uniqueViolation = Object.assign(new Error('duplicate'), {
    cause: { code: '23505' },
  });
  const denied = new ForbiddenException(
    'Insufficient permissions for this project',
  );

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        CreateProductUseCase,
        ListProductsUseCase,
        GetProductUseCase,
        UpdateProductUseCase,
        { provide: AuthorizationService, useValue: authorizationService },
        { provide: PRODUCTS_REPOSITORY, useValue: productRepository },
      ],
    }).compile();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authorizationService.assertCan.mockResolvedValue(undefined);
  });

  describe('create', () => {
    const input = {
      actorUserId: actorId,
      projectId,
      name: '  Licencia Pro  ',
      description: null,
      category: 'Licencias',
      unit: 'usuario',
      price: 1450,
      maxDiscountPercent: 10,
    };

    it('requires PRODUCT_MANAGE and creates inside the project', async () => {
      productRepository.create.mockResolvedValue(product);

      await module.get(CreateProductUseCase).execute(input);

      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.PRODUCT_MANAGE,
        projectId,
      );
      expect(productRepository.create).toHaveBeenCalledWith({
        projectId,
        name: 'Licencia Pro',
        description: null,
        category: 'Licencias',
        unit: 'usuario',
        price: 1450,
        maxDiscountPercent: 10,
      });
    });

    it('does not write when the permission is denied', async () => {
      authorizationService.assertCan.mockRejectedValueOnce(denied);

      await expect(
        module.get(CreateProductUseCase).execute(input),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(productRepository.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate name to 409', async () => {
      productRepository.create.mockRejectedValue(uniqueViolation);

      await expect(
        module.get(CreateProductUseCase).execute(input),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('list', () => {
    it('requires PRODUCT_READ and scopes the filters to the project', async () => {
      productRepository.listByProject.mockResolvedValue({
        products: [product],
        total: 1,
      });

      await module.get(ListProductsUseCase).execute({
        actorUserId: actorId,
        projectId,
        active: true,
        search: 'lic',
        page: 1,
        limit: 20,
      });

      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.PRODUCT_READ,
        projectId,
      );
      expect(productRepository.listByProject).toHaveBeenCalledWith(projectId, {
        active: true,
        category: undefined,
        search: 'lic',
        page: 1,
        limit: 20,
      });
    });
  });

  describe('get', () => {
    it('returns 404 for a product of another project', async () => {
      productRepository.findByIdInProject.mockResolvedValue(null);

      await expect(
        module
          .get(GetProductUseCase)
          .execute({ actorUserId: actorId, projectId, productId }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(productRepository.findByIdInProject).toHaveBeenCalledWith(
        productId,
        projectId,
      );
    });
  });

  describe('update', () => {
    it('requires PRODUCT_MANAGE and updates scoped by project', async () => {
      productRepository.updateInProject.mockResolvedValue({
        ...product,
        active: false,
      });

      const result = await module.get(UpdateProductUseCase).execute({
        actorUserId: actorId,
        projectId,
        productId,
        active: false,
      });

      expect(result.active).toBe(false);
      expect(authorizationService.assertCan).toHaveBeenCalledWith(
        actorId,
        Permission.PRODUCT_MANAGE,
        projectId,
      );
      expect(productRepository.updateInProject).toHaveBeenCalledWith(
        productId,
        projectId,
        {
          name: undefined,
          description: undefined,
          category: undefined,
          unit: undefined,
          price: undefined,
          maxDiscountPercent: undefined,
          active: false,
        },
      );
    });

    it('returns 404 when the product is not in the project', async () => {
      productRepository.updateInProject.mockResolvedValue(null);

      await expect(
        module.get(UpdateProductUseCase).execute({
          actorUserId: actorId,
          projectId,
          productId,
          price: 10,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps a duplicate name to 409', async () => {
      productRepository.updateInProject.mockRejectedValue(uniqueViolation);

      await expect(
        module.get(UpdateProductUseCase).execute({
          actorUserId: actorId,
          projectId,
          productId,
          name: 'Otro',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
