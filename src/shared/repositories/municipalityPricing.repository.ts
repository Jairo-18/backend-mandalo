import { MunicipalityPricing } from '../entities/municipalityPricing.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class MunicipalityPricingRepository extends Repository<MunicipalityPricing> {
  constructor(dataSource: DataSource) {
    super(MunicipalityPricing, dataSource.createEntityManager());
  }
}
