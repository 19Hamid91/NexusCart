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
