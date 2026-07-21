import { Injectable } from '@nestjs/common';
import { SettlementService } from '../services/settlement.service';
import { User } from '../../shared/entities/user.entity';
import {
  MarkSettlementDto,
  MySettlementPeriodsParamsDto,
  SettlementPeriodsParamsDto,
} from '../dtos/settlement.dto';

@Injectable()
export class SettlementUC {
  constructor(private readonly _settlementService: SettlementService) {}

  periods(user: User, params: SettlementPeriodsParamsDto) {
    return this._settlementService.periods(user, params);
  }

  myPeriods(user: User, params: MySettlementPeriodsParamsDto) {
    return this._settlementService.myPeriods(user, params.periodType);
  }

  mark(user: User, dto: MarkSettlementDto) {
    return this._settlementService.mark(user, dto);
  }
}
