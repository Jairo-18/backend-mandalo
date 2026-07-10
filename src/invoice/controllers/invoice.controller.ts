import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { InvoiceUC } from '../useCases/invoice.uc';
import {
  CreateInvoiceDto,
  PaginatedInvoicesParamsDto,
  UpdateInvoiceStateDto,
} from '../dtos/invoice.dto';
import {
  CreatedRecordResponseDto,
  UpdateRecordResponseDto,
} from '../../shared/dtos/response.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import { Invoice } from '../../shared/entities/invoice.entity';
import { User } from '../../shared/entities/user.entity';
import { GetUser } from '../../shared/decorators/user.decorator';
import {
  ChangeInvoiceStateDocs,
  CreateInvoiceDocs,
  FindOneInvoiceDocs,
  GetAvailableInvoicesDocs,
  GetPaginatedInvoicesDocs,
  TakeInvoiceDocs,
} from '../decorators/invoice.decorators';

/**
 * Pedidos (facturas). El alcance de cada operación depende del ROL del JWT:
 * el cliente crea y ve los suyos, el negocio gestiona los de su negocio, el
 * repartidor toma disponibles y mueve los que tomó. Ver §22 de NOTAS.
 */
@Controller('invoice')
@ApiTags('Pedidos')
@UseGuards(AuthGuard())
export class InvoiceController {
  constructor(private readonly _invoiceUC: InvoiceUC) {}

  @Post('create')
  @CreateInvoiceDocs()
  async create(
    @GetUser() user: User,
    @Body() body: CreateInvoiceDto,
  ): Promise<CreatedRecordResponseDto> {
    const invoice = await this._invoiceUC.create(user, body);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Pedido creado exitosamente',
      data: { rowId: String(invoice.id) },
    };
  }

  @Get('paginated')
  @GetPaginatedInvoicesDocs()
  async getPaginated(
    @GetUser() user: User,
    @Query() params: PaginatedInvoicesParamsDto,
  ): Promise<ResponsePaginationDto<Invoice>> {
    return this._invoiceUC.paginatedList(user, params);
  }

  // Tarifa del domicilio (para el checkout). Antes de :id (literal, no numérico).
  @Get('delivery-fee')
  deliveryFee() {
    return {
      statusCode: HttpStatus.OK,
      data: { deliveryFee: this._invoiceUC.getDeliveryFee() },
    };
  }

  // Antes de :id para que "available" no caiga en el ParseIntPipe.
  @Get('available')
  @GetAvailableInvoicesDocs()
  async getAvailable(
    @GetUser() user: User,
    @Query() params: PaginatedInvoicesParamsDto,
  ): Promise<ResponsePaginationDto<Invoice>> {
    return this._invoiceUC.availableForDelivery(user, params);
  }

  @Get(':id')
  @FindOneInvoiceDocs()
  async findOne(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const invoice = await this._invoiceUC.findOne(user, id);
    return {
      statusCode: HttpStatus.OK,
      data: invoice,
    };
  }

  @Post(':id/take')
  @TakeInvoiceDocs()
  async take(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UpdateRecordResponseDto> {
    await this._invoiceUC.take(user, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Tomaste el pedido. ¡En marcha!',
    };
  }

  @Patch(':id/state')
  @ChangeInvoiceStateDocs()
  async changeState(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateInvoiceStateDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._invoiceUC.changeState(user, id, body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Estado del pedido actualizado',
    };
  }
}
