import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Dirección de entrega de un usuario (rol USER): puede tener varias con un
 * nombre propio ("Casa", "Trabajo") y UNA principal (isDefault) a la que se
 * envían los pedidos por defecto. Es independiente de `user.address` (el
 * texto del registro), que se deja quieto.
 */
@Entity({ name: 'userAddress' })
export class UserAddress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  // Nombre que le pone el usuario: "Casa", "Trabajo", "Donde mi mamá"…
  @Column('varchar', { length: 50 })
  label: string;

  @Column('varchar', { length: 255 })
  address: string;

  // Apto/torre/referencias: "Torre 2 apto 301, portón café"
  @Column('varchar', { length: 255, nullable: true })
  details?: string;

  @Column('double precision', { nullable: true })
  latitude?: number;

  @Column('double precision', { nullable: true })
  longitude?: number;

  // Solo UNA por usuario (lo garantiza el service).
  @Column('boolean', { default: false })
  isDefault: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt?: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updatedAt?: Date;
}
