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

export function CreateCategoryTypeDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Crear categoría de producto' }),
    ApiCreatedResponse({ type: CreatedRecordResponseDto }),
  );
}

export function GetPaginatedCategoryTypesDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Listado paginado de categorías' }),
    ApiOkResponse(),
  );
}

export function FindOneCategoryTypeDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Obtener categoría por ID' }),
    ApiOkResponse(),
  );
}

export function UpdateCategoryTypeDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Editar categoría' }),
    ApiOkResponse({ type: UpdateRecordResponseDto }),
  );
}

export function DeleteCategoryTypeDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Eliminar categoría' }),
    ApiOkResponse({ type: DeleteRecordResponseDto }),
  );
}
