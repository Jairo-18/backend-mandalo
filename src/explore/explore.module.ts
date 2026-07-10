import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ExploreController } from './controllers/explore.controller';
import { ExploreService } from './services/explore.service';
import { ExploreUC } from './useCases/explore.uc';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [ExploreController],
  providers: [ExploreService, ExploreUC],
})
export class ExploreModule {}
