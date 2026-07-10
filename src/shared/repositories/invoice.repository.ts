import { Invoice } from '../entities/invoice.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class InvoiceRepository extends Repository<Invoice> {
  constructor(dataSource: DataSource) {
    super(Invoice, dataSource.createEntityManager());
  }
}
