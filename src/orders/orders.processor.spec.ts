import { Test, TestingModule } from '@nestjs/testing';
import { OrdersProcessor } from './orders.processor';
import { OrdersRepository } from './orders.repository';
import { Job } from 'bullmq';

describe('OrdersProcessor', () => {
  let processor: OrdersProcessor;
  let ordersRepository: jest.Mocked<OrdersRepository>;

  beforeEach(async () => {
    const mockRepo = {
      updateShipmentStatus: jest.fn(),
      updateOrderStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersProcessor,
        { provide: OrdersRepository, useValue: mockRepo },
      ],
    }).compile();

    processor = module.get<OrdersProcessor>(OrdersProcessor);
    ordersRepository = module.get(OrdersRepository);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should process job, update shipment status to PICKED_UP and order to DISPATCHED', async () => {
      const mockJob = {
        id: 'job-1',
        data: {
          orderId: 'order-123',
          shipmentId: 'ship-123',
          courierName: 'JNE',
        },
      } as Job;

      ordersRepository.updateShipmentStatus.mockResolvedValue({} as any);
      ordersRepository.updateOrderStatus.mockResolvedValue({} as any);

      const result = await processor.process(mockJob);
      expect(result.trackingId).toMatch(/^TRK-\d{6}$/);
      expect(ordersRepository.updateShipmentStatus).toHaveBeenCalledWith(
        'ship-123',
        'PICKED_UP',
        result.trackingId,
      );
      expect(ordersRepository.updateOrderStatus).toHaveBeenCalledWith(
        'order-123',
        'DISPATCHED',
      );
    });
  });
});
