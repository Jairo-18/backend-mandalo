import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CatalogService } from '../services/catalog.service';
import { SkipApiKey } from '../../shared/decorators/skip-api-key.decorator';

@Controller('catalog')
@ApiTags('Catálogos')
@SkipApiKey()
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
