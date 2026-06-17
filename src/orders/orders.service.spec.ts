import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { ProductsRepository } from '../products/products.repository';
import { OrdersRepository } from './orders.repository';
import { getQueueToken } from '@nestjs/bullmq';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: jest.Mocked<PrismaService>;
  let productsRepository: jest.Mocked<ProductsRepository>;
  let ordersRepository: jest.Mocked<OrdersRepository>;
  let queue: any;

  beforeEach(async () => {
    const mockPrisma = {
      $transaction: jest.fn((callback) => callback(mockPrisma)),
      order: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      shipment: {
        create: jest.fn(),
      },
    };

    const mockProductsRepo = {
      getStockForUpdate: jest.fn(),
      deductStock: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
    };

    const mockOrdersRepo = {
      findOrderById: jest.fn(),
      findShipmentByOrderId: jest.fn(),
      updateShipmentStatus: jest.fn(),
      updateOrderStatus: jest.fn(),
    };

    const mockQueue = {
      add: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProductsRepository, useValue: mockProductsRepo },
        { provide: OrdersRepository, useValue: mockOrdersRepo },
        { provide: getQueueToken('logistics-dispatch'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get(PrismaService);
    productsRepository = module.get(ProductsRepository);
    ordersRepository = module.get(OrdersRepository);
    queue = module.get(getQueueToken('logistics-dispatch'));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkout', () => {
    const userId = 'user-123';
    const items = [
      { productId: 'prod-1', quantity: 2, unitPrice: 100 },
    ];

    it('should checkout successfully when stock is available', async () => {
      productsRepository.getStockForUpdate.mockResolvedValue({
        quantity: 5,
        reservedQuantity: 0,
      } as any);
      productsRepository.deductStock.mockResolvedValue(true);
      prisma.order.create.mockResolvedValue({
        id: 'order-123',
        userId,
        totalAmount: 200,
        status: 'PENDING_PAYMENT',
        items: [],
      } as any);

      const result = await service.checkout(userId, items);
      expect(result.id).toBe('order-123');
      expect(productsRepository.getStockForUpdate).toHaveBeenCalled();
      expect(productsRepository.deductStock).toHaveBeenCalled();
      expect(prisma.order.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if stock is insufficient', async () => {
      productsRepository.getStockForUpdate.mockResolvedValue({
        quantity: 1,
        reservedQuantity: 0,
      } as any);

      await expect(service.checkout(userId, items)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if deductStock returns false', async () => {
      productsRepository.getStockForUpdate.mockResolvedValue({
        quantity: 5,
        reservedQuantity: 0,
      } as any);
      productsRepository.deductStock.mockResolvedValue(false);

      await expect(service.checkout(userId, items)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('capturePayment', () => {
    const orderId = 'order-123';

    it('should capture payment and queue dispatch successfully', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: orderId,
        status: 'PENDING_PAYMENT',
      } as any);
      prisma.order.update.mockResolvedValue({
        id: orderId,
        status: 'PAID',
      } as any);
      prisma.shipment.create.mockResolvedValue({
        id: 'ship-123',
        orderId,
        courierName: 'JNE',
        status: 'PROCESSING',
      } as any);

      const result = await service.capturePayment(orderId);
      expect(result.order.status).toBe('PAID');
      expect(result.shipment.id).toBe('ship-123');
      expect(queue.add).toHaveBeenCalledWith(
        'dispatch-job',
        {
          orderId,
          shipmentId: 'ship-123',
          courierName: 'JNE',
        },
        expect.any(Object),
      );
    });

    it('should throw ConflictException if order is not pending payment', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: orderId,
        status: 'PAID',
      } as any);

      await expect(service.capturePayment(orderId)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findOne', () => {
    it('should return order if found', async () => {
      const mockOrder = { id: 'order-123', items: [] };
      ordersRepository.findOrderById.mockResolvedValue(mockOrder as any);

      const result = await service.findOne('order-123');
      expect(result).toEqual(mockOrder);
    });

    it('should throw NotFoundException if order is not found', async () => {
      ordersRepository.findOrderById.mockResolvedValue(null);
      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
