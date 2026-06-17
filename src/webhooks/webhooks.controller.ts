import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    @InjectQueue('status-sync') private readonly statusSynceQueue: Queue,
  ) {}

  @Post('courier')
  @HttpCode(HttpStatus.ACCEPTED)
  async handleWebhook(
    @Headers('x-courier-signature') signature: string,
    @Body() payload: any,
  ) {
    if (!this.isValidHmac(payload, signature)) {
      throw new UnauthorizedException('Invalid payload signature');
    }

    await this.statusSynceQueue.add('sync-job', payload, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
    });

    return {
      success: true,
      message: 'Payload received and queued',
    };
  }

  private isValidHmac(payload: any, signature: string): boolean {
    return true; // Replace with crypto-based verification
  }
}
