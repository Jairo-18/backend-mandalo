import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organizational } from './organizational.entity';

// Postgres devuelve los numeric como string; esto los convierte a number.
const numericTransformer = {
  to: (value?: number | null) => value,
  from: (value: string | null) => (value === null ? null : parseFloat(value)),
};

/**
 * Liquidación (cobro) de la plataforma a UN negocio por UN período (semana,
 * mes o año, hora Colombia). Los montos son SNAPSHOT de lo vigente al marcar
 * "cobrado": si después entran más entregas en ese período o cambian las
 * tasas por env, lo ya cobrado no se altera. Toda la plata se trata con el
 * negocio (al repartidor no se le cobra): % sobre lo vendido + % sobre los
 * domicilios.
 */
@Entity({ name: 'businessSettlement' })
@Index(['organizationalId', 'periodType', 'periodStart'], { unique: true })
export class BusinessSettlement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  organizationalId: number;

  @ManyToOne(() => Organizational, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationalId' })
  organizational?: Organizational;

  // 'week' | 'month' | 'year'
  @Column('varchar', { length: 10 })
  periodType: string;

  // Primer y último día del período (fecha local Colombia, inclusive)
  @Column('date')
  periodStart: string;

  @Column('date')
  periodEnd: string;

  // ---- Snapshot al momento del cobro ----
  @Column('int')
  ordersCount: number;

  // Suma de subtotales (lo vendido por el negocio) de los pedidos ENTR
  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  salesTotal: number;

  // Suma de los domicilios de esos pedidos
  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  deliveryTotal: number;

  // Tasas vigentes al cobrar (APP_COMMISSION_ORDER_RATE / _DELIVERY_RATE)
  @Column('numeric', {
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
  })
  orderCommissionRate: number;

  @Column('numeric', {
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
  })
  deliveryCommissionRate: number;

  // salesTotal × tasa pedidos + deliveryTotal × tasa domicilios
  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  commissionTotal: number;

  @Column('boolean', { default: false })
  isPaid: boolean;

  @Column('timestamptz', { nullable: true })
  paidAt?: Date | null;

  // Nota del admin ("pagó por Nequi", "quedó debiendo 10k", …)
  @Column('text', { nullable: true })
  notes?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date;

  @UpdateDateColumn({ type: 'timestamptz', nullable: true })
  updatedAt?: Date;
}
