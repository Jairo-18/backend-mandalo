import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CategoryType } from './categoryType.entity';
import { Organizational } from './organizational.entity';

// Postgres devuelve los numeric como string; esto los convierte a number.
const numericTransformer = {
  to: (value?: number | null) => value,
  from: (value: string | null) => (value === null ? null : parseFloat(value)),
};

@Entity({ name: 'product' })
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  // SKU/código interno del negocio (opcional)
  @Column('varchar', { length: 50, nullable: true })
  code?: string;

  @Column('varchar', { length: 150 })
  name: string;

  @Column('text', { nullable: true })
  description?: string;

  @Column('int', { nullable: true })
  categoryTypeId?: number;

  @ManyToOne(() => CategoryType, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryTypeId' })
  categoryType?: CategoryType;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  priceSale: number;

  // Porcentaje de descuento (0–100); el precio final se calcula al vuelo.
  @Column('numeric', {
    precision: 5,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  discount: number;

  // URLs de las fotos del producto; la primera es la principal
  @Column('text', { array: true, default: () => "'{}'" })
  images: string[];

  @Column('boolean', { default: true })
  isActive: boolean;

  @Column('int')
  organizationalId: number;

  @ManyToOne(() => Organizational, (org) => org.products, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organizationalId' })
  organizational?: Organizational;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt?: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updatedAt?: Date;
}
