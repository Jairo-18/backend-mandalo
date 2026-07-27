import { Injectable } from '@nestjs/common';
import {
  AdminDashboardStats,
  BusinessDashboardStats,
  DashboardService,
} from '../services/dashboard.service';
import { User } from '../../shared/entities/user.entity';

@Injectable()
export class DashboardUC {
  constructor(private readonly _dashboardService: DashboardService) {}

  adminStats(user: User): Promise<AdminDashboardStats> {
    return this._dashboardService.adminStats(user);
  }

  businessStats(user: User): Promise<BusinessDashboardStats> {
    return this._dashboardService.businessStats(user);
  }
}
