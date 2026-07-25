import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AppSettingsController } from './controllers/appSettings.controller';
import { AppSettingsService } from './services/appSettings.service';
import { AppSettingsUC } from './useCases/appSettings.uc';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AppSettingsController],
  providers: [AppSettingsService, AppSettingsUC],
  exports: [AppSettingsService],
})
export class AppSettingsModule {}
