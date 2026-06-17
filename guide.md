# Guide: Implementing NexusCart Logistics & Inventory Sync Engine

Welcome to the NexusCart guide. This guide outlines the directory structure, file mappings, and architectural standards based on an **Idiomatic NestJS Modular Clean Architecture** that balances database isolation, testability, and standard NestJS patterns.

---

## 1. Directory Structure & File Mapping

The application is structured into domain-focused modules under `src/`. Database access is isolated inside **repositories** to satisfy Clean Architecture isolation without POJO-to-ORM mapping overhead:

```
src/
├── products/
│   ├── dto/
│   │   └── replenish-stock.dto.ts
│   ├── products.controller.ts     # HTTP endpoints for listing & topups
│   ├── products.service.ts        # Business logic for stock management
│   ├── products.repository.ts     # Row-level locking & raw SQL stock deduction
│   └── products.module.ts
│
├── orders/
│   ├── dto/
│   │   └── checkout.dto.ts
│   ├── orders.controller.ts       # Checkout API & payment capture simulation
│   ├── orders.service.ts          # Order coordination, state engine & transitions
│   ├── orders.repository.ts       # DB access for Orders, Items & Shipments
│   ├── orders.processor.ts        # BullMQ Worker executing courier dispatches
│   └── orders.module.ts           # Configures queues (LogisticsDispatchQueue)
│
├── webhooks/
│   ├── dto/
│   │   └── courier-webhook.dto.ts
│   ├── webhooks.controller.ts     # Synchronous fast-response ingest (202 Accepted)
│   ├── webhooks.service.ts        # Signature checking & queuing logic
│   └── webhooks.module.ts         # Configures queues (StatusSyncQueue)
│
├── common/
│   ├── dto/
│   │   └── api-response.dto.ts    # Standard response shape (RecordCount)
│   ├── filters/
│   │   └── http-exception.filter.ts
│   └── guards/
│       └── jwt.guard.ts
│
├── app.module.ts                  # Combines all feature modules + Prisma + Redis
└── main.ts
```

---

## 1.1 NestJS CLI Generation Commands

Use the NestJS CLI to generate the modules, controllers, services, and repositories. These commands automatically register providers and controllers in their respective modules and place files in the correct flat folder layout:

```bash
# Generate Products Module
npx nest g mo products
npx nest g co products --no-spec --flat
npx nest g s products --no-spec --flat
npx nest g cl products/products.repository --no-spec --flat

# Generate Orders Module
npx nest g mo orders
npx nest g co orders --no-spec --flat
npx nest g s orders --no-spec --flat
npx nest g cl orders/orders.repository --no-spec --flat
npx nest g cl orders/orders.processor --no-spec --flat

# Generate Webhooks Module
npx nest g mo webhooks
npx nest g co webhooks --no-spec --flat
npx nest g s webhooks --no-spec --flat
```

---

## 2. Prisma Database Schema (`prisma/schema.prisma`)

Create `prisma/schema.prisma` mapping the Postgres tables. Note that `stocks` is kept separate from `products` to keep row locks target-specific:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum OrderStatus {
  PENDING_PAYMENT
  PAID
  DISPATCHED
  CANCELLED
}

enum ShipmentStatus {
  PROCESSING
  PICKED_UP
  IN_TRANSIT
  DELIVERED
}

model Product {
  id        String      @id @default(uuid()) @db.Uuid
  name      String
  sku       String      @unique
  price     Decimal     @db.Decimal(12, 2)
  createdAt DateTime    @default(now()) @map("created_at")
  stock     Stock?
  orderItems OrderItem[]

  @@map("products")
}

model Stock {
  id               String  @id @default(uuid()) @db.Uuid
  productId        String  @unique @map("product_id") @db.Uuid
  product          Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  quantity         Int
  reservedQuantity Int     @default(0) @map("reserved_quantity")

  // Note: Add DB CHECK constraint in migration: quantity >= 0
  @@map("stocks")
}

model Order {
  id          String      @id @default(uuid()) @db.Uuid
  userId      String      @map("user_id") @db.Uuid
  totalAmount Decimal     @map("total_amount") @db.Decimal(12, 2)
  status      OrderStatus @default(PENDING_PAYMENT)
  createdAt   DateTime    @default(now()) @map("created_at")
  items       OrderItem[]
  shipment    Shipment?

  @@map("orders")
}

model OrderItem {
  id        String   @id @default(uuid()) @db.Uuid
  orderId   String   @map("order_id") @db.Uuid
  order     Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId String   @map("product_id") @db.Uuid
  product   Product  @relation(fields: [productId], references: [id])
  quantity  Int
  unitPrice Decimal  @map("unit_price") @db.Decimal(12, 2)

  @@map("order_items")
}

