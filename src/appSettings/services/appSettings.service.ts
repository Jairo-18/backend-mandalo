import { Injectable } from '@nestjs/common';
import { AppSettingsRepository } from '../../shared/repositories/appSettings.repository';
import { AppSettings } from '../../shared/entities/appSettings.entity';
import { UpdateAppSettingsDto } from '../dtos/appSettings.dto';

/** Fila única (singleton) sembrada por la migración `AddAppSettings`. */
const SETTINGS_ID = 1;

@Injectable()
export class AppSettingsService {
  constructor(
    private readonly _appSettingsRepository: AppSettingsRepository,
  ) {}

  /**
   * Siempre devuelve algo, aunque la migración/seed fallara alguna vez: si
   * no existe la fila, la crea con los defaults de la entidad en vez de
   * tronar — este endpoint lo pega la app en el splash, antes de login.
   */
  async get(): Promise<AppSettings> {
    const settings = await this._appSettingsRepository.findOne({
      where: { id: SETTINGS_ID },
    });
    if (settings) return settings;

    const created = this._appSettingsRepository.create({ id: SETTINGS_ID });
    return await this._appSettingsRepository.save(created);
  }

  async update(dto: UpdateAppSettingsDto): Promise<AppSettings> {
    const settings = await this.get();
    Object.assign(settings, dto);
    return await this._appSettingsRepository.save(settings);
  }
}
