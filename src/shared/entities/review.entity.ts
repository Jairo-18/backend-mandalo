import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity';
import { User } from './user.entity';
import { Organizational } from './organizational.entity';

// Postgres devuelve los numeric como string; esto los convierte a number.
const numericTransformer = {
  to: (value?: number | null) => value,
  from: (value: string | null) => (value === null ? null : parseFloat(value)),
};

/** A quién se califica: el negocio, el repartidor o el cliente del pedido. */
export enum ReviewTargetType {
  BUSINESS = 'BUSINESS',
  DELIVERY = 'DELIVERY',
  CLIENT = 'CLIENT',
}

/**
 * Reseña de una parte de un pedido ENTREGADO a otra (ver la migración
 * `AddReviews`). Una por pedido + rol del autor + destino. El promedio del
 * destino (`ratingAverage`/`ratingCount` en `user`/`organizational`) lo
 * recalcula un trigger de la DB.
 */
@Entity({ name: 'review' })
export class Review {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  invoiceId: number;

  @ManyToOne(() => Invoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId' })
  invoice?: Invoice;

  // null si el autor eliminó su cuenta (la reseña se conserva).
  @Column('uuid', { nullable: true })
  authorUserId?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'authorUserId' })
  author?: User | null;

  /** Rol del autor al reseñar: USER (cliente), NEGO o DELI. */
  @Column('varchar', { length: 10 })
  authorRole: string;

  /** Negocio que reseña (autor NEGO): se muestra su nombre, no el del dueño. */
  @Column('int', { nullable: true })
  authorOrganizationalId?: number | null;

  @ManyToOne(() => Organizational, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'authorOrganizationalId' })
  authorOrganizational?: Organizational | null;

  /** Nombre del autor al reseñar (se conserva si luego borra la cuenta). */
  @Column('varchar', { length: 255, nullable: true })
  authorName?: string | null;

  @Column('varchar', { length: 10 })
  targetType: ReviewTargetType;

  @Column('uuid', { nullable: true })
  targetUserId?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'targetUserId' })
  targetUser?: User | null;

  @Column('int', { nullable: true })
  targetOrganizationalId?: number | null;

  @ManyToOne(() => Organizational, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'targetOrganizationalId' })
  targetOrganizational?: Organizational | null;

  /** 0.5 a 5, en pasos de 0.5. */
  @Column('numeric', { precision: 2, scale: 1, transformer: numericTransformer })
  rating: number;

  @Column('varchar', { length: 250, nullable: true })
  comment?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
