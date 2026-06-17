import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BullModule } from '@nestjs/bullmq';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import 'dotenv/config';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost' ? {} : undefined,
        maxRetriesPerRequest: null,
      },
    }),
    ProductsModule,
    OrdersModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
