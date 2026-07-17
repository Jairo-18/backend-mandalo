import { Injectable } from '@nestjs/common';
import { SettlementService } from '../services/settlement.service';
import { User } from '../../shared/entities/user.entity';
import {
  MarkSettlementDto,
  SettlementPeriodsParamsDto,
} from '../dtos/settlement.dto';

@Injectable()
export class SettlementUC {
  constructor(private readonly _settlementService: SettlementService) {}

  periods(user: User, params: SettlementPeriodsParamsDto) {
    return this._settlementService.periods(user, params);
  }

  mark(user: User, dto: MarkSettlementDto) {
    return this._settlementService.mark(user, dto);
  }
}
