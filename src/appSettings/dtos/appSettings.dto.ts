import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const HEX_COLOR_MESSAGE = 'Debe ser un color hex válido, ej: #FF5A3C';
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

/** Edición de la paleta de marca (solo ADMIN, ver NOTAS.md §50/§51). */
export class UpdateAppSettingsDto {
  @ApiPropertyOptional({ example: '#FF5A3C' })
  @IsOptional()
  @Matches(HEX_COLOR_REGEX, { message: HEX_COLOR_MESSAGE })
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#1E1E2D' })
  @IsOptional()
  @Matches(HEX_COLOR_REGEX, { message: HEX_COLOR_MESSAGE })
  darkColor?: string;

  @ApiPropertyOptional({ example: '#F2F2F2' })
  @IsOptional()
  @Matches(HEX_COLOR_REGEX, { message: HEX_COLOR_MESSAGE })
  surfaceLightColor?: string;

  @ApiPropertyOptional({ example: '#12121B' })
  @IsOptional()
  @Matches(HEX_COLOR_REGEX, { message: HEX_COLOR_MESSAGE })
  surfaceDarkColor?: string;

  @ApiPropertyOptional({ example: '#FFFFFF' })
  @IsOptional()
  @Matches(HEX_COLOR_REGEX, { message: HEX_COLOR_MESSAGE })
  cardLightColor?: string;

  @ApiPropertyOptional({ example: '#262636' })
  @IsOptional()
  @Matches(HEX_COLOR_REGEX, { message: HEX_COLOR_MESSAGE })
  cardDarkColor?: string;

  @ApiPropertyOptional({ example: '#1E1E2D' })
  @IsOptional()
  @Matches(HEX_COLOR_REGEX, { message: HEX_COLOR_MESSAGE })
  textPrimaryLightColor?: string;

  @ApiPropertyOptional({ example: '#EDEDF2' })
  @IsOptional()
  @Matches(HEX_COLOR_REGEX, { message: HEX_COLOR_MESSAGE })
  textPrimaryDarkColor?: string;

  @ApiPropertyOptional({ example: '#7A7A8A' })
  @IsOptional()
  @Matches(HEX_COLOR_REGEX, { message: HEX_COLOR_MESSAGE })
  textSecondaryLightColor?: string;

  @ApiPropertyOptional({ example: '#A0A0B2' })
  @IsOptional()
  @Matches(HEX_COLOR_REGEX, { message: HEX_COLOR_MESSAGE })
  textSecondaryDarkColor?: string;

  @ApiPropertyOptional({ example: '#E5E7EB' })
  @IsOptional()
  @Matches(HEX_COLOR_REGEX, { message: HEX_COLOR_MESSAGE })
  borderLightColor?: string;

  @ApiPropertyOptional({ example: '#33334A' })
  @IsOptional()
  @Matches(HEX_COLOR_REGEX, { message: HEX_COLOR_MESSAGE })
  borderDarkColor?: string;

  @ApiPropertyOptional({
    description: 'ARL global — cubre a todos los repartidores',
    example: 'Positiva ARL',
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  arlCompanyName?: string;

  @ApiPropertyOptional({ example: 'POL-123456', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  arlPolicyNumber?: string;

  @ApiPropertyOptional({
    example: 'https://youtube.com/@mandalo',
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  youtubeUrl?: string;

  @ApiPropertyOptional({
    example: 'https://facebook.com/mandalo',
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  facebookUrl?: string;

  @ApiPropertyOptional({
    example: 'https://instagram.com/mandalo',
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  instagramUrl?: string;

  @ApiPropertyOptional({
    description: 'Teléfono de contacto público (soporte/atención al cliente)',
    example: '+57 300 123 4567',
    maxLength: 30,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;
}
