import { Organizational } from '../entities/organizational.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class OrganizationalRepository extends Repository<Organizational> {
  constructor(dataSource: DataSource) {
    super(Organizational, dataSource.createEntityManager());
  }
}
