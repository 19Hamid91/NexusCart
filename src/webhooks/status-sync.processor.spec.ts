import { Test, TestingModule } from '@nestjs/testing';
import { StatusSyncProcessor } from './status-sync.processor';
import { OrdersRepository } from '../orders/orders.repository';
import { Job } from 'bullmq';

describe('StatusSyncProcessor', () => {
  let processor: StatusSyncProcessor;
  let ordersRepository: jest.Mocked<OrdersRepository>;

  beforeEach(async () => {
    const mockRepo = {
      findShipmentByOrderId: jest.fn(),
      updateShipmentStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusSyncProcessor,
        { provide: OrdersRepository, useValue: mockRepo },
      ],
    }).compile();

    processor = module.get<StatusSyncProcessor>(StatusSyncProcessor);
    ordersRepository = module.get(OrdersRepository);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should update shipment status successfully', async () => {
      const mockJob = {
        id: 'job-webhook-1',
        data: {
          orderId: 'order-123',
          status: 'DELIVERED',
        },
      } as Job;

      ordersRepository.findShipmentByOrderId.mockResolvedValue({
        id: 'ship-123',
        orderId: 'order-123',
        courierName: 'JNE',
        status: 'PROCESSING',
      } as any);

      ordersRepository.updateShipmentStatus.mockResolvedValue({} as any);

      const result = await processor.process(mockJob);
      expect(result).toEqual({ success: true });
      expect(ordersRepository.findShipmentByOrderId).toHaveBeenCalledWith('order-123');
      expect(ordersRepository.updateShipmentStatus).toHaveBeenCalledWith('ship-123', 'DELIVERED');
    });

    it('should throw Error if shipment is not found', async () => {
      const mockJob = {
        id: 'job-webhook-1',
        data: {
          orderId: 'order-123',
          status: 'DELIVERED',
        },
      } as Job;

      ordersRepository.findShipmentByOrderId.mockResolvedValue(null);

      await expect(processor.process(mockJob)).rejects.toThrow(
        'Shipment for order order-123 not found',
      );
    });
  });
});