model Shipment {
  id         String         @id @default(uuid()) @db.Uuid
  orderId    String         @unique @map("order_id") @db.Uuid
  order      Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  trackingId String?        @unique @map("tracking_id")
  courierName String        @map("courier_name")
  status     ShipmentStatus @default(PROCESSING)
  updatedAt  DateTime       @updatedAt @map("updated_at")

  @@map("shipments")
}
```

---

## 3. Implementation Rules (Mandatory Alignment)

### 3.1 Coding & Variable Naming (Rule 4)
- Keep patterns flat. Prioritize readable implementations over complex abstractions.
- Use descriptive, real-world variables. Never use single letters like `x` or `z`.
- Write one-line comments explaining **why** code was written, never **what** it does.

### 3.2 API Response Standard (Rule 5)
Every GET list-based or data-fetching endpoint response must return:
- `success`: boolean
- `message`: string
- `RecordCount`: number
- `data`: any[] or object

Example Response Shape:
```json
{
  "success": true,
  "message": "Products fetched successfully",
  "RecordCount": 2,
  "data": [
    { "id": "uuid-1", "sku": "SKU-001", "quantity": 10 },
    { "id": "uuid-2", "sku": "SKU-002", "quantity": 5 }
  ]
}
```

### 3.3 Error Handling & Database Safety (AGENTS.md)
- **Mutations (POST, PUT, PATCH, DELETE)**: Always wrap in `try-catch`. Log errors with context: `logger.error('[ServiceName.methodName]', error)`, then re-throw a typed HTTP exception. Never swallow errors silently.
- **Transactions**: Flows with 2+ DB writes (such as checkout, which writes to Orders and updates Stock quantities) must use `prisma.$transaction` for database-level atomicity.

---

## 4. Key Code Implementations

Use these reference patterns to start building:

### 4.1 Database Infrastructure Module

#### [NEW] [prisma.service.ts](file:///c:/Hamid/web/nexuscart/src/infrastructure/database/prisma.service.ts)
```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

