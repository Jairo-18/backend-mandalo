import { IdentificationType } from '../entities/identificationType.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class IdentificationTypeRepository extends Repository<IdentificationType> {
  constructor(dataSource: DataSource) {
    super(IdentificationType, dataSource.createEntityManager());
  }
}
