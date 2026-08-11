import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ExploreController } from './controllers/explore.controller';
import { ExploreService } from './services/explore.service';
import { ExploreUC } from './useCases/explore.uc';
import { InvoiceModule } from '../invoice/invoice.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Reusa `InvoiceService.previewDeliveryFee` para la cotización del
    // explorar (distancia + tarifa + recargos), sin duplicar esa lógica.
    InvoiceModule,
  ],
  controllers: [ExploreController],
  providers: [ExploreService, ExploreUC],
})
export class ExploreModule {}
