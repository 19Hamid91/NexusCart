import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
      throw new BadRequestException(
        'Replenish quantity must be greater than zero',
      );
    }

    const product = await this.productsRepository.findById(dto.productId);

    if (!product) {
      throw new NotFoundException(`Product with ID ${dto.productId} not found`);
    }

    return this.productsRepository.replenishStock(dto.productId, dto.quantity);
  }
}
