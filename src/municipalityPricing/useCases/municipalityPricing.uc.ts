import { Injectable } from '@nestjs/common';
import { User } from '../../shared/entities/user.entity';
import { MunicipalityPricingService } from '../services/municipalityPricing.service';
import { UpdateMunicipalityPricingDto } from '../dtos/municipalityPricing.dto';

@Injectable()
export class MunicipalityPricingUC {
  constructor(private readonly _service: MunicipalityPricingService) {}

  overview(admin: User) {
    return this._service.overview(admin);
  }

  updateGeneral(admin: User, dto: UpdateMunicipalityPricingDto) {
    return this._service.updateGeneral(admin, dto);
  }

  updateMunicipality(
    admin: User,
    municipalityId: number,
    dto: UpdateMunicipalityPricingDto,
  ) {
    return this._service.updateMunicipality(admin, municipalityId, dto);
  }

  resetMunicipality(admin: User, municipalityId: number) {
    return this._service.resetMunicipality(admin, municipalityId);
  }
}
