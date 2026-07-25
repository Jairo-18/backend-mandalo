import { AppSettings } from '../entities/appSettings.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class AppSettingsRepository extends Repository<AppSettings> {
  constructor(dataSource: DataSource) {
    super(AppSettings, dataSource.createEntityManager());
  }
}
