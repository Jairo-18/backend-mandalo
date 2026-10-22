import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Publicidad de los negocios: "Mis publicidades".
 *
 * - `promotion`: banner 16:9 + título + mensaje + precio de la promo, con
 *   vigencia (máx. 30 días) y hasta 5 activas por negocio (regla del
 *   servicio). Se publica sola; el admin puede ocultarla (`hiddenByAdmin`).
 * - `promotionProduct`: qué productos del catálogo incluye y cuántos de cada
 *   uno (2× hamburguesa + 1× gaseosa).
 * - `invoiceDetail.promotionId` + `itemsDescription`: la promo entra al
 *   pedido como UNA línea a su precio, con el contenido congelado en texto
 *   para que el negocio sepa qué preparar aunque después edite la promo.
 */
export class AddPromotions1787300000000 implements MigrationInterface {
  name = 'AddPromotions1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "promotion" (
        "id" SERIAL PRIMARY KEY,
        "organizationalId" int NOT NULL REFERENCES "organizational"("id") ON DELETE CASCADE,
        "title" varchar(80) NOT NULL,
        "message" varchar(200),
        "imageUrl" varchar(500),
        "price" numeric(12,2) NOT NULL,
        "startsAt" timestamptz NOT NULL DEFAULT now(),
        "endsAt" timestamptz NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "hiddenByAdmin" boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_promotion_org" ON "promotion" ("organizationalId", "endsAt")`,
    );
    await queryRunner.query(`
      CREATE TABLE "promotionProduct" (
        "id" SERIAL PRIMARY KEY,
        "promotionId" int NOT NULL REFERENCES "promotion"("id") ON DELETE CASCADE,
        "productId" int NOT NULL REFERENCES "product"("id") ON DELETE CASCADE,
        "quantity" int NOT NULL DEFAULT 1,
        CONSTRAINT "CHK_promotionProduct_quantity" CHECK ("quantity" BETWEEN 1 AND 20),
        CONSTRAINT "UQ_promotionProduct" UNIQUE ("promotionId", "productId")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "invoiceDetail"
        ADD "promotionId" int REFERENCES "promotion"("id") ON DELETE SET NULL,
        ADD "itemsDescription" varchar(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoiceDetail" DROP COLUMN "promotionId", DROP COLUMN "itemsDescription"`,
    );
    await queryRunner.query(`DROP TABLE "promotionProduct"`);
    await queryRunner.query(`DROP TABLE "promotion"`);
  }
}
