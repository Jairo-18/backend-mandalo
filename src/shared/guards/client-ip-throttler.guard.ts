import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

/**
 * El throttle era 100% por IP. Detrás de Cloudflare (proxied) `req.ip` es la
 * IP del edge de CF, compartida por muchos usuarios reales de la misma zona
 * → los límites se agotaban entre todos (hallazgo de la prueba de carga,
 * NOTAS §38): `CF-Connecting-IP` (la IP real que inyecta Cloudflare) arregló
 * ESE problema puntual, pero el contador seguía siendo por IP — y en redes
 * móviles colombianas es común el CGNAT de los operadores, donde VARIOS
 * usuarios reales y distintos comparten la misma IP pública igualmente.
 *
 * Ahora: si la petición trae un JWT válido, el contador es POR USUARIO
 * (estable sin importar cuántos compartan IP/operador). Sin sesión (login,
 * registro, explorar de invitado) sigue siendo por IP a propósito — ahí SÍ
 * interesa limitar por origen de red (fuerza bruta de login, abuso anónimo).
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly _jwtService: JwtService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = this.extractUserId(req);
    if (userId) return `user:${userId}`;

    const cfIp = req.headers?.['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.length > 0) return `ip:${cfIp}`;
    return `ip:${req.ip}`;
  }

  /** `sub` del JWT si viene uno válido y sin vencer; null si no (anónimo). */
  private extractUserId(req: Record<string, any>): string | null {
    const auth = req.headers?.authorization;
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
    const token = auth.slice('Bearer '.length);
    try {
      const payload = this._jwtService.verify(token);
      return typeof payload?.sub === 'string' ? payload.sub : null;
    } catch {
      // Vencido/inválido: se trata como anónimo (cae a IP), no como error.
      return null;
    }
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException(
      'Has hecho demasiadas peticiones en poco tiempo. Espera un momento e inténtalo de nuevo.',
    );
  }
}
