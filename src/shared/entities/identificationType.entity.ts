import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'identificationType' })
export class IdentificationType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { length: 20, unique: true })
  code: string;

  @Column('varchar', { length: 100 })
  name: string;
}
