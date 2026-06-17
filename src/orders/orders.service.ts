import {
  Injectable,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { ProductsRepository } from '../products/products.repository';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productsRepository: ProductsRepository,
    private readonly ordersRepository: OrdersRepository,
    @InjectQueue('logistics-dispatch') private readonly logisticsQueue: Queue,
  ) {}

  async checkout(
    userId: string,
    items: { productId: string; quantity: number; unitPrice: number }[],
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        let orderTotal = 0;

        for (const item of items) {
          const stock = await this.productsRepository.getStockForUpdate(
            tx,
            item.productId,
          );
          if (!stock || stock.quantity < item.quantity) {
            throw new ConflictException(
              `Stock insufficient for product: ${item.productId}`,
            );
          }

          const isSuccess = await this.productsRepository.deductStock(
            tx,
            item.productId,
            item.quantity,
          );
          if (!isSuccess) {
            throw new ConflictException(
              `Failed to reserve stock for product: ${item.productId}`,
            );
          }

          orderTotal += item.unitPrice * item.quantity;
        }

        const order = await tx.order.create({
          data: {
            userId,
            totalAmount: orderTotal,
            status: 'PENDING_PAYMENT',
            items: {
              create: items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
              })),
            },
          },
          include: { items: true },
        });

        return order;
      });
    } catch (error) {
      this.logger.error(
        '[OrdersService.checkout] Checkout transaction failed',
        error,
      );
      throw error;
    }
  }

  async capturePayment(orderId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
        });
        if (!order || order.status !== 'PENDING_PAYMENT') {
          throw new ConflictException('Order not found or already processed');
        }

        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: { status: 'PAID' },
        });

        const shipment = await tx.shipment.create({
          data: {
            orderId,
            courierName: 'JNE',
            status: 'PROCESSING',
          },
        });

        await this.logisticsQueue.add(
          'dispatch-job',
          {
            orderId,
            shipmentId: shipment.id,
            courierName: shipment.courierName,
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          },
        );

        return { order: updatedOrder, shipment };
      });
    } catch (error) {
      this.logger.error(
        '[OrdersService.capturePayment] Payment capture failed',
        error,
      );
      throw error;
    }
  }

  async findOne(orderId: string) {
    const order = await this.ordersRepository.findOrderById(orderId);
    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }
    return order;
  }
}
