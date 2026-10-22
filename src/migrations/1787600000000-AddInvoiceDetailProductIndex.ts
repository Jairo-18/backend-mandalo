import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índice para el ranking del explorar ("más pedidos" en home, filas por
 * categoría y menú de la tienda): por cada producto se suman sus unidades
 * entregadas con `invoiceDetail.productId`, que no tenía índice (cada
 * producto recorría la tabla completa de renglones de pedidos).
 */
export class AddInvoiceDetailProductIndex1787600000000 implements MigrationInterface {
  name = 'AddInvoiceDetailProductIndex1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_invoiceDetail_productId" ON "invoiceDetail" ("productId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invoiceDetail_productId"`);
  }
}
