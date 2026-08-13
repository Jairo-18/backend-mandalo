import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { AppSettingsRepository } from '../../shared/repositories/appSettings.repository';
import { AppSettings } from '../../shared/entities/appSettings.entity';
import { UpdateAppSettingsDto } from '../dtos/appSettings.dto';

/** Fila única (singleton) sembrada por la migración `AddAppSettings`. */
const SETTINGS_ID = 1;

/** Misma key que usa `CacheInterceptor` para `GET /app-settings` (sin query,
 * el key default es la URL de la petición) — hay que borrarla a mano en cada
 * `update()`, si no el próximo `GET` sigue sirviendo la respuesta vieja hasta
 * 10 minutos (`@CacheTTL` del controller) aunque el admin ya haya guardado. */
const CACHE_KEY = '/app-settings';

@Injectable()
export class AppSettingsService {
  constructor(
    private readonly _appSettingsRepository: AppSettingsRepository,
    @Inject(CACHE_MANAGER) private readonly _cacheManager: Cache,
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
    const saved = await this._appSettingsRepository.save(settings);
    // Sin esto, el próximo GET (splash de la app, o esta misma pantalla del
    // admin) seguía devolviendo la respuesta cacheada de ANTES del cambio.
    await this._cacheManager.del(CACHE_KEY);
    return saved;
  }
}
