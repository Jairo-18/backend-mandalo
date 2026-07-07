import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

/** Parámetros de la consulta paginada de usuarios (search + filtros). */
export class PaginatedUsersParamsDto extends ParamsPaginationDto {
  @ApiPropertyOptional({ description: 'Filtrar por email (parcial)' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'UUID del tipo de rol' })
  @IsOptional()
  @IsUUID()
  roleTypeId?: string;

  @ApiPropertyOptional({
    description: 'Code del tipo de rol (USER, DELI, NEGO, ADMIN)',
    enum: RoleTypeCode,
  })
  @IsOptional()
  @IsEnum(RoleTypeCode)
  roleTypeCode?: RoleTypeCode;

  @ApiPropertyOptional({
    description:
      'Varios codes de rol separados por coma (ej. USER,NEGO,ADMIN)',
    example: 'USER,NEGO,ADMIN',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @IsEnum(RoleTypeCode, { each: true })
  roleTypeCodes?: RoleTypeCode[];

  @ApiPropertyOptional({ description: 'Filtrar por nombre (parcial)' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ description: 'Filtrar por celular (parcial)' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Filtrar por username (parcial)' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por número de identificación (parcial)',
  })
  @IsOptional()
  @IsString()
  identificationNumber?: string;

  @ApiPropertyOptional({ description: 'ID del municipio', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  municipalityId?: number;

  @ApiPropertyOptional({ description: 'ID del departamento', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isBanned?: boolean;
}
