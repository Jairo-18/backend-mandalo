import { Injectable } from '@nestjs/common';
import { AppSettingsService } from '../services/appSettings.service';
import { UpdateAppSettingsDto } from '../dtos/appSettings.dto';

@Injectable()
export class AppSettingsUC {
  constructor(private readonly _appSettingsService: AppSettingsService) {}

  get() {
    return this._appSettingsService.get();
  }

  update(dto: UpdateAppSettingsDto) {
    return this._appSettingsService.update(dto);
  }
}
