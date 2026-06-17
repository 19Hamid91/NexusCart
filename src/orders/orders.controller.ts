import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
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
