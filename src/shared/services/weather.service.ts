import { Injectable, Logger } from '@nestjs/common';

type CacheEntry = { isBad: boolean; expiresAt: number };

/**
 * Clima EN VIVO para el recargo del Anexo I (§59 de NOTAS): Open-Meteo,
 * gratis y sin API key (https://open-meteo.com), consultado por coordenadas.
 * "Mal clima" = precipitación actual > 0 (lluvia/tormenta en curso).
 *
 * Caché en memoria de 15 minutos por coordenada redondeada a 2 decimales
 * (~1.1km) — evita golpear la API en cada preview del checkout; el dato deja
 * de ser "al segundo" pero sigue siendo el clima real de los últimos 15 min,
 * que es lo que importa para decidir un recargo (no cambia tan rápido).
 * Si la API falla o no responde a tiempo, NO se aplica el recargo (fail-open:
 * un checkout nunca debe romperse por un proveedor externo caído).
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 15 * 60 * 1000;
  private readonly TIMEOUT_MS = 2500;

  async isBadWeather(latitude: number, longitude: number): Promise<boolean> {
    const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.isBad;

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=precipitation`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as {
        current?: { precipitation?: number };
      };
      const isBad = (data.current?.precipitation ?? 0) > 0;
      this.cache.set(key, { isBad, expiresAt: Date.now() + this.CACHE_TTL_MS });
      return isBad;
    } catch (error) {
      this.logger.warn(
        `Consulta de clima falló, se omite el recargo: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
