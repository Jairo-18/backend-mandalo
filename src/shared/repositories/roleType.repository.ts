import { RoleType } from '../entities/roleType.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class RoleTypeRepository extends Repository<RoleType> {
  constructor(dataSource: DataSource) {
    super(RoleType, dataSource.createEntityManager());
  }
}
