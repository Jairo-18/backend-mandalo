import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';

/**
 * El producto SIEMPRE queda asociado al negocio del usuario autenticado
 * (organizational con legalPersonId = user.id); por eso el DTO no acepta
 * `organizationalId` ni `images` (las fotos van por el endpoint de subida).
 */
export class CreateProductDto {
  @ApiProperty({ example: 'Hamburguesa doble', maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({
    description: 'SKU/código interno del negocio',
    example: 'HAMB-002',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ example: 'Doble carne, queso y tocineta.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Categoría del producto', example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryTypeId?: number;

  @ApiProperty({ description: 'Precio de venta', example: 25000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceSale: number;

  @ApiPropertyOptional({
    description: 'Porcentaje de descuento (0–100)',
    example: 10,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discount?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

/** Parámetros del listado paginado (search sobre name/code, del negocio propio). */
export class PaginatedProductsParamsDto extends ParamsPaginationDto {
  @ApiPropertyOptional({ description: 'Filtrar por categoría' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryTypeId?: number;
}

/** Quitar una foto del producto (URL tal como está guardada en `images`). */
export class RemoveProductImageDto {
  @ApiProperty({
    description: 'URL de la imagen a quitar del producto',
    example: 'https://apimandalo.ecohotelsamawe.com/uploads/products/uuid.webp',
  })
  @IsString()
  @IsNotEmpty()
  url: string;
}
