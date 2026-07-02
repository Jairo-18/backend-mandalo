import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { RoleType } from './roleType.entity';
import { Department } from './department.entity';
import { Municipality } from './municipality.entity';

@Entity({ name: 'user' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 100 })
  fullName: string;

  @Column('varchar', { length: 100, unique: true, nullable: true })
  username?: string;

  @Column('varchar', { length: 150, unique: true })
  email: string;

  @Exclude()
  @Column('varchar', { length: 255 })
  password: string;

  @Column('int', { nullable: true })
  municipalityId?: number;

  @ManyToOne(() => Municipality, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'municipalityId' })
  municipality?: Municipality;

  @Column('int', { nullable: true })
  departmentId?: number;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'departmentId' })
  department?: Department;

  @Column('varchar', { length: 255, nullable: true })
  address?: string;

  @Column('boolean', { default: true })
  isActive: boolean;

  @Column('uuid', { nullable: true })
  roleTypeId?: string;

  @ManyToOne(() => RoleType, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'roleTypeId' })
  roleType?: RoleType;

  @Column('varchar', { length: 50, nullable: true })
  identificationNumber?: string;

  @Column('int', { nullable: true })
  identificationTypeId?: number;

  @Exclude()
  @Column('varchar', { length: 2000, nullable: true })
  accessToken?: string;

  @Exclude()
  @Column('varchar', { length: 2000, nullable: true })
  refreshToken?: string;

  @Column('varchar', { length: 255, nullable: true })
  googleId?: string;

  @Column('varchar', { length: 30, nullable: true })
  phone?: string;

  @Column('varchar', { length: 500, nullable: true })
  avatarUrl?: string;

  @Exclude()
  @Column('varchar', { length: 255, nullable: true })
  resetToken?: string;

  @Column('timestamp', { nullable: true })
  resetTokenExpiry?: Date;

  @Exclude()
  @Column('varchar', { length: 255, nullable: true })
  emailVerificationToken?: string;

  @Column('timestamp', { nullable: true })
  emailVerificationTokenExpiry?: Date;

  @Column('boolean', { default: false })
  isEmailVerified: boolean;

  @Column('boolean', { default: false })
  isBanned: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt?: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updatedAt?: Date;
}
