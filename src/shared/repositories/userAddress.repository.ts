import { UserAddress } from '../entities/userAddress.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class UserAddressRepository extends Repository<UserAddress> {
  constructor(dataSource: DataSource) {
    super(UserAddress, dataSource.createEntityManager());
  }
}
