import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import {
  CreatedRecordResponseDto,
  UpdateRecordResponseDto,
} from '../../shared/dtos/response.dto';

export function CreateInvoiceDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Crear pedido (cliente): elige negocio, dirección y productos' }),
    ApiCreatedResponse({ type: CreatedRecordResponseDto }),
  );
}

export function GetPaginatedInvoicesDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary:
        'Listado de pedidos según el rol (cliente=míos, negocio=de mi negocio, repartidor=asignados, admin=todos)',
    }),
    ApiOkResponse(),
  );
}

export function GetAvailableInvoicesDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Pedidos disponibles para tomar (repartidor): listos y sin asignar',
    }),
    ApiOkResponse(),
  );
}

export function FindOneInvoiceDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Detalle de un pedido (según acceso del rol)' }),
    ApiOkResponse(),
  );
}

export function TakeInvoiceDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'El repartidor toma un pedido disponible' }),
    ApiOkResponse(),
  );
}

export function ChangeInvoiceStateDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Cambiar el estado del pedido (aceptar, preparar, en ruta, entregar, cancelar)',
    }),
    ApiOkResponse({ type: UpdateRecordResponseDto }),
  );
}
