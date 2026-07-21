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

  /** Tarifa del domicilio (lo que paga el cliente) para una distancia dada. */
  feeForDistance(distanceKm: number): number {
    if (distanceKm <= this.baseKm) return this.round2(this.baseFee);
    const extraKm = distanceKm - this.baseKm;
    return this.round2(this.baseFee + extraKm * this.extraKmRate);
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
