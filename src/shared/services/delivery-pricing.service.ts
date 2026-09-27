import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { MunicipalityPricingRepository } from '../repositories/municipalityPricing.repository';
import { MunicipalityPricing } from '../entities/municipalityPricing.entity';

/** Reparto de la tarifa de un domicilio entre Mándalo y el repartidor. */
export interface DeliveryFeeSplit {
  mandaloCut: number;
  riderCut: number;
}

/** Los valores tarifarios de una fila de `municipalityPricing` (sin metadatos). */
export type PricingValues = Pick<
  MunicipalityPricing,
  | 'baseKm'
  | 'baseFee'
  | 'baseMandaloCut'
  | 'extraKmRate'
  | 'extraMandaloRate'
  | 'nightSurcharge'
  | 'nightStartTime'
  | 'nightEndTime'
  | 'weatherSurcharge'
  | 'weatherHeavyRainMm'
  | 'demandSurcharge'
  | 'demandThreshold'
  | 'retryFee'
  | 'waitMinutes'
  | 'serviceFeePercent'
  | 'serviceFeeCap'
>;

/** Tarifa efectiva de un municipio + de dónde salió. */
export type ResolvedPricing = PricingValues & {
  /** Municipio pedido (null = sin municipio → tarifa general). */
  municipalityId: number | null;
  /** true si el municipio tiene tarifa propia; false si hereda la general. */
  isCustom: boolean;
};

export const PRICING_FIELDS: (keyof PricingValues)[] = [
  'baseKm',
  'baseFee',
  'baseMandaloCut',
  'extraKmRate',
  'extraMandaloRate',
  'nightSurcharge',
  'nightStartTime',
  'nightEndTime',
  'weatherSurcharge',
  'weatherHeavyRainMm',
  'demandSurcharge',
  'demandThreshold',
  'retryFee',
  'waitMinutes',
  'serviceFeePercent',
  'serviceFeeCap',
];

/**
 * Último recurso si la fila de tarifa general no existiera (migración no
 * corrida, alguien la borró a mano): los valores del Anexo I de los TYC,
 * los mismos que siembra `AddMunicipalityPricing`. Un checkout nunca debe
 * romperse por falta de configuración.
 */
export const FALLBACK_PRICING: PricingValues = {
  baseKm: 4,
  baseFee: 6000,
  baseMandaloCut: 1000,
  extraKmRate: 3000,
  extraMandaloRate: 16,
  nightSurcharge: 4500,
  nightStartTime: '23:00',
  nightEndTime: '05:30',
  weatherSurcharge: 2500,
  weatherHeavyRainMm: 7.5,
  demandSurcharge: 2500,
  demandThreshold: 30,
  retryFee: 6000,
  waitMinutes: 5,
  serviceFeePercent: 5,
  serviceFeeCap: 5000,
};

/** Toda la tabla cabe en una sola key (1 general + ≤ un puñado de municipios). */
const CACHE_KEY = 'municipality-pricing:all';
const CACHE_TTL_MS = 5 * 60_000;

/** Extrae solo los campos tarifarios de una fila (o de cualquier objeto). */
export function pickPricing(source: PricingValues): PricingValues {
  const out = {} as Record<string, unknown>;
  for (const field of PRICING_FIELDS) out[field] = source[field];
  return out as PricingValues;
}

/**
 * Motor de precios del domicilio POR DISTANCIA y POR MUNICIPIO (§42 de
 * NOTAS; tarifas por municipio desde 2026-09): hasta `baseKm` se cobra fijo
 * `baseFee` (de eso `baseMandaloCut` es de Mándalo y el resto del
 * repartidor); pasado ese radio, cada km extra suma `extraKmRate`, del cual
 * `extraMandaloRate`% es de Mándalo. El negocio NUNCA toca esta plata.
 *
 * La tarifa que aplica es la del municipio del NEGOCIO (`forMunicipality`);
 * los cálculos son funciones puras que reciben esa tarifa, así cada caller
 * resuelve la tarifa UNA vez por pedido y todo sale consistente.
 */
@Injectable()
export class DeliveryPricingService {
  private readonly logger = new Logger(DeliveryPricingService.name);

  constructor(
    private readonly _pricingRepository: MunicipalityPricingRepository,
    @Inject(CACHE_MANAGER) private readonly _cacheManager: Cache,
  ) {}

  // ---------- resolución de la tarifa ----------

  /** Todas las filas (general + propias), cacheadas. */
  private async loadAll(): Promise<PricingValuesRow[]> {
    const cached = await this._cacheManager.get<PricingValuesRow[]>(CACHE_KEY);
    if (cached) return cached;
    const rows = await this._pricingRepository.find();
    const plain: PricingValuesRow[] = rows.map((row) => ({
      municipalityId: row.municipalityId ?? null,
      ...pickPricing(row),
    }));
    await this._cacheManager.set(CACHE_KEY, plain, CACHE_TTL_MS);
    return plain;
  }

  /** Borra la caché — llamar SIEMPRE después de escribir en la tabla. */
  async invalidate(): Promise<void> {
    await this._cacheManager.del(CACHE_KEY);
  }

