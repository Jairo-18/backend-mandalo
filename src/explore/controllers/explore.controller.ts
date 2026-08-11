import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiTags } from '@nestjs/swagger';
import { ExploreUC } from '../useCases/explore.uc';
import {
  DeliveryEstimateParamsDto,
  PaginatedExploreOrganizationalsParamsDto,
  PaginatedExploreProductsParamsDto,
} from '../dtos/explore.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import { Organizational } from '../../shared/entities/organizational.entity';
import { Product } from '../../shared/entities/product.entity';
import {
  FindExploreOrganizationalDocs,
  GetDeliveryEstimateDocs,
  GetExploreFiltersDocs,
  GetPaginatedExploreAllProductsDocs,
  GetPaginatedExploreOrganizationalsDocs,
  GetPaginatedExploreProductsDocs,
} from '../decorators/explore.decorators';

/**
 * Explorar (vista del CLIENTE, rol USER): negocios visibles y sus productos.
 * Solo lectura — la gestión vive en /organizational (admin) y /product (NEGO).
 *
 * PÚBLICO (sin AuthGuard, §44): un INVITADO sin sesión puede ver el home y
 * armar el carrito antes de registrarse ("engancharlo"). Sigue protegido por
 * el `ApiKeyGuard` global (header `X-Client-Key`) — no es una API abierta, solo
 * no exige JWT. Ninguno de estos endpoints usa el usuario (el `near` viaja como
 * query param), así que quitar el guard no cambia la lógica.
 *
 * Todo el controller se CACHEA (CacheInterceptor, clave = URL con query
 * params): la respuesta es idéntica para todos los usuarios, así que el feed
 * del home no castiga a Postgres en cada scroll. Invalidación por TTL corto
 * (§21) — un cambio de producto/negocio tarda ese TTL en verse en el explorar.
 */
@Controller('explore')
@ApiTags('Explorar (cliente)')
@UseInterceptors(CacheInterceptor)
export class ExploreController {
  constructor(private readonly _exploreUC: ExploreUC) {}

  @Get('filters')
  @CacheTTL(10 * 60_000) // tags/categorías casi no cambian
  @GetExploreFiltersDocs()
  async filters() {
    const data = await this._exploreUC.filters();
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Get('products')
  @CacheTTL(2 * 60_000) // el feed del home (platillos) — 2 min de dato viejo es OK
  @GetPaginatedExploreAllProductsDocs()
  async getPaginatedAllProducts(
    @Query() params: PaginatedExploreProductsParamsDto,
  ): Promise<ResponsePaginationDto<Product>> {
    return this._exploreUC.paginatedAllProducts(params);
  }

  @Get('organizationals')
  @CacheTTL(2 * 60_000)
  @GetPaginatedExploreOrganizationalsDocs()
  async getPaginatedOrganizationals(
    @Query() params: PaginatedExploreOrganizationalsParamsDto,
  ): Promise<ResponsePaginationDto<Partial<Organizational>>> {
    return this._exploreUC.paginatedOrganizationals(params);
  }

  @Get('organizationals/:id')
  @CacheTTL(2 * 60_000)
  @FindExploreOrganizationalDocs()
  async findOrganizational(@Param('id', ParseIntPipe) id: number) {
    const data = await this._exploreUC.findOrganizational(id);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Get('organizationals/:id/products')
  @CacheTTL(2 * 60_000)
  @GetPaginatedExploreProductsDocs()
  async getPaginatedProducts(
    @Param('id', ParseIntPipe) id: number,
    @Query() params: PaginatedExploreProductsParamsDto,
  ): Promise<ResponsePaginationDto<Product>> {
    return this._exploreUC.paginatedProducts(id, params);
  }

  @Get('delivery-estimate')
  @CacheTTL(2 * 60_000)
  @GetDeliveryEstimateDocs()
  async deliveryEstimate(@Query() params: DeliveryEstimateParamsDto) {
    const data = await this._exploreUC.deliveryEstimates(params);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }
}
