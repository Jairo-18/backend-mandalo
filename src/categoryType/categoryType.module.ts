import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { CategoryTypeController } from './controllers/categoryType.controller';
import { CategoryTypeService } from './services/categoryType.service';
import { CategoryTypeUC } from './useCases/categoryType.uc';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [CategoryTypeController],
  providers: [CategoryTypeService, CategoryTypeUC],
  exports: [CategoryTypeService],
})
export class CategoryTypeModule {}
