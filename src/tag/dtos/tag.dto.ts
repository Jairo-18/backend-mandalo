import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';

export class CreateTagDto {
  @ApiProperty({ example: 'DOMICILIO_24H', maxLength: 30 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code: string;

  @ApiProperty({ example: 'Domicilio 24 horas', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'time-outline', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string;
}

export class UpdateTagDto extends PartialType(CreateTagDto) {}

/** Parámetros de la consulta paginada (search sobre code/name). */
export class PaginatedTagsParamsDto extends ParamsPaginationDto {}
