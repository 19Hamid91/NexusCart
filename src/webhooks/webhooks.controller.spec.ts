import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { getQueueToken } from '@nestjs/bullmq';
import { UnauthorizedException } from '@nestjs/common';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let queue: any;

  beforeEach(async () => {
    const mockQueue = {
      add: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: getQueueToken('status-sync'), useValue: mockQueue },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
    queue = module.get(getQueueToken('status-sync'));
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleWebhook', () => {
    it('should queue the status sync job successfully', async () => {
      const payload = { orderId: 'order-123', status: 'IN_TRANSIT' };
      const signature = 'valid-sig';

      const result = await controller.handleWebhook(signature, payload);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Payload received and queued');
      expect(queue.add).toHaveBeenCalledWith('sync-job', payload, expect.any(Object));
    });

    it('should throw UnauthorizedException if signature is invalid', async () => {
      // For now isValidHmac returns true. If we modify isValidHmac, we would test invalid signature here.
      // Let's spy on isValidHmac to return false to test the throw.
      jest.spyOn(controller as any, 'isValidHmac').mockReturnValue(false);

      await expect(
        controller.handleWebhook('invalid-sig', {}),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
