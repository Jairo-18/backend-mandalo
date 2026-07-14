import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity';
import { User } from './user.entity';

/**
 * Mensaje del chat de un pedido (cliente ↔ repartidor asignado). El hilo ES
 * el pedido: se habilita cuando un repartidor lo toma y queda de solo
 * lectura al entregar/cancelar. `createdAt` en timestamptz (regla §26 de
 * NOTAS: toda hora que ve el usuario es un instante absoluto).
 */
@Entity({ name: 'chatMessage' })
export class ChatMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column('int')
  invoiceId: number;

  @ManyToOne(() => Invoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId' })
  invoice?: Invoice;

  @Column('uuid')
  senderUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'senderUserId' })
  sender?: User;

  @Column('varchar', { length: 500 })
  body: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  // Cuándo lo leyó el destinatario (alimenta el badge de no-leídos).
  @Column('timestamptz', { nullable: true })
  readAt?: Date | null;
}
