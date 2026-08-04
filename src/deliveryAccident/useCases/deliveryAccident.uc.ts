import { Injectable } from '@nestjs/common';
import { DeliveryAccidentService } from '../services/deliveryAccident.service';
import { User } from '../../shared/entities/user.entity';
import {
  PaginatedAccidentsParamsDto,
  ReportAccidentDto,
} from '../dtos/deliveryAccident.dto';

@Injectable()
export class DeliveryAccidentUC {
  constructor(private readonly _service: DeliveryAccidentService) {}

  report(user: User, dto: ReportAccidentDto, files: Express.Multer.File[]) {
    return this._service.report(user, dto, files);
  }

  paginated(user: User, params: PaginatedAccidentsParamsDto) {
    return this._service.paginated(user, params);
  }

  unreviewedCount(user: User) {
    return this._service.unreviewedCount(user);
  }

  findOne(user: User, id: number) {
    return this._service.findOne(user, id);
  }

  review(user: User, id: number) {
    return this._service.review(user, id);
  }
}
