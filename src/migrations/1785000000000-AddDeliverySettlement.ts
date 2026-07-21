import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Liquidación de repartidores (§42): tabla `deliverySettlement`, espejo de
 * `businessSettlement` pero Mándalo LE PAGA al repartidor (`riderCut`) en vez
 * de cobrarle. Unidad única cobrable: quincena (1–15 / 16–fin de mes).
 */
export class AddDeliverySettlement1785000000000 implements MigrationInterface {
  name = 'AddDeliverySettlement1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "deliverySettlement" (
        "id" SERIAL PRIMARY KEY,
        "deliveryUserId" uuid NOT NULL,
        "periodType" character varying(10) NOT NULL,
        "periodStart" date NOT NULL,
        "periodEnd" date NOT NULL,
        "ordersCount" integer NOT NULL,
        "deliveryTotal" numeric(12,2) NOT NULL,
        "mandaloCut" numeric(12,2) NOT NULL,
        "riderCut" numeric(12,2) NOT NULL,
        "isPaid" boolean NOT NULL DEFAULT false,
        "paidAt" timestamptz,
        "notes" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz,
        CONSTRAINT "FK_deliverySettlement_deliveryUser" FOREIGN KEY ("deliveryUserId")
          REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_deliverySettlement_user_period"
        ON "deliverySettlement" ("deliveryUserId", "periodType", "periodStart")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "deliverySettlement"`);
  }
}
