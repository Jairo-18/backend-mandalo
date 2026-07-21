import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { SettlementPeriodType } from '../../shared/constants/settlementPeriodType.enum';

export { SettlementPeriodType };

/** Listado de períodos liquidados de un repartidor (solo ADMIN). */
export class DeliverySettlementPeriodsParamsDto {
  @ApiProperty({ description: 'Repartidor a liquidar' })
  @IsUUID()
  deliveryUserId: string;

  @ApiProperty({
    enum: SettlementPeriodType,
    description: 'Agrupar por quincena, mes o año (hora Colombia)',
  })
  @IsEnum(SettlementPeriodType)
  periodType: SettlementPeriodType;
}

/** "Mis pedidos" del propio repartidor (self-scoped por JWT). */
export class MyDeliverySettlementPeriodsParamsDto {
  @ApiProperty({
    enum: SettlementPeriodType,
    description: 'Agrupar por quincena, mes o año (hora Colombia)',
  })
  @IsEnum(SettlementPeriodType)
  periodType: SettlementPeriodType;
}

/**
 * Marcar/desmarcar una quincena como PAGADA al repartidor. El backend
 * recalcula los montos y los guarda como snapshot.
 */
export class MarkDeliverySettlementDto {
  @ApiProperty({ description: 'Repartidor a liquidar' })
  @IsUUID()
  deliveryUserId: string;

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

  @ApiProperty({ description: 'true = pagado, false = deshacer el pago' })
  @IsBoolean()
  isPaid: boolean;

  @ApiPropertyOptional({
    description: 'Nota del pago ("pagado por Nequi", "quedó debiendo 10k")',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
