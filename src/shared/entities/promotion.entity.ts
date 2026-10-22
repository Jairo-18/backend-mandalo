import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organizational } from './organizational.entity';
import { Product } from './product.entity';

// Postgres devuelve los numeric como string; esto los convierte a number.
const numericTransformer = {
  to: (value?: number | null) => value,
  from: (value: string | null) => (value === null ? null : parseFloat(value)),
};

/**
 * Publicidad de un negocio ("Mis publicidades", ver migración AddPromotions):
 * banner + título + mensaje + precio, con vigencia y productos incluidos.
 */
@Entity({ name: 'promotion' })
export class Promotion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  organizationalId: number;

  @ManyToOne(() => Organizational, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationalId' })
  organizational?: Organizational;

  @Column('varchar', { length: 80 })
  title: string;

  @Column('varchar', { length: 200, nullable: true })
  message?: string | null;

  /** Banner 16:9 (1280×720 webp); null hasta que el negocio sube la imagen. */
  @Column('varchar', { length: 500, nullable: true })
  imageUrl?: string | null;

  /** Precio de la promo completa (lo que se cobra por UNA unidad). */
  @Column('numeric', { precision: 12, scale: 2, transformer: numericTransformer })
  price: number;

  @Column('timestamptz')
  startsAt: Date;

  @Column('timestamptz')
  endsAt: Date;

  /** Pausada por el propio negocio (false) sin borrarla. */
  @Column('boolean', { default: true })
  isActive: boolean;

  /** Oculta por el admin (moderación): no se muestra aunque esté activa. */
  @Column('boolean', { default: false })
  hiddenByAdmin: boolean;

  @OneToMany(() => PromotionProduct, (item) => item.promotion, { cascade: true })
  items?: PromotionProduct[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** Un producto incluido en la promo y cuántas unidades. */
@Entity({ name: 'promotionProduct' })
export class PromotionProduct {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  promotionId: number;

  @ManyToOne(() => Promotion, (promotion) => promotion.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promotionId' })
  promotion?: Promotion;

  @Column('int')
  productId: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Column('int', { default: 1 })
  quantity: number;
}
