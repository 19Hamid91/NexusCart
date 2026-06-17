import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OrdersRepository } from './orders.repository';

@Processor('logistics-dispatch')
@Injectable()
export class OrdersProcessor extends WorkerHost {
  private readonly logger = new Logger(OrdersProcessor.name);

  constructor(private readonly ordersRepository: OrdersRepository) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing job ${job.id} for order ${job.data.orderId}`);
    const { orderId, shipmentId } = job.data;

    // Simulate 1 second courier API response latency
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const trackingId = `TRK-${Math.floor(100000 + Math.random() * 900000)}`;

    await this.ordersRepository.updateShipmentStatus(
      shipmentId,
      'PICKED_UP',
      trackingId,
    );
    await this.ordersRepository.updateOrderStatus(orderId, 'DISPATCHED');

    this.logger.log(
      `Shipment ${shipmentId} dispatched with tracking ID ${trackingId}`,
    );
    return { trackingId };
  }
}
