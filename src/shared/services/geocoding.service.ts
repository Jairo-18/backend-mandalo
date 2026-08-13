import { Injectable, Logger } from '@nestjs/common';

export type AddressSearchResult = {
  label: string;
  latitude: number;
  longitude: number;
};

/**
 * Geocodificación para el selector de ubicación de negocios (admin):
 * buscar dirección → coordenadas, coordenadas → dirección legible, y
 * resolver links "Compartir" acortados de Google Maps. Nominatim
 * (OpenStreetMap) es gratis y sin API key — mismo espíritu que
 * `WeatherService` (Open-Meteo): timeout corto + fail-open (nunca lanza,
 * un proveedor externo caído no debe romper el formulario del admin).
 *
 * Todo vive del lado del servidor (nunca se llama directo desde el
 * cliente) por dos razones: la política de uso de Nominatim exige un
 * `User-Agent` identificando la app, y el navegador no deja setear ese
 * header desde JS; y los links "Compartir" de Google Maps no traen CORS,
 * así que seguir su redirección desde el navegador falla.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly TIMEOUT_MS = 8000;
  private readonly USER_AGENT = 'MandaloApp/1.0 (+https://somosmandalo.com)';
  private readonly SHORT_LINK_HOSTS = [
    'maps.app.goo.gl',
    'goo.gl',
    'g.co',
  ];

  private async fetchWithTimeout(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Sigue la redirección de un link acortado de Google Maps y devuelve la
   * URL final (ya con `@lat,lng` o `!3d…!4d…`). Solo se siguen hosts de
   * acortadores conocidos de Google (nunca cualquier URL que mande el
   * admin) para no abrir un proxy/SSRF genérico.
   */
  async resolveShortLink(url: string): Promise<string | null> {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (!this.SHORT_LINK_HOSTS.includes(host)) return null;

      const res = await this.fetchWithTimeout(url, { redirect: 'follow' });
      await res.body?.cancel();
      return res.url || null;
    } catch (error) {
      this.logger.warn(
        `No se pudo resolver el link corto de Maps: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Busca una dirección/lugar y devuelve candidatos con coordenadas
   * (restringido a Colombia — el área de operación es Putumayo).
   */
  async searchAddress(query: string): Promise<AddressSearchResult[]> {
    try {
      const url =
        'https://nominatim.openstreetmap.org/search' +
        `?format=json&limit=8&countrycodes=co&q=${encodeURIComponent(query)}`;
      const res = await this.fetchWithTimeout(url, {
        headers: { 'User-Agent': this.USER_AGENT },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as Array<{
        display_name: string;
        lat: string;
        lon: string;
      }>;
      return data.map((item) => ({
        label: item.display_name,
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
      }));
    } catch (error) {
      this.logger.warn(
        `Búsqueda de dirección falló, se devuelve vacío: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /** Dirección legible para unas coordenadas (pin movido a mano en el mapa). */
  async reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<string | null> {
    try {
      const url =
        'https://nominatim.openstreetmap.org/reverse' +
        `?format=json&lat=${latitude}&lon=${longitude}`;
      const res = await this.fetchWithTimeout(url, {
        headers: { 'User-Agent': this.USER_AGENT },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as { display_name?: string };
      return data.display_name ?? null;
    } catch (error) {
      this.logger.warn(
        `Geocodificación inversa falló, se omite la dirección: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
