import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { SettlementUC } from '../useCases/settlement.uc';
import {
  MarkSettlementDto,
  MySettlementPeriodsParamsDto,
  SettlementPeriodsParamsDto,
} from '../dtos/settlement.dto';
import { UpdateRecordResponseDto } from '../../shared/dtos/response.dto';
import { User } from '../../shared/entities/user.entity';
import { GetUser } from '../../shared/decorators/user.decorator';
import {
  GetSettlementPeriodsDocs,
  MarkSettlementDocs,
} from '../decorators/settlement.decorators';

/**
 * Cobros de la plataforma a los negocios (solo ADMIN, validado en el
 * service): cuánto facturó cada negocio por período y el check "cobrado".
 */
@Controller('settlement')
@ApiTags('Cobros a negocios')
@UseGuards(AuthGuard())
export class SettlementController {
  constructor(private readonly _settlementUC: SettlementUC) {}

  @Get('periods')
  @GetSettlementPeriodsDocs()
  async periods(
    @GetUser() user: User,
    @Query() params: SettlementPeriodsParamsDto,
  ) {
    const data = await this._settlementUC.periods(user, params);
    return { statusCode: HttpStatus.OK, data };
  }

  /** "Mis pedidos" del propio negocio (self-scoped, rol NEGO, solo lectura). */
  @Get('mine')
  async myPeriods(
    @GetUser() user: User,
    @Query() params: MySettlementPeriodsParamsDto,
  ) {
    const data = await this._settlementUC.myPeriods(user, params);
    return { statusCode: HttpStatus.OK, data };
  }

  @Patch('mark')
  @MarkSettlementDocs()
  async mark(
    @GetUser() user: User,
    @Body() body: MarkSettlementDto,
  ): Promise<UpdateRecordResponseDto> {
    const settlement = await this._settlementUC.mark(user, body);
    return {
      statusCode: HttpStatus.OK,
      message: settlement.isPaid
        ? 'Período marcado como cobrado'
        : 'Cobro deshecho',
    };
  }
}
