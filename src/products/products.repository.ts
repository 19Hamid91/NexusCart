import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Acquires exclusive lock on product stock row
  async getStockForUpdate(transactionClient: any, productId: string) {
    const stocks = await transactionClient.$queryRaw`
            SELECT id, quantity, "reserved_quantity" as "reservedQuantity" 
            FROM stocks
            WHERE product_id = ${productId}::uuid
            FOR UPDATE
        `;
    return stocks[0] || null;
  }

  // Deducts quantity atomically if conditions are met
  async deductStock(
    transactionClient: any,
    productId: string,
    quantity: number,
  ): Promise<boolean> {
    const affected = await transactionClient.$executeRaw`
    UPDATE stocks
    SET quantity = quantity - ${quantity}
    WHERE product_id = ${productId}::uuid
    AND quantity >= ${quantity}
`;
    return affected > 0;
  }

  // Replenish (increases) quantity of product stock
  async replenishStock(productId: string, quantity: number) {
    return this.prisma.stock.update({
      where: { productId },
      data: {
        quantity: {
          increment: quantity,
        },
      },
    });
  }

  // Find product by id
  async findById(productId: string) {
    return this.prisma.product.findUnique({
      where: { id: productId },
      include: { stock: true },
    });
  }

  // Find all products
  async findAll() {
    return this.prisma.product.findMany({
      include: { stock: true },
    });
  }

  // Create product
  async create(name: string, sku: string, price: number, initialStock: number) {
    return this.prisma.product.create({
      data: {
        name,
        sku,
        price,
        stock: {
          create: {
            quantity: initialStock,
          },
        },
      },
      include: { stock: true },
    });
  }
}
