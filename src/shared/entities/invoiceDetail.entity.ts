import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity';
import { Product } from './product.entity';

// Postgres devuelve los numeric como string; esto los convierte a number.
const numericTransformer = {
  to: (value?: number | null) => value,
  from: (value: string | null) => (value === null ? null : parseFloat(value)),
};

/**
 * Renglón del pedido. Guarda SNAPSHOT del producto (nombre, precio y
 * descuento vigentes al pedir): si el negocio luego edita o borra el
 * producto, el pedido histórico no cambia (por eso productId es SET NULL).
 */
@Entity({ name: 'invoiceDetail' })
export class InvoiceDetail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  invoiceId: number;

  @ManyToOne(() => Invoice, (invoice) => invoice.details, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'invoiceId' })
  invoice?: Invoice;

  @Column('int', { nullable: true })
  productId?: number | null;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Column('varchar', { length: 150 })
  productName: string;

  // Precio unitario SIN descuento vigente al pedir
  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  unitPrice: number;

  // Porcentaje de descuento (0–100) vigente al pedir
  @Column('numeric', {
    precision: 5,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  discount: number;

  @Column('int')
  quantity: number;

  // unitPrice con descuento aplicado × quantity (redondeado a 2 decimales)
  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  lineTotal: number;
}
