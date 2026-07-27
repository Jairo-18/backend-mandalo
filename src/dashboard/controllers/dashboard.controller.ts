import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { DashboardUC } from '../useCases/dashboard.uc';
import { User } from '../../shared/entities/user.entity';
import { GetUser } from '../../shared/decorators/user.decorator';

/**
 * Contadores de los dashboards de admin y negocio en una sola petición cada
 * uno (antes eran varias peticiones de `perPage=1` solo para leer el total).
 */
@Controller('dashboard')
@ApiTags('Dashboard')
@UseGuards(AuthGuard())
export class DashboardController {
  constructor(private readonly _dashboardUC: DashboardUC) {}

  @Get('admin')
  async admin(@GetUser() user: User) {
    const data = await this._dashboardUC.adminStats(user);
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('business')
  async business(@GetUser() user: User) {
    const data = await this._dashboardUC.businessStats(user);
    return { statusCode: HttpStatus.OK, data };
  }
}
