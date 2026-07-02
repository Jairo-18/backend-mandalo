import { Department } from '../entities/department.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class DepartmentRepository extends Repository<Department> {
  constructor(dataSource: DataSource) {
    super(Department, dataSource.createEntityManager());
  }
}
