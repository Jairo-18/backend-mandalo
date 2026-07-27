import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { SharedModule } from '../shared/shared.module';
import { DashboardController } from './controllers/dashboard.controller';
import { DashboardService } from './services/dashboard.service';
import { DashboardUC } from './useCases/dashboard.uc';

@Module({
  imports: [SharedModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardUC],
})
export class DashboardModule {}
