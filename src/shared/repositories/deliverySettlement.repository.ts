import { DeliverySettlement } from '../entities/deliverySettlement.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class DeliverySettlementRepository extends Repository<DeliverySettlement> {
  constructor(dataSource: DataSource) {
    super(DeliverySettlement, dataSource.createEntityManager());
  }
}
