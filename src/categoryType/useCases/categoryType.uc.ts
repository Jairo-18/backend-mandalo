import { Injectable } from '@nestjs/common';
import { CategoryTypeService } from '../services/categoryType.service';
import {
  CreateCategoryTypeDto,
  PaginatedCategoryTypesParamsDto,
  UpdateCategoryTypeDto,
} from '../dtos/categoryType.dto';

@Injectable()
export class CategoryTypeUC {
  constructor(private readonly _categoryTypeService: CategoryTypeService) {}

  create(dto: CreateCategoryTypeDto) {
    return this._categoryTypeService.create(dto);
  }

  findOne(id: number) {
    return this._categoryTypeService.findOne(id);
  }

  paginatedList(params: PaginatedCategoryTypesParamsDto) {
    return this._categoryTypeService.paginatedList(params);
  }

  update(id: number, dto: UpdateCategoryTypeDto) {
    return this._categoryTypeService.update(id, dto);
  }

  delete(id: number) {
    return this._categoryTypeService.delete(id);
  }
}
