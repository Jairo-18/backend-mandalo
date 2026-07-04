import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';

export class CreateCategoryTypeDto {
  @ApiProperty({ example: 'COMIDA_RAPIDA', maxLength: 30 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code: string;

  @ApiProperty({ example: 'Comidas rápidas', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'fast-food-outline', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string;
}

export class UpdateCategoryTypeDto extends PartialType(CreateCategoryTypeDto) {}

/** Parámetros de la consulta paginada (search sobre code/name). */
export class PaginatedCategoryTypesParamsDto extends ParamsPaginationDto {}
