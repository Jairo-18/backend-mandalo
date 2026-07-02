import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'department' })
export class Department {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { length: 10, unique: true })
  code: string;

  @Column('varchar', { length: 150 })
  name: string;
}
