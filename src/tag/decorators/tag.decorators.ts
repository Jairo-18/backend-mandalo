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

export function CreateTagDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Crear etiqueta de negocio' }),
    ApiCreatedResponse({ type: CreatedRecordResponseDto }),
  );
}

export function GetPaginatedTagsDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Listado paginado de etiquetas' }),
    ApiOkResponse(),
  );
}

export function FindOneTagDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Obtener etiqueta por ID' }),
    ApiOkResponse(),
  );
}

export function UpdateTagDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Editar etiqueta' }),
    ApiOkResponse({ type: UpdateRecordResponseDto }),
  );
}

export function DeleteTagDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Eliminar etiqueta' }),
    ApiOkResponse({ type: DeleteRecordResponseDto }),
  );
}
