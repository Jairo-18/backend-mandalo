import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsNumber, IsOptional } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';

/**
 * Coordenadas del cliente ("enviar a"): si vienen, el listado se limita a
 * negocios dentro del radio de cercanía (APP_NEARBY_RADIUS_KM).
 */
export class NearParamsDto extends ParamsPaginationDto {
  @ApiPropertyOptional({ description: 'Latitud del cliente', example: 1.0285 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitud del cliente', example: -76.6226 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;
}

/** Listado de negocios para el cliente (search sobre nombre comercial/razón social). */
export class PaginatedExploreOrganizationalsParamsDto extends NearParamsDto {
  @ApiPropertyOptional({
    description: 'Ids de etiquetas separados por coma (ej. 1,3)',
    example: '1,3',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').filter(Boolean).map(Number)
      : value,
  )
  @IsArray()
  @IsInt({ each: true })
  tagIds?: number[];
}

/** Listado de productos de un negocio para el cliente (search sobre nombre). */
export class PaginatedExploreProductsParamsDto extends NearParamsDto {
  @ApiPropertyOptional({ description: 'Filtrar por categoría' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryTypeId?: number;
}
