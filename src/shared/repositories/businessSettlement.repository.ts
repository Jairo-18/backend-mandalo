import { BusinessSettlement } from '../entities/businessSettlement.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class BusinessSettlementRepository extends Repository<BusinessSettlement> {
  constructor(dataSource: DataSource) {
    super(BusinessSettlement, dataSource.createEntityManager());
  }
}
