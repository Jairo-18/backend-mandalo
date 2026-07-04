import { Tag } from '../entities/tag.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class TagRepository extends Repository<Tag> {
  constructor(dataSource: DataSource) {
    super(Tag, dataSource.createEntityManager());
  }
}
