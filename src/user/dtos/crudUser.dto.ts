import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';

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
