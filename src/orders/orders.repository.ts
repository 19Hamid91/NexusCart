import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrderById(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, shipment: true },
    });
  }

  async findShipmentByOrderId(orderId: string) {
    return this.prisma.shipment.findUnique({
      where: { orderId },
    });
  }

  async updateShipmentStatus(
    shipmentId: string,
    status: any,
    trackingId?: string,
  ) {
    return this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status,
        ...(trackingId && { trackingId }),
      },
    });
  }

  async updateOrderStatus(orderId: string, status: any) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status },
    });
  }
}
