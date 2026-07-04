import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TagController } from './controllers/tag.controller';
import { TagService } from './services/tag.service';
import { TagUC } from './useCases/tag.uc';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [TagController],
  providers: [TagService, TagUC],
  exports: [TagService],
})
export class TagModule {}
