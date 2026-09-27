import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

const HM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const HM_MESSAGE = 'Debe ser una hora en formato HH:MM (24 h), ej: 23:00';
const MONEY_MAX = 1_000_000;
const MONEY = { maxDecimalPlaces: 2 };

/**
 * Edición de una tarifa (general o de un municipio). Todos los campos son
 * opcionales: lo que no venga se conserva. Las reglas entre campos
 * (p. ej. la parte de Mándalo no puede superar la tarifa base) se validan
 * en el service sobre el resultado final.
 */
export class UpdateMunicipalityPricingDto {
  @ApiPropertyOptional({
    description: 'Radio (km) cubierto por la tarifa base',
    example: 4,
  })
  @IsOptional()
  @IsNumber(MONEY, { message: 'El radio base debe ser un número' })
  @Min(0.5, { message: 'El radio base debe ser de al menos 0,5 km' })
  @Max(50, { message: 'El radio base no puede superar 50 km' })
  baseKm?: number;

  @ApiPropertyOptional({ description: 'Tarifa base (COP)', example: 6000 })
  @IsOptional()
  @IsNumber(MONEY, { message: 'La tarifa base debe ser un número' })
  @Min(1, { message: 'La tarifa base debe ser mayor a 0' })
  @Max(MONEY_MAX)
  baseFee?: number;

  @ApiPropertyOptional({
    description: 'Parte de la tarifa base para Mándalo (COP)',
    example: 1000,
  })
  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(MONEY_MAX)
  baseMandaloCut?: number;

  @ApiPropertyOptional({
    description: 'Valor por km adicional (COP)',
    example: 3000,
  })
  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(MONEY_MAX)
  extraKmRate?: number;

  @ApiPropertyOptional({
    description: '% del excedente por km para Mándalo',
    example: 16,
  })
  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(100)
  extraMandaloRate?: number;

  @ApiPropertyOptional({ description: 'Recargo nocturno (COP)', example: 4500 })
  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(MONEY_MAX)
  nightSurcharge?: number;

  @ApiPropertyOptional({
    description: 'Inicio de la franja nocturna (HH:MM)',
    example: '23:00',
  })
  @IsOptional()
  @Matches(HM_REGEX, { message: HM_MESSAGE })
  nightStartTime?: string;

  @ApiPropertyOptional({
    description: 'Fin de la franja nocturna (HH:MM)',
    example: '05:30',
  })
  @IsOptional()
  @Matches(HM_REGEX, { message: HM_MESSAGE })
  nightEndTime?: string;

  @ApiPropertyOptional({
    description: 'Recargo por lluvia fuerte (COP)',
    example: 2500,
  })
  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(MONEY_MAX)
  weatherSurcharge?: number;

  @ApiPropertyOptional({
    description: 'mm de lluvia/hora desde los que aplica el recargo',
    example: 7.5,
  })
  @IsOptional()
  @IsNumber(MONEY)
  @Min(0.1, { message: 'El umbral de lluvia debe ser mayor a 0' })
  @Max(200)
  weatherHeavyRainMm?: number;

  @ApiPropertyOptional({
    description: 'Recargo por alta demanda (COP)',
    example: 2500,
  })
  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(MONEY_MAX)
  demandSurcharge?: number;

  @ApiPropertyOptional({
    description:
      'Pedidos listos sin repartidor en el municipio que activan el recargo (0 = desactivado)',
    example: 30,
  })
  @IsOptional()
  @IsInt({ message: 'El umbral de demanda debe ser un número entero' })
  @Min(0)
  @Max(1000)
  demandThreshold?: number;

  @ApiPropertyOptional({
    description: 'Cargo del segundo intento de entrega (COP)',
    example: 6000,
  })
  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(MONEY_MAX)
  retryFee?: number;

  @ApiPropertyOptional({
    description: 'Minutos de espera en el sitio',
    example: 5,
  })
  @IsOptional()
  @IsInt({ message: 'Los minutos de espera deben ser un número entero' })
  @Min(1, { message: 'La espera debe ser de al menos 1 minuto' })
  @Max(60, { message: 'La espera no puede superar 60 minutos' })
  waitMinutes?: number;

  @ApiPropertyOptional({
    description: '% del subtotal cobrado como tarifa de servicio',
    example: 5,
  })
  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(100)
  serviceFeePercent?: number;

  @ApiPropertyOptional({
    description: 'Tope de la tarifa de servicio (COP, 0 = sin tope)',
    example: 5000,
  })
  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(MONEY_MAX)
  serviceFeeCap?: number;
}
