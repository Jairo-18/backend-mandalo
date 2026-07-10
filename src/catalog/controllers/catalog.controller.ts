import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiTags } from '@nestjs/swagger';
import { CatalogService } from '../services/catalog.service';
import { SkipApiKey } from '../../shared/decorators/skip-api-key.decorator';

/**
 * Catálogos públicos (DANE + tipos de identificación). Se cachean 24 h
 * (CacheInterceptor, clave = URL con query params): prácticamente nunca
 * cambian y son iguales para todos. Ver plan de caché en NOTAS §21.
 */
@Controller('catalog')
@ApiTags('Catálogos')
@SkipApiKey()
@UseInterceptors(CacheInterceptor)
@CacheTTL(24 * 60 * 60_000)
export class CatalogController {
  constructor(private readonly _catalogService: CatalogService) {}

  @Get('departments')
  departments() {
    return this._catalogService.getDepartments();
  }

  @Get('municipalities')
  municipalities(@Query('departmentId') departmentId?: string) {
    const id = departmentId ? Number(departmentId) : undefined;
    return this._catalogService.getMunicipalities(
      Number.isNaN(id as number) ? undefined : id,
    );
  }

  @Get('identification-types')
  identificationTypes() {
    return this._catalogService.getIdentificationTypes();
  }
}
