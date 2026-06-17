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
