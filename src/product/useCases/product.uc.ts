import { Injectable } from '@nestjs/common';
import { ProductService } from '../services/product.service';
import { User } from '../../shared/entities/user.entity';
import {
  CreateProductDto,
  PaginatedProductsParamsDto,
  UpdateProductDto,
} from '../dtos/product.dto';

@Injectable()
export class ProductUC {
  constructor(private readonly _productService: ProductService) {}

  create(user: User, dto: CreateProductDto) {
    return this._productService.create(user, dto);
  }

  findOne(user: User, id: number) {
    return this._productService.findOne(user, id);
  }

  paginatedList(user: User, params: PaginatedProductsParamsDto) {
    return this._productService.paginatedList(user, params);
  }

  update(user: User, id: number, dto: UpdateProductDto) {
    return this._productService.update(user, id, dto);
  }

  delete(user: User, id: number) {
    return this._productService.delete(user, id);
  }

  addImage(user: User, id: number, file: Express.Multer.File) {
    return this._productService.addImage(user, id, file);
  }

  removeImage(user: User, id: number, url: string) {
    return this._productService.removeImage(user, id, url);
  }
}
