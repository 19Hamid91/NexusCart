import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ProductsRepository } from './products.repository';
import { ReplenishStockDto } from './dto/replenish-stock.dto';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

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

  async create(dto: CreateProductDto) {
    try {
      return await this.productsRepository.create(
        dto.name,
        dto.sku,
        dto.price,
        dto.initialStock,
      );
    } catch (error) {
      this.logger.error('[ProductsService.create] Failed to create product', error);
      throw error;
    }
  }

  async replenishStock(dto: ReplenishStockDto) {
    if (dto.quantity <= 0) {
      throw new BadRequestException(
        'Replenish quantity must be greater than zero',
      );
    }

    const product = await this.productsRepository.findById(dto.productId);
    if (!product) {
      throw new NotFoundException(`Product with ID ${dto.productId} not found`);
    }

    try {
      return await this.productsRepository.replenishStock(
        dto.productId,
        dto.quantity,
      );
    } catch (error) {
      this.logger.error('[ProductsService.replenishStock] Failed to replenish stock', error);
      throw error;
    }
  }
}

