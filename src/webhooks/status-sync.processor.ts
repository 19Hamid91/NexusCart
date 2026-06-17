import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OrdersRepository } from '../orders/orders.repository';

@Processor('status-sync')
@Injectable()
export class StatusSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(StatusSyncProcessor.name);

  constructor(private readonly ordersRepository: OrdersRepository) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing status sync for job ${job.id}`);
    const { orderId, status } = job.data;

    const shipment = await this.ordersRepository.findShipmentByOrderId(orderId);
    if (!shipment) {
      throw new Error(`Shipment for order ${orderId} not found`);
    }

    await this.ordersRepository.updateShipmentStatus(shipment.id, status);

    this.logger.log(`Shipment status synchronized to: ${status}`);
    return { success: true };
  }
}
