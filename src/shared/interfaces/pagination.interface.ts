/**
 * Interfaces genéricas de paginación reutilizables en todos los módulos.
 * La construcción concreta de la respuesta se hace con `PageMetaDto` y
 * `ResponsePaginationDto` (src/shared/dtos/pagination.dto.ts), estas
 * interfaces sirven para tipar parámetros y respuestas en services/UCs.
 */

import { OrderConst } from '../constants/order.constants';

/** Parámetros base de una consulta paginada. */
export interface IPaginationParams {
  page: number;
  perPage: number;
  search?: string;
  order?: OrderConst;
}

/** Metadatos de una página de resultados. */
export interface IPageMeta {
  page: number;
  perPage: number;
  total: number;
  pageCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/** Respuesta paginada genérica: lista de items + metadatos. */
export interface IPaginatedResponse<T> {
  data: T[];
  pagination: IPageMeta;
}

/** Tupla [items, total] tal como la devuelve `getManyAndCount()` de TypeORM. */
export type PaginatedTuple<T> = [T[], number];
