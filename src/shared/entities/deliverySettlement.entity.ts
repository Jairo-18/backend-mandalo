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
import { User } from './user.entity';

// Postgres devuelve los numeric como string; esto los convierte a number.
const numericTransformer = {
  to: (value?: number | null) => value,
  from: (value: string | null) => (value === null ? null : parseFloat(value)),
};

/**
 * Liquidación (pago) de Mándalo a UN repartidor por UNA quincena (hora
 * Colombia) — espejo de `BusinessSettlement` pero en la dirección contraria
 * de la plata: acá Mándalo le paga al repartidor lo que ganó en domicilios
 * (`riderCut`), no le cobra. Los montos son SNAPSHOT al marcar "pagado": si
 * después entran más entregas en esa quincena, lo ya pagado no se altera.
 */
@Entity({ name: 'deliverySettlement' })
@Index(['deliveryUserId', 'periodType', 'periodStart'], { unique: true })
export class DeliverySettlement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('uuid')
  deliveryUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deliveryUserId' })
  deliveryUser?: User;

  // Siempre 'quincena': es la única unidad que se marca pagada/pendiente.
  @Column('varchar', { length: 10 })
  periodType: string;

  @Column('date')
  periodStart: string;

  @Column('date')
  periodEnd: string;

  // ---- Snapshot al momento de pagar ----
  @Column('int')
  ordersCount: number;

  // Suma de las tarifas de domicilio cobradas al cliente en esos pedidos.
  @Column('numeric', { precision: 12, scale: 2, transformer: numericTransformer })
  deliveryTotal: number;

  // Parte de esa plata que se queda Mándalo.
  @Column('numeric', { precision: 12, scale: 2, transformer: numericTransformer })
  mandaloCut: number;

  // Parte que se le paga al repartidor (lo que este registro liquida).
  @Column('numeric', { precision: 12, scale: 2, transformer: numericTransformer })
  riderCut: number;

  @Column('boolean', { default: false })
  isPaid: boolean;

  @Column('timestamptz', { nullable: true })
  paidAt?: Date | null;

  // Nota del admin ("pagado por Nequi", "quedó debiendo 10k", …)
  @Column('text', { nullable: true })
  notes?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date;

  @UpdateDateColumn({ type: 'timestamptz', nullable: true })
  updatedAt?: Date;
}
