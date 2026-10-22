import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mandados ("Pedir un mandado"): un pedido SIN negocio — el cliente describe
 * qué hacer, dónde recoger (opcional) y dónde entregar, y ofrece cuánto paga
 * (mínimo: la tarifa por distancia de la app). Reusa `invoice` para que
 * funcionen igual el pool de "Disponibles", el chat, el seguimiento, las
 * reseñas y los cobros del repartidor.
 *
 * - `invoice.type`: 'ORDER' (pedido a un negocio, lo de siempre) | 'ERRAND'.
 * - `invoice.organizationalId` pasa a NULL-able (los mandados no tienen).
 * - `invoice.municipalityId`: municipio del mandado (el del cliente) — tarifa
 *   y alcance del admin regional, que en los pedidos sale del negocio.
 * - Recogida opcional (`pickup*`), descripción y el valor estimado de la
 *   compra que el repartidor adelanta (`errandPurchaseAmount`, el cliente se
 *   lo devuelve al recibir).
 * - `user`: datos de Nequi del REPARTIDOR (titular, número, llave, QR) — el
 *   cliente le paga el mandado directo a él (efectivo o Nequi).
 * - `deliverySettlement.collectedTotal`: lo que el repartidor YA cobró
 *   directo al cliente en mandados (en los pedidos, la plata la recibe el
 *   negocio y Mándalo le paga al repartidor; en un mandado es al revés).
 */
export class AddErrands1787500000000 implements MigrationInterface {
  name = 'AddErrands1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoice"
        ALTER COLUMN "organizationalId" DROP NOT NULL,
        ADD "type" varchar(10) NOT NULL DEFAULT 'ORDER',
        ADD "municipalityId" int REFERENCES "municipality"("id") ON DELETE SET NULL,
        ADD "pickupAddress" varchar(255),
        ADD "pickupLatitude" double precision,
        ADD "pickupLongitude" double precision,
        ADD "errandDescription" varchar(500),
        ADD "errandPurchaseAmount" numeric(12,2) NOT NULL DEFAULT 0,
        ADD CONSTRAINT "CHK_invoice_type" CHECK ("type" IN ('ORDER', 'ERRAND')),
        ADD CONSTRAINT "CHK_invoice_order_has_business"
          CHECK ("type" = 'ERRAND' OR "organizationalId" IS NOT NULL)
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_invoice_type_state" ON "invoice" ("type", "stateTypeId")`,
    );
    await queryRunner.query(`
      ALTER TABLE "user"
        ADD "paymentHolderName" varchar(120),
        ADD "nequiNumber" varchar(30),
        ADD "nequiKey" varchar(80),
        ADD "nequiQrUrl" varchar(500)
    `);
    await queryRunner.query(`
      ALTER TABLE "deliverySettlement"
        ADD "collectedTotal" numeric(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "deliverySettlement" DROP COLUMN "collectedTotal"`);
    await queryRunner.query(`
      ALTER TABLE "user"
        DROP COLUMN "paymentHolderName",
        DROP COLUMN "nequiNumber",
        DROP COLUMN "nequiKey",
        DROP COLUMN "nequiQrUrl"
    `);
    await queryRunner.query(`DROP INDEX "IDX_invoice_type_state"`);
    // Los mandados no tienen negocio: se borran antes de volver a NOT NULL.
    await queryRunner.query(`DELETE FROM "invoice" WHERE "type" = 'ERRAND'`);
    await queryRunner.query(`
      ALTER TABLE "invoice"
        DROP CONSTRAINT "CHK_invoice_order_has_business",
        DROP CONSTRAINT "CHK_invoice_type",
        DROP COLUMN "errandPurchaseAmount",
        DROP COLUMN "errandDescription",
        DROP COLUMN "pickupLongitude",
        DROP COLUMN "pickupLatitude",
        DROP COLUMN "pickupAddress",
        DROP COLUMN "municipalityId",
        DROP COLUMN "type",
        ALTER COLUMN "organizationalId" SET NOT NULL
    `);
  }
}
