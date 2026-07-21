import { Body, Controller, Get, HttpStatus, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { DeliverySettlementUC } from '../useCases/deliverySettlement.uc';
import {
  DeliverySettlementPeriodsParamsDto,
  MarkDeliverySettlementDto,
  MyDeliverySettlementPeriodsParamsDto,
} from '../dtos/deliverySettlement.dto';
import { UpdateRecordResponseDto } from '../../shared/dtos/response.dto';
import { User } from '../../shared/entities/user.entity';
import { GetUser } from '../../shared/decorators/user.decorator';
import {
  GetDeliverySettlementPeriodsDocs,
  MarkDeliverySettlementDocs,
} from '../decorators/deliverySettlement.decorators';

/**
 * Pagos de la plataforma a los repartidores (solo ADMIN, validado en el
 * service): cuánto le corresponde a cada repartidor por período y el check
 * "pagado". Espejo de /settlement pero en la dirección contraria de la plata.
 */
@Controller('delivery-settlement')
@ApiTags('Pagos a repartidores')
@UseGuards(AuthGuard())
export class DeliverySettlementController {
  constructor(private readonly _deliverySettlementUC: DeliverySettlementUC) {}

  @Get('periods')
  @GetDeliverySettlementPeriodsDocs()
  async periods(
    @GetUser() user: User,
    @Query() params: DeliverySettlementPeriodsParamsDto,
  ) {
    const data = await this._deliverySettlementUC.periods(user, params);
    return { statusCode: HttpStatus.OK, data };
  }

  /** "Mis pedidos" del propio repartidor (self-scoped, solo lectura). */
  @Get('mine')
  async myPeriods(
    @GetUser() user: User,
    @Query() params: MyDeliverySettlementPeriodsParamsDto,
  ) {
    const data = await this._deliverySettlementUC.myPeriods(user, params);
    return { statusCode: HttpStatus.OK, data };
  }

  @Patch('mark')
  @MarkDeliverySettlementDocs()
  async mark(
    @GetUser() user: User,
    @Body() body: MarkDeliverySettlementDto,
  ): Promise<UpdateRecordResponseDto> {
    const settlement = await this._deliverySettlementUC.mark(user, body);
    return {
      statusCode: HttpStatus.OK,
      message: settlement.isPaid ? 'Quincena marcada como pagada' : 'Pago deshecho',
    };
  }
}
