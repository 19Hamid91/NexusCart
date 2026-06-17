import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { ProductsRepository } from './products.repository';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;
  let repository: jest.Mocked<ProductsRepository>;

  const mockProduct = {
    id: 'prod-123',
    name: 'Sample Product',
    sku: 'PROD123',
    price: null,
    createdAt: new Date(),
    stock: {
      id: 'stock-123',
      productId: 'prod-123',
      quantity: 10,
      reservedQuantity: 0,
    },
  };

  beforeEach(async () => {
    const mockRepo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      replenishStock: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: ProductsRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    repository = module.get(ProductsRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all products', async () => {
      repository.findAll.mockResolvedValue([mockProduct] as any);
      const result = await service.findAll();
      expect(result).toEqual([mockProduct]);
      expect(repository.findAll).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return a product if found', async () => {
      repository.findById.mockResolvedValue(mockProduct as any);
      const result = await service.findById('prod-123');
      expect(result).toEqual(mockProduct);
    });

    it('should throw NotFoundException if product is not found', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('replenishStock', () => {
    it('should replenish stock successfully', async () => {
      repository.findById.mockResolvedValue(mockProduct as any);
      repository.replenishStock.mockResolvedValue({
        ...mockProduct.stock,
        quantity: 15,
      } as any);

      const result = await service.replenishStock({
        productId: 'prod-123',
        quantity: 5,
      });
      expect(result.quantity).toBe(15);
    });

    it('should throw BadRequestException if quantity is zero or negative', async () => {
      await expect(
        service.replenishStock({ productId: 'prod-123', quantity: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if product does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        service.replenishStock({ productId: 'non-existent', quantity: 5 }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
