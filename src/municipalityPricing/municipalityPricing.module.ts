import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { MunicipalityPricingController } from './controllers/municipalityPricing.controller';
import { MunicipalityPricingService } from './services/municipalityPricing.service';
import { MunicipalityPricingUC } from './useCases/municipalityPricing.uc';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [MunicipalityPricingController],
  providers: [MunicipalityPricingService, MunicipalityPricingUC],
})
export class MunicipalityPricingModule {}
