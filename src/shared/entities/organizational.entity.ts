import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'organizational' })
export class Organizational {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { length: 255 })
  legalName: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt?: Date;
}
