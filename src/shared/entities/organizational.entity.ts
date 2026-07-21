import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Department } from './department.entity';
import { Municipality } from './municipality.entity';
import { IdentificationType } from './identificationType.entity';
import { Tag } from './tag.entity';
import { Product } from './product.entity';

// Postgres devuelve los numeric como string; esto los convierte a number.
const numericTransformer = {
  to: (value?: number | null) => value,
  from: (value: string | null) => (value === null ? null : parseFloat(value)),
};

@Entity({ name: 'organizational' })
export class Organizational {
  @PrimaryGeneratedColumn()
  id: number;

  // Razón social (nombre legal registrado)
  @Column('varchar', { length: 255 })
  legalName: string;

  // Nombre comercial: el que ve el cliente en la app (puede diferir de la razón social)
  @Column('varchar', { length: 150, nullable: true })
  tradeName?: string;

  // NIT o documento del negocio
  @Column('varchar', { length: 50, unique: true, nullable: true })
  identificationNumber?: string;

  @Column('int', { nullable: true })
  identificationTypeId?: number;

  @ManyToOne(() => IdentificationType, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'identificationTypeId' })
  identificationType?: IdentificationType;

  @Column('text', { nullable: true })
  description?: string;

  // Logo del negocio (lo que ve el cliente en el listado)
  @Column('varchar', { length: 500, nullable: true })
  logoUrl?: string;

  // Teléfono de contacto del negocio (el que ve el cliente para llamar/pedir)
  @Column('varchar', { length: 30, nullable: true })
  phone?: string;

  @Column('varchar', { length: 255, nullable: true })
  address?: string;

  @Column('double precision', { nullable: true })
  latitude?: number;

  @Column('double precision', { nullable: true })
  longitude?: number;

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

  // Representante legal / dueño de la cuenta del negocio (rol NEGO)
  @Column('uuid', { nullable: true })
  legalPersonId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'legalPersonId' })
  legalPerson?: User;

  @ManyToMany(() => Tag)
  @JoinTable({
    name: 'organizationalTag',
    joinColumn: { name: 'organizationalId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tagId', referencedColumnName: 'id' },
  })
  tags?: Tag[];

  @OneToMany(() => Product, (product) => product.organizational)
  products?: Product[];

  // Horario de atención (hora local de Colombia). Sin horario configurado el
  // negocio se considera siempre abierto. closeTime < openTime = nocturno.
  @Column('varchar', { length: 5, nullable: true })
  openTime?: string | null;

  @Column('varchar', { length: 5, nullable: true })
  closeTime?: string | null;

  // Días que abre: números JS 0–6 (0=domingo) separados por coma. Null = todos.
  @Column('varchar', { length: 20, nullable: true })
  openDays?: string | null;

  // Candado manual del negocio: "cerrado temporalmente" aunque esté en horario.
  @Column('boolean', { default: false })
  temporarilyClosed: boolean;

  // ---- Datos de pago (métodos distintos a efectivo) ----
  // El cliente los ve en el checkout para transferir y subir el soporte.
  // Titular: a nombre de quién le va a transferir el cliente.
  @Column('varchar', { length: 120, nullable: true })
  paymentHolderName?: string | null;

  @Column('varchar', { length: 30, nullable: true })
  nequiNumber?: string | null;

  @Column('varchar', { length: 80, nullable: true })
  nequiKey?: string | null;

  @Column('varchar', { length: 60, nullable: true })
  bancolombiaAccount?: string | null;

  // Imagen del QR de Bancolombia que sube el negocio (upload, no texto).
  @Column('varchar', { length: 500, nullable: true })
  bancolombiaQrUrl?: string | null;

  @Column('boolean', { default: true })
  isActive: boolean;

  // Comisión de la plataforma sobre lo vendido (subtotal): el admin la deja
  // en 5 el primer mes y la pasa a 12 manualmente cuando corresponda (no hay
  // cambio automático por fecha). No aplica a domicilios — esa plata se
  // reparte 100% entre Mándalo y el repartidor (ver DeliveryPricingService).
  @Column('numeric', {
    precision: 5,
    scale: 2,
    default: 5,
    transformer: numericTransformer,
  })
  commissionOrderRate: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt?: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updatedAt?: Date;
}
