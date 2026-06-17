import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ApiResponse } from '../common/dto/api-response.dto';

describe('ProductsController', () => {
  let controller: ProductsController;
  let service: jest.Mocked<ProductsService>;

  beforeEach(async () => {
    const mockService = {
      findAll: jest.fn(),
      findById: jest.fn(),
      replenishStock: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: mockService }],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
    service = module.get(ProductsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return wrapped list of products', async () => {
      const productsList = [{ id: '1', sku: 'A', stock: null }];
      service.findAll.mockResolvedValue(productsList as any);

      const result = await controller.findAll();
      expect(result).toBeInstanceOf(ApiResponse);
      expect(result.success).toBe(true);
      expect(result.RecordCount).toBe(1);
      expect(result.data).toEqual(productsList);
    });
  });

  describe('findById', () => {
    it('should return wrapped product', async () => {
      const product = { id: '1', sku: 'A', stock: null };
      service.findById.mockResolvedValue(product as any);

      const result = await controller.findById('123e4567-e89b-12d3-a456-426614174000');
      expect(result).toBeInstanceOf(ApiResponse);
      expect(result.data).toEqual(product);
    });
  });

  describe('replenishStock', () => {
    it('should return wrapped updated stock', async () => {
      const stock = { productId: '1', quantity: 10 };
      service.replenishStock.mockResolvedValue(stock as any);

      const result = await controller.replenishStock({
        productId: '1',
        quantity: 5,
      });
      expect(result).toBeInstanceOf(ApiResponse);
      expect(result.data).toEqual(stock);
    });
  });
});
