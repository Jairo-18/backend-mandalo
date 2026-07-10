import { Injectable } from '@nestjs/common';
import { InvoiceService } from '../services/invoice.service';
import { User } from '../../shared/entities/user.entity';
import {
  CreateInvoiceDto,
  PaginatedInvoicesParamsDto,
  UpdateInvoiceStateDto,
} from '../dtos/invoice.dto';

@Injectable()
export class InvoiceUC {
  constructor(private readonly _invoiceService: InvoiceService) {}

  getDeliveryFee() {
    return this._invoiceService.getDeliveryFee();
  }

  create(user: User, dto: CreateInvoiceDto) {
    return this._invoiceService.create(user, dto);
  }

  findOne(user: User, id: number) {
    return this._invoiceService.findOne(user, id);
  }

  paginatedList(user: User, params: PaginatedInvoicesParamsDto) {
    return this._invoiceService.paginatedList(user, params);
  }

  availableForDelivery(user: User, params: PaginatedInvoicesParamsDto) {
    return this._invoiceService.availableForDelivery(user, params);
  }

  take(user: User, id: number) {
    return this._invoiceService.take(user, id);
  }

  changeState(user: User, id: number, dto: UpdateInvoiceStateDto) {
    return this._invoiceService.changeState(user, id, dto);
  }
}
