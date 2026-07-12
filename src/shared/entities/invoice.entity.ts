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
import { User } from './user.entity';
import { Organizational } from './organizational.entity';
import { StateType } from './stateType.entity';
import { PaidType } from './paidType.entity';
import { InvoiceDetail } from './invoiceDetail.entity';

// Postgres devuelve los numeric como string; esto los convierte a number.
const numericTransformer = {
  to: (value?: number | null) => value,
  from: (value: string | null) => (value === null ? null : parseFloat(value)),
};

/**
 * Pedido (factura) de un cliente a UN negocio (negocio-first, §20 de NOTAS).
 * La dirección de entrega va COPIADA (texto + coords) para que el pedido no
 * cambie si el usuario edita o borra su userAddress. Los precios/totales son
 * snapshot de lo vigente al crear — el backend los calcula, nunca el cliente.
 * El pago es contra-entrega: paidType solo registra el método elegido.
 */
@Entity({ name: 'invoice' })
export class Invoice {
  @PrimaryGeneratedColumn()
  id: number;

  // Cliente que hace el pedido
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column('int')
  organizationalId: number;

  @ManyToOne(() => Organizational, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationalId' })
  organizational?: Organizational;

  // Repartidor que TOMÓ el pedido (null mientras esté disponible)
  @Column('uuid', { nullable: true })
  deliveryUserId?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deliveryUserId' })
  deliveryUser?: User;

  @Column('int')
  stateTypeId: number;

  @ManyToOne(() => StateType)
  @JoinColumn({ name: 'stateTypeId' })
  stateType?: StateType;

  @Column('int')
  paidTypeId: number;

  @ManyToOne(() => PaidType)
  @JoinColumn({ name: 'paidTypeId' })
  paidType?: PaidType;

  // Snapshot de la dirección de entrega elegida
  @Column('varchar', { length: 255 })
  deliveryAddress: string;

  @Column('varchar', { length: 255, nullable: true })
  deliveryDetails?: string;

  @Column('double precision', { nullable: true })
  deliveryLatitude?: number;

  @Column('double precision', { nullable: true })
  deliveryLongitude?: number;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  subtotal: number;

  // Tarifa fija del domicilio vigente al crear (APP_DELIVERY_FEE)
  @Column('numeric', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  deliveryFee: number;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  total: number;

  // Nota del cliente al negocio ("sin cebolla", "timbre dañado, llamar")
  @Column('text', { nullable: true })
  notes?: string;

  @Column('varchar', { length: 255, nullable: true })
  cancellationReason?: string;

  // ---- Tiempos del flujo: cuándo ocurrió cada transición ----
  // timestamptz (instante absoluto): createdAt lo escribe Postgres y las
  // transiciones Node — con `timestamp` a secas se mezclaban los relojes.
  @Column('timestamptz', { nullable: true })
  acceptedAt?: Date | null;

  @Column('timestamptz', { nullable: true })
  preparingAt?: Date | null;

  // Cuándo un repartidor TOMÓ el pedido (claim)
  @Column('timestamptz', { nullable: true })
  takenAt?: Date | null;

  @Column('timestamptz', { nullable: true })
  onRouteAt?: Date | null;

  @Column('timestamptz', { nullable: true })
  deliveredAt?: Date | null;

  @Column('timestamptz', { nullable: true })
  cancelledAt?: Date | null;

  // Minutos de preparación que el NEGOCIO promete al aceptar el pedido
  @Column('int', { nullable: true })
  prepEstimatedMinutes?: number | null;

  // Minutos de entrega estimados al despachar (distancia o tarifa fija)
  @Column('int', { nullable: true })
  deliveryEstimatedMinutes?: number | null;

  @OneToMany(() => InvoiceDetail, (detail) => detail.invoice)
  details?: InvoiceDetail[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date;

  @UpdateDateColumn({ type: 'timestamptz', nullable: true })
  updatedAt?: Date;
}
