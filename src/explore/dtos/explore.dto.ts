import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';

/** Listado de negocios para el cliente (search sobre nombre comercial/razón social). */
export class PaginatedExploreOrganizationalsParamsDto extends ParamsPaginationDto {
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
export class PaginatedExploreProductsParamsDto extends ParamsPaginationDto {
  @ApiPropertyOptional({ description: 'Filtrar por categoría' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryTypeId?: number;
}
