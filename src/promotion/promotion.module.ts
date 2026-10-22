import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PromotionController } from './controllers/promotion.controller';
import { PromotionService } from './services/promotion.service';
import { LocalStorageModule } from '../localStorage/localStorage.module';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), LocalStorageModule],
  controllers: [PromotionController],
  providers: [PromotionService],
})
export class PromotionModule {}
