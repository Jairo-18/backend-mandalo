import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';

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

  @ApiPropertyOptional({ example: 1.0287, description: 'Latitud de la dirección' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: -76.6272, description: 'Longitud de la dirección' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ description: 'UUID del tipo de rol' })
  @IsOptional()
  @IsUUID()
  roleTypeId?: string;

  @ApiPropertyOptional({
    description: 'Code del tipo de rol (alternativa a roleTypeId; manda si vienen los dos)',
    enum: RoleTypeCode,
  })
  @IsOptional()
  @IsEnum(RoleTypeCode)
  roleTypeCode?: RoleTypeCode;

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

  @ApiPropertyOptional({ example: 'ABC12D', description: 'Placa del vehículo (repartidor)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehiclePlate?: string;

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

  @ApiPropertyOptional({
    description:
      'Número de afiliado ARL del repartidor (lo asigna el admin, NUNCA el registro público). Sin esto, el repartidor no ve pedidos disponibles aunque esté activo.',
    example: 'ARL-00123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  arlIndividualNumber?: string;
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

  // Nombre de usuario OBLIGATORIO en el auto-registro (cliente y repartidor).
  @ApiProperty({ example: 'juanp' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre de usuario es requerido' })
  @MaxLength(100)
  username: string;

  // Celular OBLIGATORIO en el auto-registro (todos los formularios ya lo exigen).
  @ApiProperty({ example: '3001234567' })
  @IsString()
  @IsNotEmpty({ message: 'El número de celular es requerido' })
  @MaxLength(30)
  phone: string;

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

  @ApiPropertyOptional({
    example: 'Torre 2 apto 301, portón café',
    description:
      'Referencia específica de la dirección (solo cliente): se guarda en userAddress.details de la dirección "Casa" inicial',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  details?: string;

  @ApiPropertyOptional({ example: 1.0287, description: 'Latitud (ubicación del dispositivo)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: -76.6272, description: 'Longitud (ubicación del dispositivo)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

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

  @ApiPropertyOptional({
    example: 'ABC12D',
    description: 'Placa del vehículo (repartidor)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehiclePlate?: string;

  @ApiProperty({
    example: true,
    description:
      'Aceptación de los Términos y Condiciones y la Política de Tratamiento de Datos (debe ser true)',
  })
  // El registro de repartidor va en multipart/form-data: el valor llega como
  // el string "true", no como boolean — sin esto @IsBoolean lo rechazaría.
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @Equals(true, {
    message:
      'Debes aceptar los Términos y Condiciones y la Política de Tratamiento de Datos',
  })
  acceptedTerms: boolean;
}

/**
 * Edición del PROPIO perfil (pantalla "Mi perfil" de la app, cualquier rol).
 * Subconjunto sin campos de administración (rol, isActive/isBanned,
 * observations), sin email (cambiarlo exigiría re-verificar el correo) y sin
 * contraseña (tiene su propio endpoint que exige la actual).
 */
export class UpdateMyProfileDto {
  @ApiPropertyOptional({ example: 'Juan Pérez' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre completo es requerido' })
  @MaxLength(100)
  fullName?: string;

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

  @ApiPropertyOptional({ example: 'Calle 1 # 2-3' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 1.0287 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: -76.6272 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ description: 'ID del departamento', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ description: 'ID del municipio', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  municipalityId?: number;

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

  @ApiPropertyOptional({
    description:
      'Aceptación de Términos y Condiciones / Tratamiento de Datos (onboarding post-Google, cliente). Solo `true` tiene efecto — se ignora si no viene.',
  })
  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  @IsBoolean()
  acceptedTerms?: boolean;
}

/** Reenviar el correo de verificación (público, botón del login). */
export class ResendVerificationDto {
  @ApiProperty({ example: 'juan@correo.com' })
  @IsEmail({}, { message: 'El email no es válido' })
  @MaxLength(150)
  email: string;
}

/**
 * Onboarding post-Google: la cuenta (creada como USER por el sign-in) se
 * convierte en repartidor. Va en multipart junto con las fotos de
 * verificación (`avatar`, `idFront`, `idBack`), por eso los @Type(Number).
 */
export class BecomeDeliveryDto {
  @ApiProperty({ example: 'AB1234567' })
  @IsString()
  @IsNotEmpty({ message: 'El número de identificación es requerido' })
  @MaxLength(50)
  identificationNumber: string;

  @ApiProperty({ description: 'ID del tipo de identificación', type: Number })
  @Type(() => Number)
  @IsInt()
  identificationTypeId: number;

  @ApiProperty({ example: 'ABC12D', description: 'Placa del vehículo' })
  @IsString()
  @IsNotEmpty({ message: 'La placa del vehículo es requerida' })
  @MaxLength(20)
  vehiclePlate: string;

  @ApiProperty({
    example: true,
    description:
      'Aceptación de los Términos y Condiciones y la Política de Tratamiento de Datos (debe ser true)',
  })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @Equals(true, {
    message:
      'Debes aceptar los Términos y Condiciones y la Política de Tratamiento de Datos',
  })
  acceptedTerms: boolean;
}

/**
 * Reenvío de documentos del repartidor (perfil propio, `POST
 * /user/me/resend-documents`): todo opcional — solo se reemplaza lo que el
 * usuario vuelva a subir (corregir un documento rechazado o renovar uno
 * vencido como el SOAT). Los archivos van sueltos en el multipart, sin DTO.
 */
export class ResendDeliveryDocumentsDto {
  @ApiPropertyOptional({ example: 'ABC12D', description: 'Placa del vehículo' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehiclePlate?: string;
}

/** Cambio de contraseña del propio usuario (exige la contraseña actual). */
export class ChangeMyPasswordDto {
  @ApiProperty({ example: 'Actual@123' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña actual es requerida' })
  currentPassword: string;

  @ApiProperty({ example: 'Nueva@123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(255)
  newPassword: string;
}

/**
 * Solicitud de eliminación de cuenta SIN sesión (página web pública, exigida
 * por Google Play — ver NOTAS.md §49). No requiere estar logueado: el correo
 * identifica la cuenta y el backend manda el enlace de confirmación.
 */
export class RequestAccountDeletionDto {
  @ApiProperty({ type: String, example: 'tu@correo.com', required: true })
  @IsEmail({}, { message: 'El correo no es válido' })
  @IsNotEmpty({ message: 'El email es requerido' })
  email: string;
}

/**
 * Formulario "¿Tienes un negocio?" del registro: en vez de abrir el correo
 * del dispositivo (`mailto:`), manda estos datos directo al equipo de
 * Mándalo por correo. Sin cuenta todavía — los negocios no se auto-registran.
 */
export class BusinessLeadDto {
  @ApiProperty({ example: 'Donde el Mono' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del negocio es requerido' })
  @MaxLength(150)
  businessName: string;

  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del titular es requerido' })
  @MaxLength(100)
  ownerName: string;

  @ApiProperty({ example: '3001234567' })
  @IsString()
  @IsNotEmpty({ message: 'El teléfono es requerido' })
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional({ example: 'tucorreo@gmail.com' })
  @IsOptional()
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(150)
  contactEmail?: string;

  @ApiPropertyOptional({ example: '1127077851' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  identificationNumber?: string;

  @ApiProperty({ example: 'Restaurante / comida rápida' })
  @IsString()
  @IsNotEmpty({ message: 'El tipo de negocio es requerido' })
  @MaxLength(100)
  businessType: string;

  @ApiProperty({ example: 'Villagarzón, Putumayo — Cll 10 Cr 3-14' })
  @IsString()
  @IsNotEmpty({ message: 'El municipio y la dirección son requeridos' })
  @MaxLength(200)
  municipalityAddress: string;
}

/** Token de notificaciones push del dispositivo (lo emite Expo en la app). */
export class PushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @IsNotEmpty({ message: 'El token de notificaciones es requerido' })
  @MaxLength(100)
  token: string;
}

/**
 * Alta masiva de cuentas por el admin (subida de CSV o lista escrita a mano,
 * ver `UserService.bulkInvite`). Todas las cuentas de la tanda nacen con el
 * mismo rol y la misma contraseña fija de ese rol; cada una recibe su propio
 * correo de bienvenida por separado.
 */
export class BulkInviteUsersDto {
  @ApiProperty({
    description: 'Rol con el que nacen todas las cuentas de esta tanda',
    enum: [RoleTypeCode.CLIENT, RoleTypeCode.BUSINESS, RoleTypeCode.DELIVERY],
  })
  @IsIn([RoleTypeCode.CLIENT, RoleTypeCode.BUSINESS, RoleTypeCode.DELIVERY], {
    message: 'El rol debe ser Cliente, Negocio o Domiciliario',
  })
  roleTypeCode: RoleTypeCode;

  @ApiProperty({
    type: [String],
    example: ['juan.perez@gmail.com', 'maria.gomez@gmail.com'],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Sube al menos un correo' })
  @ArrayMaxSize(300, { message: 'Máximo 300 correos por tanda' })
  @IsEmail({}, { each: true, message: 'Hay un correo con formato inválido' })
  emails: string[];
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

  @ApiPropertyOptional({
    description:
      'Nota del admin PARA el usuario (p. ej. por qué su cuenta de repartidor no se activa). `null` la limpia.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string | null;

  @ApiPropertyOptional({
    description:
      'Aceptación de Términos y Condiciones / Tratamiento de Datos. Solo `true` tiene efecto — se ignora si no viene.',
  })
  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  @IsBoolean()
  acceptedTerms?: boolean;
}
