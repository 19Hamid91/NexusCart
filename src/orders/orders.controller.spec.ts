import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ApiResponse } from '../common/dto/api-response.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { ExecutionContext } from '@nestjs/common';

describe('OrdersController', () => {
  let controller: OrdersController;
  let service: jest.Mocked<OrdersService>;

  beforeEach(async () => {
    const mockService = {
      checkout: jest.fn(),
      capturePayment: jest.fn(),
      findOne: jest.fn(),
    };

    const mockGuard = {
      canActivate: jest.fn((context: ExecutionContext) => true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: mockService }],
    })
      .overrideGuard(JwtGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<OrdersController>(OrdersController);
    service = module.get(OrdersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('checkout', () => {
    it('should return check out order api response', async () => {
      const order = { id: 'order-123', totalAmount: 100 };
      service.checkout.mockResolvedValue(order as any);

      const result = await controller.checkout({
        userId: 'user-123',
        items: [{ productId: 'prod-1', quantity: 1, unitPrice: 100 }],
      });
      expect(result).toBeInstanceOf(ApiResponse);
      expect(result.data).toEqual(order);
    });
  });

  describe('pay', () => {
    it('should capture payment', async () => {
      const payResult = { order: { id: 'order-123' }, shipment: { id: 'ship-1' } };
      service.capturePayment.mockResolvedValue(payResult as any);

      const result = await controller.pay('123e4567-e89b-12d3-a456-426614174000');
      expect(result).toBeInstanceOf(ApiResponse);
      expect(result.data).toEqual(payResult);
    });
  });

  describe('findOne', () => {
    it('should find one order', async () => {
      const order = { id: 'order-123' };
      service.findOne.mockResolvedValue(order as any);

      const result = await controller.findOne('123e4567-e89b-12d3-a456-426614174000');
      expect(result).toBeInstanceOf(ApiResponse);
      expect(result.data).toEqual(order);
    });
  });
});
