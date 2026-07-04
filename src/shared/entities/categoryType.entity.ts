import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'categoryType' })
export class CategoryType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { length: 30, unique: true })
  code: string;

  @Column('varchar', { length: 100 })
  name: string;

  @Column('varchar', { length: 100, nullable: true })
  icon?: string;
}
