import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Agrupación de la liquidación: semana ISO (lunes), mes o año calendario. */
export enum SettlementPeriodType {
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

/** Listado de períodos facturados de un negocio (solo ADMIN). */
export class SettlementPeriodsParamsDto {
  @ApiProperty({ description: 'Negocio a liquidar', example: 3 })
  @Type(() => Number)
  @IsInt()
  organizationalId: number;

  @ApiProperty({
    enum: SettlementPeriodType,
    description: 'Agrupar por semana, mes o año (hora Colombia)',
  })
  @IsEnum(SettlementPeriodType)
  periodType: SettlementPeriodType;
}

/**
 * Marcar/desmarcar un período como COBRADO. El backend recalcula los montos
 * del período y los guarda como snapshot — el cliente nunca manda plata.
 */
export class MarkSettlementDto {
  @ApiProperty({ description: 'Negocio a liquidar', example: 3 })
  @Type(() => Number)
  @IsInt()
  organizationalId: number;

  @ApiProperty({ enum: SettlementPeriodType })
  @IsEnum(SettlementPeriodType)
  periodType: SettlementPeriodType;

  @ApiProperty({
    description: 'Inicio del período (YYYY-MM-DD, el que devuelve /periods)',
    example: '2026-07-01',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'periodStart debe tener formato YYYY-MM-DD',
  })
  periodStart: string;

  @ApiProperty({ description: 'true = cobrado, false = deshacer el cobro' })
  @IsBoolean()
  isPaid: boolean;

  @ApiPropertyOptional({
    description: 'Nota del cobro ("pagó por Nequi", "quedó debiendo 10k")',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
