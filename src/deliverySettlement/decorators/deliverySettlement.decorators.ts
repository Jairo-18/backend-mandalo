import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { UpdateRecordResponseDto } from '../../shared/dtos/response.dto';

export function GetDeliverySettlementPeriodsDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary:
        'Períodos entregados por un repartidor (quincena/mes/año) con el ' +
        'reparto Mándalo/repartidor y el estado del pago — solo ADMIN',
    }),
    ApiOkResponse(),
  );
}

export function MarkDeliverySettlementDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary:
        'Marcar una quincena como pagada al repartidor (guarda snapshot) o ' +
        'deshacer el pago — solo ADMIN',
    }),
    ApiOkResponse({ type: UpdateRecordResponseDto }),
  );
}
