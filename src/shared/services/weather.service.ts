import { Injectable, Logger } from '@nestjs/common';

type CacheEntry = { precipitationMm: number; expiresAt: number };

/**
 * Clima EN VIVO para el recargo del Anexo I: Open-Meteo, gratis y sin API
 * key (https://open-meteo.com), consultado por coordenadas. "Mal clima" =
 * LLUVIA FUERTE (reunión con el cliente 2026-08-04: no cualquier lluvia,
 * solo cuando `current.precipitation` de la última hora >= el umbral
 * `weatherHeavyRainMm` de la tarifa del municipio del negocio).
 *
 * Caché en memoria de 15 minutos por coordenada redondeada a 2 decimales
 * (guarda los mm medidos, no el sí/no: el umbral depende del municipio)
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

  async isBadWeather(
    latitude: number,
    longitude: number,
    heavyRainMm: number,
  ): Promise<boolean> {
    if (!(heavyRainMm > 0)) return false;
    const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.precipitationMm >= heavyRainMm;
    }

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
      const precipitationMm = data.current?.precipitation ?? 0;
      this.cache.set(key, {
        precipitationMm,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });
      return precipitationMm >= heavyRainMm;
    } catch (error) {
      this.logger.warn(
        `Consulta de clima falló, se omite el recargo: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
