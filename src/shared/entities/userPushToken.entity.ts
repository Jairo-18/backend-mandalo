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

/**
 * Token de notificaciones push (Expo) de un dispositivo. Un usuario puede
 * tener varios (teléfono + tablet); el token es único GLOBAL: si otra cuenta
 * inicia sesión en el mismo teléfono, el token se reasigna a esa cuenta.
 */
@Entity({ name: 'userPushToken' })
export class UserPushToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  // ExponentPushToken[xxxxxxxx] — lo emite el servicio push de Expo.
  @Column('varchar', { length: 100, unique: true })
  token: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt?: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updatedAt?: Date;
}
