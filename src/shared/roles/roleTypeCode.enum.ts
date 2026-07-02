/**
 * Códigos de rol tal como están sembrados en la tabla `roleType`.
 * Se resuelven a su uuid en tiempo de ejecución (por `code`), para no
 * acoplar el código a ids concretos de cada entorno.
 */
export enum RoleTypeCode {
  ADMIN = 'ADMIN', // Administrador
  DELIVERY = 'DELI', // Repartidor
  BUSINESS = 'NEGO', // Negocio
  CLIENT = 'USER', // Usuario / cliente
}
