import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Liquidaciones de la plataforma a los negocios: una fila por negocio +
 * período (semana/mes/año, fecha local Colombia) con el snapshot de lo
 * cobrado (ventas, domicilios, tasas y comisión) y el check "cobrado".
 * Único por (negocio, tipo de período, inicio del período).
 */
export class AddBusinessSettlements1784400000000 implements MigrationInterface {
  name = 'AddBusinessSettlements1784400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "businessSettlement" (
        "id" SERIAL NOT NULL,
        "organizationalId" integer NOT NULL,
        "periodType" character varying(10) NOT NULL,
        "periodStart" date NOT NULL,
        "periodEnd" date NOT NULL,
        "ordersCount" integer NOT NULL,
        "salesTotal" numeric(12,2) NOT NULL,
        "deliveryTotal" numeric(12,2) NOT NULL,
        "orderCommissionRate" numeric(5,2) NOT NULL,
        "deliveryCommissionRate" numeric(5,2) NOT NULL,
        "commissionTotal" numeric(12,2) NOT NULL,
        "isPaid" boolean NOT NULL DEFAULT false,
        "paidAt" TIMESTAMP WITH TIME ZONE,
        "notes" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        CONSTRAINT "PK_businessSettlement" PRIMARY KEY ("id"),
        CONSTRAINT "FK_businessSettlement_organizational"
          FOREIGN KEY ("organizationalId")
          REFERENCES "organizational"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_businessSettlement_org_period"
        ON "businessSettlement" ("organizationalId", "periodType", "periodStart")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_businessSettlement_org_period"`);
    await queryRunner.query(`DROP TABLE "businessSettlement"`);
  }
}
