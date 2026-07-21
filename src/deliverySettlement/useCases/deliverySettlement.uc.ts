import { Injectable } from '@nestjs/common';
import { DeliverySettlementService } from '../services/deliverySettlement.service';
import { User } from '../../shared/entities/user.entity';
import {
  DeliverySettlementPeriodsParamsDto,
  MarkDeliverySettlementDto,
  MyDeliverySettlementPeriodsParamsDto,
} from '../dtos/deliverySettlement.dto';

@Injectable()
export class DeliverySettlementUC {
  constructor(private readonly _deliverySettlementService: DeliverySettlementService) {}

  periods(user: User, params: DeliverySettlementPeriodsParamsDto) {
    return this._deliverySettlementService.periods(user, params);
  }

  myPeriods(user: User, params: MyDeliverySettlementPeriodsParamsDto) {
    return this._deliverySettlementService.myPeriods(user, params.periodType);
  }

  mark(user: User, dto: MarkDeliverySettlementDto) {
    return this._deliverySettlementService.mark(user, dto);
  }
}
