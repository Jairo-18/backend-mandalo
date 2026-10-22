import { Promotion, PromotionProduct } from '../entities/promotion.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class PromotionRepository extends Repository<Promotion> {
  constructor(dataSource: DataSource) {
    super(Promotion, dataSource.createEntityManager());
  }
}

@Injectable()
export class PromotionProductRepository extends Repository<PromotionProduct> {
  constructor(dataSource: DataSource) {
    super(PromotionProduct, dataSource.createEntityManager());
  }
}
