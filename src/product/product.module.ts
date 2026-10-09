import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ProductController } from './controllers/product.controller';
import { ProductService } from './services/product.service';
import { ProductUC } from './useCases/product.uc';
import { LocalStorageModule } from '../localStorage/localStorage.module';
import { InvoiceModule } from '../invoice/invoice.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    LocalStorageModule,
    // Reusa el socket /orders para avisar cambios del catálogo en vivo.
    InvoiceModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, ProductUC],
  exports: [ProductService],
})
export class ProductModule {}
