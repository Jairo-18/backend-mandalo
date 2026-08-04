import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Invoice } from './invoice.entity';

/**
 * Reporte de accidente de un repartidor (reunión con el cliente 2026-08-04):
 * botón "¿Tuviste un accidente?" disponible mientras tiene un pedido activo.
 * Es un registro de SEGURIDAD independiente — no toca el estado del pedido
 * (eso lo maneja el flujo normal de "no se pudo entregar").
 */
@Entity({ name: 'deliveryAccident' })
export class DeliveryAccident {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column('uuid')
  deliveryUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deliveryUserId' })
  deliveryUser?: User;

  // Pedido que tenía en curso al momento del accidente (SET NULL si el
  // pedido se borra — el reporte de seguridad se conserva igual).
  @Column('int', { nullable: true })
  invoiceId?: number | null;

  @ManyToOne(() => Invoice, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'invoiceId' })
  invoice?: Invoice | null;

  // "Me accidenté" / "Me caí" / "Me chocaron" / "Otro" — texto libre del
  // front, no un enum estricto (mismo criterio que category/tag).
  @Column('varchar', { length: 50 })
  reasonCode: string;

  @Column('varchar', { length: 1000, nullable: true })
  notes?: string | null;

  // Hasta 5 fotos del accidente (evidencia).
  @Column('text', { array: true, default: () => "'{}'" })
  photos: string[];

  @Column('timestamptz')
  incidentAt: Date;

  // Null = pendiente. El admin lo marca al revisar ("Procesar accidente").
  @Index()
  @Column('timestamptz', { nullable: true })
  reviewedAt?: Date | null;

  @Column('uuid', { nullable: true })
  reviewedByAdminId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewedByAdminId' })
  reviewedByAdmin?: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
