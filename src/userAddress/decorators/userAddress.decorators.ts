import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import {
  CreatedRecordResponseDto,
  DeleteRecordResponseDto,
  UpdateRecordResponseDto,
} from '../../shared/dtos/response.dto';

export function ListMyAddressesDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Direcciones del usuario autenticado (la principal primero)',
    }),
    ApiOkResponse(),
  );
}

export function CreateUserAddressDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Crear dirección (del usuario autenticado)' }),
    ApiCreatedResponse({ type: CreatedRecordResponseDto }),
  );
}

export function UpdateUserAddressDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Editar dirección propia (isDefault: true la vuelve principal)',
    }),
    ApiOkResponse({ type: UpdateRecordResponseDto }),
  );
}

export function DeleteUserAddressDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Eliminar dirección propia' }),
    ApiOkResponse({ type: DeleteRecordResponseDto }),
  );
}
