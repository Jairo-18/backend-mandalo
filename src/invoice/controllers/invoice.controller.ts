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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { InvoiceUC } from '../useCases/invoice.uc';
import {
  CreateInvoiceDto,
  DeliveryFeePreviewParamsDto,
  PaginatedInvoicesParamsDto,
  RejectPaymentDto,
  ReportDeliveryFailureDto,
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
  UploadPaymentProofDocs,
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

  // Tarifa del domicilio EN VIVO por distancia (checkout). Antes de :id
  // (literal, no numérico).
  @Get('delivery-fee')
  async deliveryFee(@Query() params: DeliveryFeePreviewParamsDto) {
    const data = await this._invoiceUC.previewDeliveryFee(params);
    return { statusCode: HttpStatus.OK, data };
  }

  // Antes de :id (literal, no numérico) para no chocar con ParseIntPipe.
  @Get('service-fee-summary')
  async serviceFeeSummary(@GetUser() user: User) {
    const data = await this._invoiceUC.serviceFeeSummary(user);
    return { statusCode: HttpStatus.OK, data };
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

  /**
   * El repartidor marca que llegó a la dirección de entrega (obligatorio
   * antes de poder marcar entregado). Avisa al cliente por socket + push.
   */
  @Post(':id/arrive')
  async arrive(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UpdateRecordResponseDto> {
    await this._invoiceUC.arrive(user, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Marcaste que llegaste. Se avisó al cliente.',
    };
  }

  /**
   * "¿Deseas esperar 5 minutos más?" — cliente o repartidor, cuando ya
   * pasaron los minutos de espera desde "En sitio" sin completar la
   * entrega. Cobra el segundo intento y reinicia el cronómetro.
   */
  @Post(':id/retry-after-timeout')
  async retryAfterTimeout(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UpdateRecordResponseDto> {
    await this._invoiceUC.retryAfterTimeout(user, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Se dieron minutos extra de espera.',
    };
  }

  /**
   * El repartidor reporta que NO PUDO entregar: motivo + foto obligatoria
   * del sitio/paquete. Único camino a FALL (ver TRANSITIONS en el service).
   */
  @Post(':id/report-failure')
  @UseInterceptors(FileInterceptor('photo'))
  async reportDeliveryFailure(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReportDeliveryFailureDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UpdateRecordResponseDto> {
    await this._invoiceUC.reportDeliveryFailure(
      user,
      id,
      file,
      body.failureReason,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Reportamos que no se pudo entregar. El cliente decidirá.',
    };
  }

  /**
   * Soporte de pago (métodos distintos a efectivo): el cliente sube la
   * foto/pantallazo de la transferencia y el negocio la ve en el detalle.
   */
  @Post(':id/payment-proof')
  @UseInterceptors(FileInterceptor('file'))
  @UploadPaymentProofDocs()
  async uploadPaymentProof(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this._invoiceUC.uploadPaymentProof(user, id, file);
    return {
      statusCode: HttpStatus.OK,
      message: 'Soporte de pago enviado al negocio',
      data,
    };
  }

  /**
   * El negocio le solicita al cliente el comprobante del pago (no cambia el
   * estado; solo notifica al cliente por socket + push).
   */
  @Post(':id/request-payment')
  async requestPayment(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UpdateRecordResponseDto> {
    await this._invoiceUC.requestPayment(user, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Le pedimos el comprobante del pago al cliente.',
    };
  }

  /**
   * El negocio RECHAZA el comprobante subido (borra la foto + guarda el motivo
   * y avisa al cliente para que vuelva a subir). No cambia el estado.
   */
  @Post(':id/reject-payment')
  async rejectPayment(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RejectPaymentDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._invoiceUC.rejectPayment(user, id, body.reason);
    return {
      statusCode: HttpStatus.OK,
      message: 'Comprobante rechazado. El cliente deberá subir uno nuevo.',
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
