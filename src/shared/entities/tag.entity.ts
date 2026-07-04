import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'tag' })
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { length: 30, unique: true })
  code: string;

  @Column('varchar', { length: 100 })
  name: string;

  @Column('varchar', { length: 100, nullable: true })
  icon?: string;
}
