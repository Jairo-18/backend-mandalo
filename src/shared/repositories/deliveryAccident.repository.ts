import { DeliveryAccident } from '../entities/deliveryAccident.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class DeliveryAccidentRepository extends Repository<DeliveryAccident> {
  constructor(dataSource: DataSource) {
    super(DeliveryAccident, dataSource.createEntityManager());
  }
}
