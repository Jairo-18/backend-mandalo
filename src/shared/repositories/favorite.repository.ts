import { FavoriteBusiness, FavoriteProduct } from '../entities/favorite.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class FavoriteBusinessRepository extends Repository<FavoriteBusiness> {
  constructor(dataSource: DataSource) {
    super(FavoriteBusiness, dataSource.createEntityManager());
  }
}

@Injectable()
export class FavoriteProductRepository extends Repository<FavoriteProduct> {
  constructor(dataSource: DataSource) {
    super(FavoriteProduct, dataSource.createEntityManager());
  }
}
