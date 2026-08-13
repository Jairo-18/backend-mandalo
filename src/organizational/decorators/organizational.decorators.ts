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

export function CreateOrganizationalDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Crear negocio' }),
    ApiCreatedResponse({ type: CreatedRecordResponseDto }),
  );
}

export function ResolveMapsUrlDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary:
        'Resuelve un link acortado "Compartir" de Google Maps (sigue la redirección del lado del servidor)',
    }),
    ApiOkResponse(),
  );
}

export function SearchAddressDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary:
        'Busca una dirección/lugar (Nominatim/OpenStreetMap) para el selector de ubicación',
    }),
    ApiOkResponse(),
  );
}

export function ReverseGeocodeDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Dirección legible para unas coordenadas (pin movido en el mapa)',
    }),
    ApiOkResponse(),
  );
}

export function GetPaginatedOrganizationalsDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Listado paginado de negocios' }),
    ApiOkResponse(),
  );
}

export function FindMineOrganizationalDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Negocio del usuario autenticado (rol NEGO)' }),
    ApiOkResponse(),
  );
}

export function UpdateMineOrganizationalDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary:
        'Editar el negocio propio (rol NEGO; ignora dueño/cuenta/estado)',
    }),
    ApiOkResponse({ type: UpdateRecordResponseDto }),
  );
}

export function FindOneOrganizationalDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Obtener negocio por ID' }),
    ApiOkResponse(),
  );
}

export function UpdateOrganizationalDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Editar negocio' }),
    ApiOkResponse({ type: UpdateRecordResponseDto }),
  );
}

export function DeleteOrganizationalDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Eliminar negocio' }),
    ApiOkResponse({ type: DeleteRecordResponseDto }),
  );
}

export function UploadLogoDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Subir/reemplazar el logo del negocio' }),
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

export function UploadPaymentQrDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Subir/reemplazar el QR de Bancolombia del negocio',
    }),
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
    ApiOkResponse({ type: UpdateRecordResponseDto }),
  );
}

export function RemoveLogoDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: 'Quitar el logo del negocio (opcional)' }),
    ApiOkResponse({ type: DeleteRecordResponseDto }),
  );
}

export function RemovePaymentQrDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Quitar el QR de Bancolombia del negocio (opcional)',
    }),
    ApiOkResponse({ type: DeleteRecordResponseDto }),
  );
}
