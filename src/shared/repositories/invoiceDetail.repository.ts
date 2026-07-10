import { InvoiceDetail } from '../entities/invoiceDetail.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class InvoiceDetailRepository extends Repository<InvoiceDetail> {
  constructor(dataSource: DataSource) {
    super(InvoiceDetail, dataSource.createEntityManager());
  }
}
