import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { LocalStorageModule } from '../localStorage/localStorage.module';
import { DeliveryAccidentController } from './controllers/deliveryAccident.controller';
import { DeliveryAccidentService } from './services/deliveryAccident.service';
import { DeliveryAccidentUC } from './useCases/deliveryAccident.uc';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), LocalStorageModule],
  controllers: [DeliveryAccidentController],
  providers: [DeliveryAccidentService, DeliveryAccidentUC],
})
export class DeliveryAccidentModule {}
