import { Municipality } from '../entities/municipality.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class MunicipalityRepository extends Repository<Municipality> {
  constructor(dataSource: DataSource) {
    super(Municipality, dataSource.createEntityManager());
  }
}
