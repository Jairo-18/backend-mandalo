/**
 * Códigos de estado de pedido tal como están sembrados en la tabla
 * `stateType` (se digitan a mano, igual que paidType). Se resuelven a su id
 * en tiempo de ejecución para no acoplar el código a ids de cada entorno.
 */
export enum StateTypeCode {
  PENDING = 'PEND', // Pendiente (recién creado por el cliente)
  ACCEPTED = 'ACEP', // Aceptado por el negocio
  PREPARING = 'PREP', // En preparación
  ON_ROUTE = 'RUTA', // En ruta (el repartidor lo recogió)
  DELIVERED = 'ENTR', // Entregado
  CANCELLED = 'CANC', // Cancelado
}
