import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organizational } from './organizational.entity';
import { Product } from './product.entity';

/** Negocio favorito de un usuario (ver migración AddFavorites). */
@Entity({ name: 'favoriteBusiness' })
export class FavoriteBusiness {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('uuid')
  userId: string;

  @Column('int')
  organizationalId: number;

  @ManyToOne(() => Organizational, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationalId' })
  organizational?: Organizational;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/** Producto favorito de un usuario (ver migración AddFavorites). */
@Entity({ name: 'favoriteProduct' })
export class FavoriteProduct {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('uuid')
  userId: string;

  @Column('int')
  productId: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
