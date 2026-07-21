import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { RoleType } from './roleType.entity';
import { Department } from './department.entity';
import { Municipality } from './municipality.entity';
import { IdentificationType } from './identificationType.entity';

@Entity({ name: 'user' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 100 })
  fullName: string;

  @Column('varchar', { length: 100, unique: true, nullable: true })
  username?: string;

  @Column('varchar', { length: 150, unique: true })
  email: string;

  @Exclude()
  @Column('varchar', { length: 255 })
  password: string;

  @Column('int', { nullable: true })
  municipalityId?: number;

  @ManyToOne(() => Municipality, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'municipalityId' })
  municipality?: Municipality;

  @Column('int', { nullable: true })
  departmentId?: number;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'departmentId' })
  department?: Department;

  @Column('varchar', { length: 255, nullable: true })
  address?: string;

  // Coordenadas de la dirección (capturadas de la ubicación del dispositivo);
  // el texto de `address` es para humanos, esto para distancias/rutas.
  @Column('double precision', { nullable: true })
  latitude?: number;

  @Column('double precision', { nullable: true })
  longitude?: number;

  @Column('boolean', { default: true })
  isActive: boolean;

  @Column('uuid', { nullable: true })
  roleTypeId?: string;

  @ManyToOne(() => RoleType, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'roleTypeId' })
  roleType?: RoleType;

  @Column('varchar', { length: 50, nullable: true })
  identificationNumber?: string;

  @Column('int', { nullable: true })
  identificationTypeId?: number;

  @ManyToOne(() => IdentificationType, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'identificationTypeId' })
  identificationType?: IdentificationType;

  @Exclude()
  @Column('varchar', { length: 2000, nullable: true })
  accessToken?: string;

  @Exclude()
  @Column('varchar', { length: 2000, nullable: true })
  refreshToken?: string;

  @Column('varchar', { length: 255, nullable: true })
  googleId?: string;

  @Column('varchar', { length: 30, nullable: true })
  phone?: string;

  @Column('varchar', { length: 500, nullable: true })
  avatarUrl?: string;

  // Documento de identidad del repartidor (foto por delante y por detrás);
  // los revisa un admin antes de activar la cuenta DELI.
  @Column('varchar', { length: 500, nullable: true })
  identificationFrontUrl?: string;

  @Column('varchar', { length: 500, nullable: true })
  identificationBackUrl?: string;

  // Documentos del vehículo del repartidor: placa + licencia (foto por delante
  // y por detrás, como la cédula) + SOAT y tecnomecánica (un solo archivo cada
  // uno, foto O pdf — llegan como certificado de una sola página).
  @Column('varchar', { length: 20, nullable: true })
  vehiclePlate?: string;

  @Column('varchar', { length: 500, nullable: true })
  licenseFrontUrl?: string;

  @Column('varchar', { length: 500, nullable: true })
  licenseBackUrl?: string;

  @Column('varchar', { length: 500, nullable: true })
  soatUrl?: string;

  @Column('varchar', { length: 500, nullable: true })
  technicalInspectionUrl?: string;

  // Observaciones del admin para el usuario (p. ej. por qué su cuenta de
  // repartidor aún no se activa: "la foto de la cédula está borrosa").
  @Column('text', { nullable: true })
  observations?: string;

  // Aceptación de Términos y Condiciones + Política de Tratamiento de Datos
  // (Habeas Data). `termsVersion` guarda QUÉ versión aceptó (permite pedir
  // re-aceptación si el texto cambia materialmente más adelante).
  @Column('timestamp', { nullable: true })
  termsAcceptedAt?: Date;

  @Column('varchar', { length: 20, nullable: true })
  termsVersion?: string;

  @Exclude()
  @Column('varchar', { length: 255, nullable: true })
  resetToken?: string;

  @Column('timestamp', { nullable: true })
  resetTokenExpiry?: Date;

  @Exclude()
  @Column('varchar', { length: 255, nullable: true })
  emailVerificationToken?: string;

  @Column('timestamp', { nullable: true })
  emailVerificationTokenExpiry?: Date;

  @Column('boolean', { default: false })
  isEmailVerified: boolean;

  @Column('boolean', { default: false })
  isBanned: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt?: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updatedAt?: Date;
}
