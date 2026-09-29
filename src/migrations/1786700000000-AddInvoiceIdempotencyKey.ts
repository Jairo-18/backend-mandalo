import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotencia al crear pedidos: el front manda un UUID generado UNA vez por
 * intento de checkout (se mantiene igual si el usuario reintenta tras un
 * fallo ambiguo — timeout o corte justo después de que el backend ya creó
 * el pedido, típico en conexión rural intermitente). Sin esto, un reintento
 * de ese tipo creaba un SEGUNDO pedido idéntico (doble cobro, negocio recibe
 * el pedido duplicado). El índice único por (userId, idempotencyKey) hace
 * que el propio Postgres rechace la carrera si dos peticiones con la misma
 * clave llegan casi juntas — `invoice.service.ts` atrapa esa violación y
 * devuelve el pedido ya creado en vez de fallar.
 */
export class AddInvoiceIdempotencyKey1786700000000
  implements MigrationInterface
{
  name = 'AddInvoiceIdempotencyKey1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "idempotencyKey" varchar(64)`,
    );
    // NULL no choca consigo mismo en un índice único de Postgres — los
    // pedidos existentes (sin clave) no se ven afectados.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_invoice_userId_idempotencyKey" ON "invoice" ("userId", "idempotencyKey")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_invoice_userId_idempotencyKey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice" DROP COLUMN "idempotencyKey"`,
    );
  }
}
