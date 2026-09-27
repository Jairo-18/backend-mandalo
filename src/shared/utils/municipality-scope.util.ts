import { SelectQueryBuilder } from 'typeorm';
import { User } from '../entities/user.entity';
import { RoleTypeCode } from '../roles/roleTypeCode.enum';

/** `true` solo para el rol SUPERADMIN — el único sin alcance por municipio. */
export function isSuperAdmin(user: Pick<User, 'roleType'>): boolean {
  return user.roleType?.code === RoleTypeCode.SUPERADMIN;
}

/**
 * Municipio "imposible" para un ADMIN regional sin municipio asignado: no
 * coincide con ningún registro, así que ve NADA (fail-closed) en vez de
 * TODO. Los ids de municipio son SERIAL (>= 1).
 */
export const NO_MUNICIPALITY_SCOPE = -1;

/**
 * Municipio con el que hay que escopar las consultas de este admin: `null`
 * para SUPERADMIN (sin alcance, ve todo) o su propio `municipalityId` para
 * un ADMIN regional — SIEMPRE calculado del ROL, nunca de que el campo esté
 * vacío (antes de tener SUPERADMIN, "sin municipio" se usaba como señal de
 * superadmin; ya no). Un ADMIN sin municipio (dato mal configurado: crear y
 * editar ya lo impiden) recibe `NO_MUNICIPALITY_SCOPE` → no ve nada.
 */
export function scopeMunicipalityIdFor(
  admin: Pick<User, 'roleType' | 'municipalityId'>,
): number | null {
  if (isSuperAdmin(admin)) return null;
  return admin.municipalityId ?? NO_MUNICIPALITY_SCOPE;
}

/**
 * Alcance regional de un ADMIN: reusa `User.municipalityId` (mismo campo que
 * cliente/domiciliario, sin migración) — con municipio asignado, un admin
 * solo ve los datos de ESE municipio; `null`/`undefined` = sin filtro (solo
 * lo devuelve `scopeMunicipalityIdFor` para SUPERADMIN). Se llama adentro de la rama ADMIN ya
 * existente de cada servicio, con el alias del join que llega al municipio
 * de esa entidad (directo o transitivo vía `organizational`/`deliveryUser`),
 * pasándole `scopeMunicipalityIdFor(admin)` (no `admin.municipalityId` a secas).
 */
export function applyMunicipalityScope(
  qb: SelectQueryBuilder<any>,
  municipalityAlias: string,
  adminMunicipalityId: number | null | undefined,
): void {
  if (adminMunicipalityId == null) return;
  qb.andWhere(`${municipalityAlias}.municipalityId = :scopeMunicipalityId`, {
    scopeMunicipalityId: adminMunicipalityId,
  });
}

/**
 * Mismo alcance para comparar un registro YA cargado (findOne/detalle) contra
 * el municipio del admin — para el enforcement por registro individual (no
 * solo listas): si no coincide, el caller debe tirar `ForbiddenException`.
 */
export function isOutsideMunicipalityScope(
  recordMunicipalityId: number | null | undefined,
  adminMunicipalityId: number | null | undefined,
): boolean {
  if (adminMunicipalityId == null) return false;
  return recordMunicipalityId !== adminMunicipalityId;
}
