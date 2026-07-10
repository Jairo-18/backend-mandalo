import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';

export function GetExploreFiltersDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary:
        'Filtros del explorar: etiquetas de negocios visibles y categorías en uso',
    }),
    ApiOkResponse(),
  );
}

export function GetPaginatedExploreOrganizationalsDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary:
        'Listado de negocios para el cliente (activos y con productos activos)',
    }),
    ApiOkResponse(),
  );
}

export function FindExploreOrganizationalDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Detalle de un negocio para el cliente (+ sus categorías en uso)',
    }),
    ApiOkResponse(),
  );
}

export function GetPaginatedExploreAllProductsDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary:
        'Búsqueda global de productos (todos los negocios visibles, con el negocio embebido)',
    }),
    ApiOkResponse(),
  );
}

export function GetPaginatedExploreProductsDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Productos activos de un negocio (vista del cliente)',
    }),
    ApiOkResponse(),
  );
}
