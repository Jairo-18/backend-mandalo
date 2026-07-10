import { Injectable } from '@nestjs/common';
import { ExploreService } from '../services/explore.service';
import {
  PaginatedExploreOrganizationalsParamsDto,
  PaginatedExploreProductsParamsDto,
} from '../dtos/explore.dto';

@Injectable()
export class ExploreUC {
  constructor(private readonly _exploreService: ExploreService) {}

  filters() {
    return this._exploreService.filters();
  }

  paginatedOrganizationals(params: PaginatedExploreOrganizationalsParamsDto) {
    return this._exploreService.paginatedOrganizationals(params);
  }

  findOrganizational(id: number) {
    return this._exploreService.findOrganizational(id);
  }

  paginatedAllProducts(params: PaginatedExploreProductsParamsDto) {
    return this._exploreService.paginatedAllProducts(params);
  }

  paginatedProducts(
    organizationalId: number,
    params: PaginatedExploreProductsParamsDto,
  ) {
    return this._exploreService.paginatedProducts(organizationalId, params);
  }
}
