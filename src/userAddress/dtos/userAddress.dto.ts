import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/** El userId nunca viene del cliente: se toma del JWT (direcciones propias). */
export class CreateUserAddressDto {
  @ApiProperty({ example: 'Casa', maxLength: 50 })
  @IsString()
  @IsNotEmpty({ message: 'Ponle un nombre a la dirección (ej: Casa)' })
  @MaxLength(50)
  label: string;

  @ApiProperty({ example: 'Calle 1 # 2-3, Barrio Centro', maxLength: 255 })
  @IsString()
  @IsNotEmpty({ message: 'La dirección es requerida' })
  @MaxLength(255)
  address: string;

  @ApiPropertyOptional({
    example: 'Torre 2 apto 301, portón café',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  details?: string;

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

  @ApiPropertyOptional({
    description: 'Marcarla como la dirección principal',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateUserAddressDto extends PartialType(CreateUserAddressDto) {}
