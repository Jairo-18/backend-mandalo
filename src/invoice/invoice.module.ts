import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { InvoiceController } from './controllers/invoice.controller';
import { InvoiceService } from './services/invoice.service';
import { InvoiceUC } from './useCases/invoice.uc';
import { InvoiceGateway } from './invoice.gateway';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [InvoiceController],
  providers: [InvoiceService, InvoiceUC, InvoiceGateway],
  // El gateway lo reusa el módulo de chat (mismo socket /orders).
  exports: [InvoiceService, InvoiceGateway],
})
export class InvoiceModule {}
