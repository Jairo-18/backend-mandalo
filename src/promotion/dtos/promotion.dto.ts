import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';
import { MIN_PRODUCT_PRICE } from '../../product/dtos/product.dto';

/** Duraciones que puede elegir el negocio (vigencia desde hoy, máx. 30 días). */
export const PROMOTION_DURATIONS = [1, 3, 7, 15, 30];
/** Máximo de promociones activas (vigentes y no pausadas) por negocio. */
export const MAX_ACTIVE_PROMOTIONS = 5;

const trimOrUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class PromotionItemDto {
  @ApiProperty({ example: 12 })
  @Type(() => Number)
  @IsInt()
  productId: number;

  @ApiProperty({ example: 2, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity: number;
}

export class CreatePromotionDto {
  @ApiProperty({ example: '2x1 en hamburguesas', maxLength: 80 })
  @IsString()
  @Transform(trimOrUndefined)
  @MinLength(3, { message: 'El título debe tener al menos 3 caracteres.' })
  @MaxLength(80, { message: 'El título puede tener máximo 80 caracteres.' })
  title: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @Transform(trimOrUndefined)
  @MaxLength(200, { message: 'El mensaje puede tener máximo 200 caracteres.' })
  message?: string;

  @ApiProperty({ description: 'Precio de la promo completa', example: 20000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_PRODUCT_PRICE, {
    message: 'El precio de la promoción debe ser de mínimo $1.000.',
  })
  price: number;

  @ApiProperty({
    description: 'Días de vigencia desde hoy',
    enum: PROMOTION_DURATIONS,
    example: 7,
  })
  @Type(() => Number)
  @IsIn(PROMOTION_DURATIONS, {
    message: 'Elige una vigencia de 1, 3, 7, 15 o 30 días.',
  })
  durationDays: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [PromotionItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Elige al menos un producto de la promoción.' })
  @ArrayMaxSize(10, { message: 'Una promoción puede tener máximo 10 productos.' })
  @ValidateNested({ each: true })
  @Type(() => PromotionItemDto)
  items: PromotionItemDto[];
}

/** Editar: todo opcional; `durationDays` RENUEVA la vigencia desde hoy. */
export class UpdatePromotionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(trimOrUndefined)
  @MinLength(3, { message: 'El título debe tener al menos 3 caracteres.' })
  @MaxLength(80, { message: 'El título puede tener máximo 80 caracteres.' })
  title?: string;

  /** null = quitar el mensaje. */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(200, { message: 'El mensaje puede tener máximo 200 caracteres.' })
  message?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_PRODUCT_PRICE, {
    message: 'El precio de la promoción debe ser de mínimo $1.000.',
  })
  price?: number;

  @ApiPropertyOptional({ enum: PROMOTION_DURATIONS })
  @IsOptional()
  @Type(() => Number)
  @IsIn(PROMOTION_DURATIONS, {
    message: 'Elige una vigencia de 1, 3, 7, 15 o 30 días.',
  })
  durationDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [PromotionItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Elige al menos un producto de la promoción.' })
  @ArrayMaxSize(10, { message: 'Una promoción puede tener máximo 10 productos.' })
  @ValidateNested({ each: true })
  @Type(() => PromotionItemDto)
  items?: PromotionItemDto[];
}

/** Carrusel del home: promos de negocios cerca de estas coordenadas. */
export class PromotionFeedParamsDto extends ParamsPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;
}

export class SetPromotionHiddenDto {
  @ApiProperty({ description: 'true = ocultar (moderación del admin)' })
  @IsBoolean()
  hidden: boolean;
}
