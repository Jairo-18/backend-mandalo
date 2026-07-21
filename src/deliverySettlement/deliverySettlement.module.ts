import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { DeliverySettlementController } from './controllers/deliverySettlement.controller';
import { DeliverySettlementService } from './services/deliverySettlement.service';
import { DeliverySettlementUC } from './useCases/deliverySettlement.uc';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [DeliverySettlementController],
  providers: [DeliverySettlementService, DeliverySettlementUC],
  exports: [DeliverySettlementService],
})
export class DeliverySettlementModule {}
