import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { SettlementController } from './controllers/settlement.controller';
import { SettlementService } from './services/settlement.service';
import { SettlementUC } from './useCases/settlement.uc';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [SettlementController],
  providers: [SettlementService, SettlementUC],
  exports: [SettlementService],
})
export class SettlementModule {}
