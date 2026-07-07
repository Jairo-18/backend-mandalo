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

  @Column('boolean', { default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt?: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updatedAt?: Date;
}
