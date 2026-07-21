/**
 * Agrupación de las liquidaciones (negocios Y repartidores, §42): la
 * QUINCENA es la única unidad "cobrable" (se marca pagada/pendiente); mes y
 * año son vistas de resumen que se arman sumando sus quincenas — no se
 * guardan aparte ni se marcan por sí solas.
 */
export enum SettlementPeriodType {
  QUINCENA = 'quincena',
  MONTH = 'month',
  YEAR = 'year',
}
