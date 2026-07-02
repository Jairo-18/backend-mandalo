import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Creación de usuario por un administrador. Acepta todos los datos de perfil
 * y las relaciones (rol, ubicación, tipo de identificación).
 */
export class CreateUserDto {
  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre completo es requerido' })
  @MaxLength(100)
  fullName: string;

  @ApiProperty({ example: 'juan@mandalo.com' })
  @IsEmail({}, { message: 'El email no es válido' })
  @MaxLength(150)
  email: string;

  @ApiProperty({ example: 'Secret@123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(255)
  password: string;

  @ApiPropertyOptional({ example: 'juanp' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

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

  @ApiPropertyOptional({ example: 'Calle 1 # 2-3' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ description: 'UUID del tipo de rol' })
  @IsOptional()
  @IsUUID()
  roleTypeId?: string;

  @ApiPropertyOptional({ example: '1090123456' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  identificationNumber?: string;

  @ApiPropertyOptional({ description: 'ID del tipo de identificación', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  identificationTypeId?: number;

  @ApiPropertyOptional({ example: '3001234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'https://cdn.mandalo.com/avatar.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Auto-registro público. Datos mínimos; el rol y verificaciones se resuelven
 * del lado del servidor.
 */
export class RegisterUserDto {
  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre completo es requerido' })
  @MaxLength(100)
  fullName: string;

  @ApiProperty({ example: 'juan@mandalo.com' })
  @IsEmail({}, { message: 'El email no es válido' })
  @MaxLength(150)
  email: string;

  @ApiProperty({ example: 'Secret@123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(255)
  password: string;

  @ApiPropertyOptional({ example: 'juanp' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @ApiPropertyOptional({ example: '3001234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

/**
 * Edición de usuario. Todo opcional (PartialType de create) más flags que solo
 * un administrador debería tocar.
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isBanned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEmailVerified?: boolean;
}