  /** La tarifa general (fila con `municipalityId` NULL). */
  async general(): Promise<PricingValues> {
    const rows = await this.loadAll();
    const general = rows.find((row) => row.municipalityId == null);
    if (!general) {
      this.logger.error(
        'No existe la tarifa general en municipalityPricing — se usan los valores del Anexo I.',
      );
      return { ...FALLBACK_PRICING };
    }
    return pickPricing(general);
  }

  /**
   * Tarifa efectiva para un municipio: la propia si la tiene, si no la
   * general. `null`/`undefined` (negocio sin municipio) → general.
   */
  async forMunicipality(
    municipalityId?: number | null,
  ): Promise<ResolvedPricing> {
    const id = municipalityId ?? null;
    if (id != null) {
      const rows = await this.loadAll();
      const own = rows.find((row) => row.municipalityId === id);
      if (own)
        return { ...pickPricing(own), municipalityId: id, isCustom: true };
    }
    return { ...(await this.general()), municipalityId: id, isCustom: false };
  }

  // ---------- cálculos (puros, sobre una tarifa ya resuelta) ----------

  /** Distancia en km entre dos coordenadas (fórmula de haversine). */
  haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Tarifa del domicilio (lo que paga el cliente) para una distancia dada.
   * La tarifa base YA es el mínimo del servicio (reunión con el cliente
   * 2026-08-04), por eso no hay un piso aparte.
   */
  feeForDistance(pricing: PricingValues, distanceKm: number): number {
    const raw =
      distanceKm <= pricing.baseKm
        ? pricing.baseFee
        : pricing.baseFee + (distanceKm - pricing.baseKm) * pricing.extraKmRate;
    return this.round2(raw);
  }

  /**
   * Tarifa cuando faltan coordenadas (negocio o dirección sin lat/lng) y no
   * se puede medir la distancia: la tarifa base del municipio (el mínimo).
   */
  fallbackFee(pricing: PricingValues): number {
    return this.round2(pricing.baseFee);
  }

  /**
   * Minutos estimados de entrega para una distancia dada: línea recta ×
   * factor de ruta real (1.3) a ~25 km/h de moto urbana + 5 min de margen,
   * acotado a 10–90 min. No depende de la tarifa.
   */
  estimateMinutesForDistance(distanceKm: number): number {
    const minutes = Math.round(((distanceKm * 1.3) / 25) * 60) + 5;
    return Math.min(Math.max(minutes, 10), 90);
  }

  /**
   * ¿`at` cae en la franja nocturna del municipio? Hora de Bogotá (offset
   * fijo -5, Colombia no tiene horario de verano). La franja puede cruzar
   * medianoche (23:00 → 05:30) o no (20:00 → 23:00).
   */
  isNight(pricing: PricingValues, at: Date = new Date()): boolean {
    const start = this.parseHm(pricing.nightStartTime);
    const end = this.parseHm(pricing.nightEndTime);
    if (start == null || end == null || start === end) return false;
    const now = this.minuteOfDayBogota(at);
    return start < end ? now >= start && now < end : now >= start || now < end;
  }

  /** Recargo nocturno del Anexo I (0 si no aplica). */
  nightSurchargeAmount(pricing: PricingValues, at: Date = new Date()): number {
    return this.isNight(pricing, at) ? pricing.nightSurcharge : 0;
  }

  /**
   * Tarifa de servicio: % del subtotal (SIN domicilio), 100% de Mándalo,
   * con tope `serviceFeeCap` (0 = sin tope).
   */
  serviceFee(pricing: PricingValues, subtotal: number): number {
    const fee = this.round2((subtotal * pricing.serviceFeePercent) / 100);
    return pricing.serviceFeeCap > 0
      ? Math.min(fee, pricing.serviceFeeCap)
      : fee;
  }

  /**
   * Reparto Mándalo/repartidor de `deliveryFee` con la tarifa con la que se
   * cobró: si es la tarifa base o menos, `baseMandaloCut` es de Mándalo y el
   * resto del repartidor; el excedente sobre la base se reparte
   * `extraMandaloRate`% Mándalo / resto repartidor. Se llama UNA vez al crear
   * el pedido y el resultado se congela en la factura.
   */
  splitFee(pricing: PricingValues, deliveryFee: number): DeliveryFeeSplit {
    if (deliveryFee <= pricing.baseFee) {
      return {
        mandaloCut: this.round2(Math.min(pricing.baseMandaloCut, deliveryFee)),
        riderCut: this.round2(
          Math.max(deliveryFee - pricing.baseMandaloCut, 0),
        ),
      };
    }
    const overage = deliveryFee - pricing.baseFee;
    const mandaloCut = this.round2(
      pricing.baseMandaloCut + (overage * pricing.extraMandaloRate) / 100,
    );
    return {
      mandaloCut,
      riderCut: this.round2(deliveryFee - mandaloCut),
    };
  }

  // ---------- helpers ----------

  private parseHm(value: string): number | null {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? '');
    if (!match) return null;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }

  private minuteOfDayBogota(at: Date): number {
    const BOGOTA_OFFSET_HOURS = -5;
    const utcMinutes = at.getUTCHours() * 60 + at.getUTCMinutes();
    return (((utcMinutes + BOGOTA_OFFSET_HOURS * 60) % 1440) + 1440) % 1440;
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}

type PricingValuesRow = PricingValues & { municipalityId: number | null };
