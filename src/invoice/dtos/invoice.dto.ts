import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';
import { StateTypeCode } from '../../shared/constants/stateTypeCode.enum';

/** Un renglón del pedido: qué producto y cuántos. El precio lo pone el backend. */
export class CreateInvoiceItemDto {
  @ApiProperty({ description: 'ID del producto del negocio', example: 12 })
  @Type(() => Number)
  @IsInt()
  productId: number;

  @ApiProperty({ description: 'Cantidad', example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

/**
 * El cliente (rol USER) crea el pedido: elige negocio, una de SUS direcciones
 * (se copia como snapshot), método de pago (contra-entrega) y los productos.
 * El backend valida que todo pertenezca al negocio y calcula los totales —
 * el cliente nunca manda precios.
 */
export class CreateInvoiceDto {
  @ApiProperty({ description: 'Negocio al que se le pide', example: 3 })
  @Type(() => Number)
  @IsInt()
  organizationalId: number;

  @ApiProperty({
    description: 'ID de una dirección de entrega del usuario (userAddress)',
    example: 7,
  })
  @Type(() => Number)
  @IsInt()
  addressId: number;

  @ApiProperty({
    description: 'Código del método de pago (paidType): EFEC, TRAN, NEQUI, DAVI',
    example: 'EFEC',
  })
  @IsString()
  @IsNotEmpty()
  paidTypeCode: string;

  @ApiProperty({ type: [CreateInvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];

  @ApiPropertyOptional({
    description: 'Nota del cliente al negocio',
    example: 'Sin cebolla, timbre dañado — llamar.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** Cambio de estado del pedido (aceptar, preparar, en ruta, entregar, cancelar). */
export class UpdateInvoiceStateDto {
  @ApiProperty({ enum: StateTypeCode, description: 'Estado destino' })
  @IsEnum(StateTypeCode)
  stateCode: StateTypeCode;

  @ApiPropertyOptional({
    description: 'Motivo (solo al cancelar)',
    example: 'El negocio no tiene el producto.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cancellationReason?: string;

  @ApiPropertyOptional({
    description:
      'Minutos de preparación que promete el negocio (obligatorio al ACEPTAR)',
    example: 20,
    minimum: 5,
    maximum: 180,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(180)
  prepEstimatedMinutes?: number;

  @ApiPropertyOptional({
    description:
      'Código de verificación físico: al DESPACHAR el negocio digita el ' +
      'código de recogida que le dicta el repartidor; al ENTREGAR el ' +
      'repartidor digita el código de entrega que le dicta el cliente.',
    example: '4831',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  verificationCode?: string;
}

/** Parámetros del listado paginado; filtro opcional por estados (coma-separados). */
export class PaginatedInvoicesParamsDto extends ParamsPaginationDto {
  @ApiPropertyOptional({
    description: 'Filtrar por estados (códigos separados por coma), ej. PEND,ACEP',
    example: 'PEND,ACEP',
  })
  @IsOptional()
  @IsString()
  stateCodes?: string;

  // Coordenadas del repartidor (solo /invoice/available): limita a pedidos
  // cuyo negocio esté dentro del radio APP_NEARBY_RADIUS_KM y ordena por
  // cercanía al punto de recogida.
  @ApiPropertyOptional({ description: 'Latitud del repartidor', example: 1.0285 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitud del repartidor', example: -76.6226 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;
}