#### [NEW] [prisma.module.ts](file:///c:/Hamid/web/nexuscart/src/infrastructure/database/prisma.module.ts)
```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### 4.2 Products Module Implementation

#### [MODIFY] [products.repository.ts](file:///c:/Hamid/web/nexuscart/src/products/products.repository.ts)
```typescript
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
  async deductStock(transactionClient: any, productId: string, quantity: number): Promise<boolean> {
    const affected = await transactionClient.$executeRaw`
      UPDATE stocks
      SET quantity = quantity - ${quantity}
      WHERE product_id = ${productId}::uuid AND quantity >= ${quantity}
    `;
    return affected > 0;
  }

  // Replenishes (increases) quantity of product stock
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
}
```

#### [NEW] [replenish-stock.dto.ts](file:///c:/Hamid/web/nexuscart/src/products/dto/replenish-stock.dto.ts)
```typescript
export class ReplenishStockDto {
  productId: string;
  quantity: number;
}
```

#### [MODIFY] [products.service.ts](file:///c:/Hamid/web/nexuscart/src/products/products.service.ts)
```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProductsRepository } from './products.repository';
import { ReplenishStockDto } from './dto/replenish-stock.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly productsRepository: ProductsRepository) {}

  async findAll() {
    return this.productsRepository.findAll();
  }

  async findById(productId: string) {
    const product = await this.productsRepository.findById(productId);
    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }
    return product;
  }

  async replenishStock(dto: ReplenishStockDto) {
    if (dto.quantity <= 0) {
      throw new BadRequestException('Replenish quantity must be greater than zero');
    }
    const product = await this.productsRepository.findById(dto.productId);
    if (!product) {
      throw new NotFoundException(`Product with ID ${dto.productId} not found`);
    }
    return this.productsRepository.replenishStock(dto.productId, dto.quantity);
  }
}
```

#### [MODIFY] [products.controller.ts](file:///c:/Hamid/web/nexuscart/src/products/products.controller.ts)
```typescript
import { Controller, Get, Post, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ReplenishStockDto } from './dto/replenish-stock.dto';
import { ApiResponse } from '../common/dto/api-response.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll() {
    const products = await this.productsService.findAll();
    return new ApiResponse(products, 'Products retrieved successfully');
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const product = await this.productsService.findById(id);
    return new ApiResponse(product, 'Product retrieved successfully');
  }

  @Post('replenish')
  async replenishStock(@Body() dto: ReplenishStockDto) {
    const updatedStock = await this.productsService.replenishStock(dto);
    return new ApiResponse(updatedStock, 'Stock replenished successfully');
  }
}
```

#### [MODIFY] [products.module.ts](file:///c:/Hamid/web/nexuscart/src/products/products.module.ts)
```typescript
import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductsRepository } from './products.repository';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductsRepository],
  exports: [ProductsRepository],
})
export class ProductsModule {}
```

### 4.3 Orders Module Implementation

#### [NEW] [checkout.dto.ts](file:///c:/Hamid/web/nexuscart/src/orders/dto/checkout.dto.ts)
```typescript
export class CheckoutDto {
  userId: string;
  items: {
    productId: string;
    quantity: number;
    unitPrice: number;
  }[];
}
```

#### [MODIFY] [orders.repository.ts](file:///c:/Hamid/web/nexuscart/src/orders/orders.repository.ts)
```typescript
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

  async updateShipmentStatus(shipmentId: string, status: any, trackingId?: string) {
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
```

#### [MODIFY] [orders.service.ts](file:///c:/Hamid/web/nexuscart/src/orders/orders.service.ts)
```typescript
import { Injectable, ConflictException, Logger, NotFoundException } from '@nestjs/common';
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

  async checkout(userId: string, items: { productId: string; quantity: number; unitPrice: number }[]) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        let orderTotal = 0;

        for (const item of items) {
          const stock = await this.productsRepository.getStockForUpdate(tx, item.productId);
          if (!stock || stock.quantity < item.quantity) {
            throw new ConflictException(`Stock insufficient for product: ${item.productId}`);
          }

          const isSuccess = await this.productsRepository.deductStock(tx, item.productId, item.quantity);
          if (!isSuccess) {
            throw new ConflictException(`Failed to reserve stock for product: ${item.productId}`);
          }

          orderTotal += item.unitPrice * item.quantity;
        }

        const order = await tx.order.create({
          data: {
            userId,
            totalAmount: orderTotal,
            status: 'PENDING_PAYMENT',
            items: {
              create: items.map(item => ({
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
      this.logger.error('[OrdersService.checkout] Checkout transaction failed', error);
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

        await this.logisticsQueue.add('dispatch-job', {
          orderId,
          shipmentId: shipment.id,
          courierName: shipment.courierName,
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        });

        return { order: updatedOrder, shipment };
      });
    } catch (error) {
      this.logger.error('[OrdersService.capturePayment] Payment capture failed', error);
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
```

#### [MODIFY] [orders.controller.ts](file:///c:/Hamid/web/nexuscart/src/orders/orders.controller.ts)
```typescript
import { Controller, Post, Get, Body, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';
import { ApiResponse } from '../common/dto/api-response.dto';
import { JwtGuard } from '../common/guards/jwt.guard';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  @UseGuards(JwtGuard)
  async checkout(@Body() dto: CheckoutDto) {
    const order = await this.ordersService.checkout(dto.userId, dto.items);
    return new ApiResponse(order, 'Checkout successful and order created');
  }

  @Post(':id/pay')
  @UseGuards(JwtGuard)
  async pay(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.ordersService.capturePayment(id);
    return new ApiResponse(result, 'Payment captured and shipment initialized');
  }

  @Get(':id')
  @UseGuards(JwtGuard)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const order = await this.ordersService.findOne(id);
    return new ApiResponse(order, 'Order retrieved successfully');
  }
}
```

#### [MODIFY] [orders.processor.ts](file:///c:/Hamid/web/nexuscart/src/orders/orders.processor.ts)
```typescript
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

    await this.ordersRepository.updateShipmentStatus(shipmentId, 'PICKED_UP', trackingId);
    await this.ordersRepository.updateOrderStatus(orderId, 'DISPATCHED');

    this.logger.log(`Shipment ${shipmentId} dispatched with tracking ID ${trackingId}`);
    return { trackingId };
  }
}
```

#### [MODIFY] [orders.module.ts](file:///c:/Hamid/web/nexuscart/src/orders/orders.module.ts)
```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { OrdersProcessor } from './orders.processor';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [
    ProductsModule,
    BullModule.registerQueue({
      name: 'logistics-dispatch',
    }),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, OrdersProcessor],
  exports: [OrdersRepository],
})
export class OrdersModule {}
```

### 4.4 Webhooks Module Implementation

#### [MODIFY] [webhooks.controller.ts](file:///c:/Hamid/web/nexuscart/src/webhooks/webhooks.controller.ts)
```typescript
import { Controller, Post, Body, Headers, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    @InjectQueue('status-sync') private readonly statusSyncQueue: Queue
  ) {}

  @Post('courier')
  @HttpCode(HttpStatus.ACCEPTED) // Returns 202 Accepted synchronously
  async handleWebhook(
    @Headers('x-courier-signature') signature: string,
    @Body() payload: any
  ) {
    if (!this.isValidHmac(payload, signature)) {
      throw new UnauthorizedException('Invalid payload signature');
    }

    // Persist to queue immediately to clear the thread
    await this.statusSyncQueue.add('sync-job', payload, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
    });

    return {
      success: true,
      message: 'Payload received and queued',
    };
  }

  private isValidHmac(payload: any, signature: string): boolean {
    return true; // Replace with crypto-based HMAC verification
  }
}
```

#### [NEW] [status-sync.processor.ts](file:///c:/Hamid/web/nexuscart/src/webhooks/status-sync.processor.ts)
```typescript
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
```

#### [MODIFY] [webhooks.module.ts](file:///c:/Hamid/web/nexuscart/src/webhooks/webhooks.module.ts)
```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { StatusSyncProcessor } from './status-sync.processor';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    OrdersModule,
    BullModule.registerQueue({
      name: 'status-sync',
    }),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, StatusSyncProcessor],
})
export class WebhooksModule {}
```

### 4.4 Global Standard Response DTO (`api-response.dto.ts`)

```typescript
// src/common/dto/api-response.dto.ts
export class ApiResponse<T> {
  success: boolean;
  message: string;
  RecordCount: number;
  data: T;

