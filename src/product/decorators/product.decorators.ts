import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import {
  CreatedRecordResponseDto,
  DeleteRecordResponseDto,
  UpdateRecordResponseDto,
} from '../../shared/dtos/response.dto';

export function CreateProductDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Crear producto (del negocio del usuario)' }),
    ApiCreatedResponse({ type: CreatedRecordResponseDto }),
  );
}

export function GetPaginatedProductsDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Listado paginado de productos del negocio del usuario',
    }),
    ApiOkResponse(),
  );
}

export function FindOneProductDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Obtener producto por ID (del negocio propio)' }),
    ApiOkResponse(),
  );
}

export function UpdateProductDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Editar producto (del negocio propio)' }),
    ApiOkResponse({ type: UpdateRecordResponseDto }),
  );
}

export function DeleteProductDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Eliminar producto (del negocio propio)' }),
    ApiOkResponse({ type: DeleteRecordResponseDto }),
  );
}

export function AddProductImageDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Agregar una foto al producto' }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          file: { type: 'string', format: 'binary' },
        },
        required: ['file'],
      },
    }),
    ApiOkResponse(),
  );
}

export function RemoveProductImageDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Quitar una foto del producto' }),
    ApiOkResponse(),
  );
}
