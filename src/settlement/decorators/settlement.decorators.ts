import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { UpdateRecordResponseDto } from '../../shared/dtos/response.dto';

export function GetSettlementPeriodsDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary:
        'Períodos facturados de un negocio (semana/mes/año) con la comisión ' +
        'a cobrar y el estado del cobro — solo ADMIN',
    }),
    ApiOkResponse(),
  );
}

export function MarkSettlementDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary:
        'Marcar un período como cobrado (guarda snapshot de montos) o ' +
        'deshacer el cobro — solo ADMIN',
    }),
    ApiOkResponse({ type: UpdateRecordResponseDto }),
  );
}
