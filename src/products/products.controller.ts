import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { ReplenishStockDto } from './dto/replenish-stock.dto';
import { CreateProductDto } from './dto/create-product.dto';
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

  @Post('create')
  async create(@Body() dto: CreateProductDto) {
    const product = await this.productsService.create(dto);
    return new ApiResponse(product, 'Product created successfully');
  }
}
