import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'paidType' })
export class PaidType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { length: 30, unique: true })
  code: string;

  @Column('varchar', { length: 100 })
  name: string;
}
