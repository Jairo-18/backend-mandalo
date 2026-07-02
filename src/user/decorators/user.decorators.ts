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

export function CreateUserDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Crear usuario (admin)' }),
    ApiCreatedResponse({ type: CreatedRecordResponseDto }),
  );
}

export function RegisterUserDocs(kind = 'usuario') {
  return applyDecorators(
    ApiOperation({ summary: `Auto-registro de ${kind} (público)` }),
    ApiCreatedResponse({ type: CreatedRecordResponseDto }),
  );
}

export function GetPaginatedUsersDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Listado paginado de usuarios' }),
    ApiOkResponse(),
  );
}

export function FindOneUserDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Obtener usuario por ID' }),
    ApiOkResponse(),
  );
}

export function UpdateUserDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Editar usuario' }),
    ApiOkResponse({ type: UpdateRecordResponseDto }),
  );
}

export function DeleteUserDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Eliminar usuario' }),
    ApiOkResponse({ type: DeleteRecordResponseDto }),
  );
}
