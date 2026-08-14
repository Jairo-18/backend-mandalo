/**
 * Códigos de rol tal como están sembrados en la tabla `roleType`.
 * Se resuelven a su uuid en tiempo de ejecución (por `code`), para no
 * acoplar el código a ids concretos de cada entorno.
 */
export enum RoleTypeCode {
  ADMIN = 'ADMIN', // Administrador (regional: solo ve/edita SU municipio)
  SUPERADMIN = 'SUPERADMIN', // Super administrador: sin alcance, ve/edita todo
  DELIVERY = 'DELI', // Repartidor
  BUSINESS = 'NEGO', // Negocio
  CLIENT = 'USER', // Usuario / cliente
}

/**
 * ADMIN y SUPERADMIN comparten todo lo que hoy es "panel admin" (rutas,
 * `@Roles(RoleTypeCode.ADMIN)`, chequeos manuales de servicio) — la única
 * diferencia entre los dos es el alcance por municipio, no el acceso en sí.
 * Reusar este helper en vez de repetir la comparación en cada servicio.
 */
export function isAdminRole(code?: RoleTypeCode | string | null): boolean {
  return code === RoleTypeCode.ADMIN || code === RoleTypeCode.SUPERADMIN;
}