  constructor(data: T, message = 'Success', success = true) {
    this.success = success;
    this.message = message;
    this.data = data;
    this.RecordCount = Array.isArray(data) ? data.length : 1;
  }
}
```

---

## 5. Verification Checklists

- **Concurreny Check**: Write an Artillery or k6 script checking `/api/v1/orders/checkout` under concurrency. Running 50 concurrent checkout requests for a stock size of 1 must yield exactly 1 success (201) and 49 conflicts (409).
- **Unit Tests**: Mock `ProductsRepository` in `orders.service.spec.ts` using `jest.mock`. Test transaction safety under failure modes.
- **Webhook Latency Check**: Run load tests on the webhook receiver to ensure ingestion response time stays under 50ms (p99).

---

## 6. Step-by-Step Implementation Roadmap

Follow these step-by-step instructions to complete the implementation of the Logistics & Inventory Sync Engine:

### Step 1: Database & Prisma Setup
1. **Initialize Prisma Client**: Run `npx prisma generate` to generate types.
2. **Create Prisma Module & Service**:
   - Create `src/infrastructure/database/prisma.service.ts` extending `PrismaClient` with `onModuleInit` hook.
   - Create `src/infrastructure/database/prisma.module.ts` to export `PrismaService` globally.
3. **Register Database Module**: Import `PrismaModule` in `AppModule`.

### Step 2: Implement Products Module (Inventory Management)
1. **Products Repository**:
   - Populate `src/products/products.repository.ts` with `getStockForUpdate` using `FOR UPDATE` raw SQL.
   - Populate `deductStock` using raw SQL checking `quantity >= amount`.
2. **Products Service**:
   - Create logic for listing products, fetching stock levels, and replenishing stock.
3. **Products Controller**:
   - Create endpoints for replenishment (`POST /products/replenish`) and list (`GET /products`).

### Step 3: Implement Orders Module (Checkout & Logistics Dispatch)
1. **Queue Configuration**:
   - In `src/orders/orders.module.ts`, register the queue:
     ```typescript
     BullModule.registerQueue({
       name: 'logistics-dispatch',
     })
     ```
2. **Orders Repository**:
   - Implement queries to create orders, order items, and shipments.
3. **Orders Service**:
   - Build `checkout` logic using `prisma.$transaction`.
   - Lock stock row first via `ProductsRepository.getStockForUpdate`.
   - Deduct stock, create order + items, and queue the dispatch job in `logistics-dispatch` queue.
4. **Orders Processor (Worker)**:
   - Implement `src/orders/orders.processor.ts` extending `WorkerHost` from `@nestjs/bullmq`.
   - Process dispatch jobs, simulate third-party API integration, update shipment state, and generate mock tracking ID.

### Step 4: Implement Webhooks Module (Courier Status Update)
1. **Queue Configuration**:
   - In `src/webhooks/webhooks.module.ts`, register the queue:
     ```typescript
     BullModule.registerQueue({
       name: 'status-sync',
     })
     ```
2. **Webhooks Controller**:
   - Accept POST requests from third-party couriers on `/webhooks/courier`.
   - Validate signature, enqueue payload into the `status-sync` queue, and immediately return `202 Accepted`.
3. **Status Sync Processor (Worker)**:
   - Create `src/webhooks/status-sync.processor.ts` to process status updates from the queue.
   - Atomically update shipment and order status matching the webhook update.

### Step 5: Wire Global Middlewares & Error Handling
1. **Register Global Filters**:
   - Update `src/main.ts` to register `HttpExceptionFilter` globally.
2. **Standardize API Responses**:
   - Wrap controller returns with `ApiResponse` helper to ensure proper format and `RecordCount` field presence.

