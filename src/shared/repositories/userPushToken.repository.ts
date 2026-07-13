import { UserPushToken } from '../entities/userPushToken.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class UserPushTokenRepository extends Repository<UserPushToken> {
  constructor(dataSource: DataSource) {
    super(UserPushToken, dataSource.createEntityManager());
  }
}
