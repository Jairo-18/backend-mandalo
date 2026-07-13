import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';

export class CreateOrganizationalDto {
  @ApiProperty({ example: 'Inversiones El Sabor S.A.S.', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  legalName: string;

  @ApiPropertyOptional({ example: 'El Sabor Parrilla', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  tradeName?: string;

  @ApiPropertyOptional({ example: '901234567-8', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  identificationNumber?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  identificationTypeId?: number;

  @ApiPropertyOptional({ example: 'Parrilla y comidas rápidas.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.mandalo.app/logos/sabor.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({ example: '3001234567', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'Cra 5 # 10-23, Centro', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 1.0287 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: -76.6266 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ example: 86 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ example: 1105 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  municipalityId?: number;

  @ApiPropertyOptional({
    description: 'Usuario dueño/representante legal (rol NEGO)',
    example: 'b6a4f6a0-1c2d-4e3f-9a8b-7c6d5e4f3a2b',
  })
  @IsOptional()
  @IsUUID()
  legalPersonId?: string;

  @ApiPropertyOptional({
    description:
      'Correo para crear la cuenta de acceso del negocio (rol NEGO). Va en pareja con accountPassword y es excluyente con legalPersonId.',
    example: 'negocio@mandalo.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'El email de la cuenta no es válido' })
  @MaxLength(150)
  accountEmail?: string;

  @ApiPropertyOptional({
    description: 'Contraseña de la cuenta de acceso del negocio',
    example: 'Secret@123',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(255)
  accountPassword?: string;

  @ApiPropertyOptional({
    description: 'Ids de etiquetas del negocio (reemplaza el set completo)',
    example: [1, 3],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  tagIds?: number[];

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Hora de apertura "HH:MM" (hora Colombia). Null = sin horario.',
    example: '08:00',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'La hora de apertura debe tener formato HH:MM',
  })
  openTime?: string | null;

  @ApiPropertyOptional({
    description:
      'Hora de cierre "HH:MM". Menor que openTime = horario nocturno.',
    example: '22:00',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'La hora de cierre debe tener formato HH:MM',
  })
  closeTime?: string | null;

  @ApiPropertyOptional({
    description: 'Días que abre (números 0–6, 0=domingo) separados por coma.',
    example: '1,2,3,4,5,6',
  })
  @IsOptional()
  @Matches(/^[0-6](,[0-6]){0,6}$/, {
    message: 'Los días de apertura no son válidos',
  })
  openDays?: string | null;

  @ApiPropertyOptional({
    description: 'Cerrado temporalmente (candado manual del negocio).',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  temporarilyClosed?: boolean;
}

export class UpdateOrganizationalDto extends PartialType(
  CreateOrganizationalDto,
) {}

/** Parámetros de la consulta paginada (search sobre legalName/tradeName/NIT). */
export class PaginatedOrganizationalsParamsDto extends ParamsPaginationDto {
  @ApiPropertyOptional({ description: 'Filtrar por razón social (parcial)' })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por número de identificación / NIT (parcial)',
  })
  @IsOptional()
  @IsString()
  identificationNumber?: string;

  @ApiPropertyOptional({ description: 'ID del tipo de identificación' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  identificationTypeId?: number;
}
