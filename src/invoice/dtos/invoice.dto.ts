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
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';
import { StateTypeCode } from '../../shared/constants/stateTypeCode.enum';

/**
 * Reporte de entrega fallida (multipart, foto obligatoria — reunión
 * 2026-08-04): el front arma `failureReason` combinando el motivo elegido +
 * observaciones libres.
 */
export class ReportDeliveryFailureDto {
  @ApiProperty({
    example: 'No estaba en la dirección — Observaciones: nadie respondió.',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty({ message: 'Indica por qué no se pudo entregar el pedido' })
  @MaxLength(500)
  failureReason: string;
}

/** Motivo por el que el negocio rechaza el comprobante de pago del cliente. */
export class RejectPaymentDto {
  @ApiProperty({
    example: 'La foto no corresponde al comprobante del pago.',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty({ message: 'Indica el motivo del rechazo' })
  @MaxLength(255)
  reason: string;
}

/**
 * Un renglón del pedido: un PRODUCTO o una PROMOCIÓN del negocio (exactamente
 * uno de los dos) y cuántos. El precio lo pone el backend.
 */
export class CreateInvoiceItemDto {
  @ApiPropertyOptional({ description: 'ID del producto del negocio', example: 12 })
  @ValidateIf((item: CreateInvoiceItemDto) => item.promotionId == null)
  @Type(() => Number)
  @IsInt({ message: 'Cada ítem del pedido debe ser un producto o una promoción.' })
  productId?: number;

  @ApiPropertyOptional({ description: 'ID de una promoción vigente del negocio', example: 3 })
  @ValidateIf((item: CreateInvoiceItemDto) => item.productId == null)
  @Type(() => Number)
  @IsInt({ message: 'Cada ítem del pedido debe ser un producto o una promoción.' })
  promotionId?: number;

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

  @ApiPropertyOptional({
    description:
      'UUID generado por el front, uno por intento de checkout (se ' +
      'mantiene igual si el cliente reintenta tras un fallo ambiguo de red). ' +
      'Si ya existe un pedido con esta clave para el mismo usuario, se ' +
      'devuelve ESE pedido en vez de crear uno nuevo.',
    example: 'f0b3c9d2-6e2a-4b7a-9f9e-9d6b8a2a3c11',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotencyKey?: string;
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

  @ApiPropertyOptional({
    description:
      'Motivo por el que no se pudo entregar (obligatorio al pasar a FALL, ' +
      'lo arma el front con el motivo elegido + observaciones libres)',
    example: 'No estaba — Observaciones: nadie respondió tras varios intentos.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  failureReason?: string;
}

/**
 * Preview en vivo de la tarifa del domicilio (checkout, antes de crear el
 * pedido): negocio + coordenadas de la dirección elegida. Sin coordenadas
 * (o sin las del negocio) cae a la tarifa fija de respaldo.
 */
export class DeliveryFeePreviewParamsDto {
  @ApiProperty({ description: 'Negocio del pedido', example: 3 })
  @Type(() => Number)
  @IsInt()
  organizationalId: number;

  @ApiPropertyOptional({ description: 'Latitud de la dirección de entrega' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitud de la dirección de entrega' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    description:
      'Subtotal del carrito (sin domicilio) — para calcular la tarifa de servicio en el preview.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal?: number;
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

  @ApiPropertyOptional({
    description: 'Solo pedidos a negocios (ORDER) o solo mandados (ERRAND)',
    enum: ['ORDER', 'ERRAND'],
  })
  @IsOptional()
  @IsEnum({ ORDER: 'ORDER', ERRAND: 'ERRAND' })
  type?: 'ORDER' | 'ERRAND';

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

  // ---- Filtros exclusivos del ADMIN (los demás roles ya van scoped) ----
  @ApiPropertyOptional({
    description: 'Solo ADMIN: pedidos de un negocio puntual',
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  organizationalId?: number;

  @ApiPropertyOptional({
    description:
      'Solo ADMIN: entregados desde esta fecha local (YYYY-MM-DD, inclusive)',
    example: '2026-07-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'deliveredFrom debe tener formato YYYY-MM-DD',
  })
  deliveredFrom?: string;

  @ApiPropertyOptional({
    description:
      'Solo ADMIN: entregados hasta esta fecha local (YYYY-MM-DD, inclusive)',
    example: '2026-07-31',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'deliveredTo debe tener formato YYYY-MM-DD',
  })
  deliveredTo?: string;
}

// ---------- mandados ----------

/** Tope de la compra que el repartidor adelanta de su bolsillo en un mandado. */
export const ERRAND_MAX_PURCHASE = 150000;
/** Métodos de pago de un mandado: se le paga directo al repartidor. */
export const ERRAND_PAID_TYPES = ['EFEC', 'NEQUI'] as const;

/** Punto de recogida opcional + dirección de entrega (para cotizar el mínimo). */
export class ErrandFeeParamsDto {
  @ApiProperty({ description: 'Dirección de entrega del cliente (userAddress)', example: 7 })
  @Type(() => Number)
  @IsInt()
  addressId: number;

  @ApiPropertyOptional({ example: 0.5165 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pickupLatitude?: number;

  @ApiPropertyOptional({ example: -76.4963 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pickupLongitude?: number;
}

/**
 * "Pedir un mandado": qué hacer, dónde recoger (opcional) y entregar, cuánto
 * ofrece el cliente (mínimo: la tarifa por distancia de la app) y, si hay que
 * comprar algo, cuánto cuesta aprox. (lo adelanta el repartidor).
 */
export class CreateErrandDto extends ErrandFeeParamsDto {
  @ApiPropertyOptional({ example: 'Droguería La Colonial, Cl. 10 #5-20' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  pickupAddress?: string;

  @ApiProperty({ example: 'Comprar un acetaminofén de 500 mg', maxLength: 500 })
  @IsString()
  @IsNotEmpty({ message: 'Cuéntale al domiciliario qué debe hacer.' })
  @MaxLength(500)
  description: string;

  @ApiPropertyOptional({ example: 'Preguntar por Don José en la caja', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Valor aprox. de la compra que adelanta el repartidor (0 = sin compra)',
    example: 12000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(ERRAND_MAX_PURCHASE, {
    message: `La compra no puede pasar de $${ERRAND_MAX_PURCHASE.toLocaleString('es-CO')}.`,
  })
  purchaseAmount?: number;

  @ApiProperty({ description: 'Cuánto ofrece el cliente por el mandado', example: 8000 })
  @Type(() => Number)
  @IsNumber({}, { message: 'Ingresa cuánto ofreces por el mandado.' })
  @Min(0)
  offeredFee: number;

  @ApiProperty({ enum: ERRAND_PAID_TYPES, example: 'EFEC' })
  @IsString()
  @IsEnum(
    Object.fromEntries(ERRAND_PAID_TYPES.map((c) => [c, c])),
    { message: 'El mandado se paga en efectivo o por Nequi.' },
  )
  paidTypeCode: (typeof ERRAND_PAID_TYPES)[number];

  @ApiPropertyOptional({ example: 'f0b3c9d2-6e2a-4b7a-9f9e-9d6b8a2a3c11' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotencyKey?: string;
}
