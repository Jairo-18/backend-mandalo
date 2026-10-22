import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ReviewController } from './controllers/review.controller';
import { ReviewService } from './services/review.service';
import { ReviewUC } from './useCases/review.uc';
import { InvoiceModule } from '../invoice/invoice.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Reusa el gateway del socket /orders para avisar en vivo al calificado.
    InvoiceModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService, ReviewUC],
})
export class ReviewModule {}
