import { Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';

/**
 * Detrás de Cloudflare (proxied) `req.ip` es la IP del edge de CF, compartida
 * por muchos usuarios reales de la misma zona → los límites "por IP" se
 * agotarían entre todos (hallazgo de la prueba de carga, NOTAS §38).
 * `CF-Connecting-IP` trae la IP real del cliente; sin ese header (dev local,
 * acceso directo) se cae al `req.ip` de siempre.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const cfIp = req.headers?.['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.length > 0) return cfIp;
    return req.ip;
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException(
      'Has hecho demasiadas peticiones en poco tiempo. Espera un momento e inténtalo de nuevo.',
    );
  }
}
