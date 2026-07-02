import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'roleType' })
export class RoleType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 50, unique: true })
  code: string;

  @Column('varchar', { length: 100 })
  name: string;
}
