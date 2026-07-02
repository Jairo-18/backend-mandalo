import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Department } from './department.entity';

@Entity({ name: 'municipality' })
export class Municipality {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { length: 10, unique: true })
  code: string;

  @Column('varchar', { length: 150 })
  name: string;

  @Column('int', { nullable: true })
  departmentId?: number;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'departmentId' })
  department?: Department;
}
