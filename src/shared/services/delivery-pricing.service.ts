import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Reparto de la tarifa de un domicilio entre Mándalo y el repartidor. */
export interface DeliveryFeeSplit {
  mandaloCut: number;
  riderCut: number;
}

/**
 * Motor de precios del domicilio POR DISTANCIA (§42 de NOTAS): hasta
 * `deliveryBaseKm` se cobra fijo `deliveryBaseFee`, de la cual
 * `deliveryBaseMandaloCut` es para Mándalo y el resto para el repartidor.
 * Pasado ese radio, cada km extra suma `deliveryExtraKmRate`, de lo cual
 * `deliveryExtraMandaloRate`% es para Mándalo y el resto para el repartidor.
 * El negocio NUNCA toca esta plata — se reparte 100% entre Mándalo y el
 * repartidor. Usado por: creación de pedidos (checkout), el preview en vivo
 * del checkout, y la liquidación de repartidores (que reconstruye el reparto
 * a partir del `deliveryFee` ya guardado en cada factura).
 */
@Injectable()
export class DeliveryPricingService {
  constructor(private readonly _configService: ConfigService) {}

  private get baseKm(): number {
    return this._configService.get<number>('app.deliveryBaseKm') ?? 2;
  }

  private get baseFee(): number {
    return this._configService.get<number>('app.deliveryBaseFee') ?? 6000;
  }

  private get baseMandaloCut(): number {
    return this._configService.get<number>('app.deliveryBaseMandaloCut') ?? 1000;
  }

  private get extraKmRate(): number {
    return this._configService.get<number>('app.deliveryExtraKmRate') ?? 3000;
  }

  private get extraMandaloRate(): number {
    return this._configService.get<number>('app.deliveryExtraMandaloRate') ?? 16;
  }

  private get minFee(): number {
    return this._configService.get<number>('app.deliveryMinFee') ?? 0;
  }

  /** Tarifa fija de respaldo (cuando faltan coordenadas para calcular por distancia). */
  get fallbackFee(): number {
    return this._configService.get<number>('app.deliveryFee') ?? this.baseFee;
  }

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
   * Tarifa del domicilio (lo que paga el cliente) para una distancia dada,
   * con el piso de `deliveryMinFee` del Anexo I (§59 de NOTAS) — ningún
   * servicio cuesta menos que eso, ni siquiera dentro del radio base.
   */
  feeForDistance(distanceKm: number): number {
    const raw =
      distanceKm <= this.baseKm
        ? this.baseFee
        : this.baseFee + (distanceKm - this.baseKm) * this.extraKmRate;
    return this.round2(Math.max(raw, this.minFee));
  }

  /**
   * Recargo nocturno del Anexo I (§59): entre 11:00pm y 5:30am hora de
   * Bogotá (offset fijo -5, Colombia no tiene horario de verano). 0 si no
   * aplica. Recibe `at` para poder probarlo con una hora fija en tests.
   */
  nightSurchargeAmount(at: Date = new Date()): number {
    const bogotaMinutes = this.minuteOfDayBogota(at);
    const start = 23 * 60; // 11:00pm
    const end = 5 * 60 + 30; // 5:30am
    const isNight = bogotaMinutes >= start || bogotaMinutes < end;
    if (!isNight) return 0;
    return (
      this._configService.get<number>('app.deliveryNightSurcharge') ?? 0
    );
  }

  private minuteOfDayBogota(at: Date): number {
    const BOGOTA_OFFSET_HOURS = -5;
    const utcMinutes = at.getUTCHours() * 60 + at.getUTCMinutes();
    const bogotaMinutes =
      (((utcMinutes + BOGOTA_OFFSET_HOURS * 60) % 1440) + 1440) % 1440;
    return bogotaMinutes;
  }

  /**
   * Reparto Mándalo/repartidor de una tarifa YA COBRADA (se reconstruye desde
   * el monto, no hace falta guardar la distancia): si `deliveryFee` es la
   * tarifa base o menos, todo es de Mándalo; el excedente sobre la base se
   * reparte `extraMandaloRate`% Mándalo / resto repartidor.
   */
  splitFee(deliveryFee: number): DeliveryFeeSplit {
    if (deliveryFee <= this.baseFee) {
      return {
        mandaloCut: this.round2(Math.min(this.baseMandaloCut, deliveryFee)),
        riderCut: this.round2(Math.max(deliveryFee - this.baseMandaloCut, 0)),
      };
    }
    const overage = deliveryFee - this.baseFee;
    const mandaloCut = this.round2(
      this.baseMandaloCut + (overage * this.extraMandaloRate) / 100,
    );
    return {
      mandaloCut,
      riderCut: this.round2(deliveryFee - mandaloCut),
    };
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
