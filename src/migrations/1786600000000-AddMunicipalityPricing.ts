import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tarifas por municipio (antes: variables de entorno globales).
 *
 * 1. Tabla `municipalityPricing`: la fila con `municipalityId` NULL es la
 *    tarifa general; las demás, tarifas propias de un municipio. Un solo
 *    registro por municipio y una sola general (índice único sobre
 *    COALESCE, porque un UNIQUE normal deja pasar varios NULL en Postgres).
 * 2. Siembra la tarifa general con los valores vigentes hasta hoy (los de
 *    `.env.development`/`.env.production`, iguales al Anexo I de los TYC).
 *    Ningún municipio arranca con tarifa propia: todos heredan la general
 *    hasta que un admin la personalice.
 * 3. `invoice.retryFee` / `invoice.deliveryWaitMinutes`: el cargo del
 *    segundo intento y los minutos de espera se CONGELAN en el pedido al
 *    crearlo (se le informan al cliente antes de confirmar) — si el admin
 *    cambia la tarifa con pedidos en curso, esos pedidos no cambian. Los
 *    pedidos existentes se rellenan con lo que regía ($6.000 / 5 min).
 */
export class AddMunicipalityPricing1786600000000 implements MigrationInterface {
  name = 'AddMunicipalityPricing1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "municipalityPricing" (
        "id" SERIAL NOT NULL,
        "municipalityId" integer,
        "baseKm" numeric(6,2) NOT NULL,
        "baseFee" numeric(12,2) NOT NULL,
        "baseMandaloCut" numeric(12,2) NOT NULL,
        "extraKmRate" numeric(12,2) NOT NULL,
        "extraMandaloRate" numeric(5,2) NOT NULL,
        "nightSurcharge" numeric(12,2) NOT NULL,
        "nightStartTime" character varying(5) NOT NULL,
        "nightEndTime" character varying(5) NOT NULL,
        "weatherSurcharge" numeric(12,2) NOT NULL,
        "weatherHeavyRainMm" numeric(6,2) NOT NULL,
        "demandSurcharge" numeric(12,2) NOT NULL,
        "demandThreshold" integer NOT NULL,
        "retryFee" numeric(12,2) NOT NULL,
        "waitMinutes" integer NOT NULL,
        "serviceFeePercent" numeric(5,2) NOT NULL,
        "serviceFeeCap" numeric(12,2) NOT NULL,
        "updatedById" uuid,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        CONSTRAINT "PK_municipalityPricing" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_municipalityPricing_municipality" ON "municipalityPricing" (COALESCE("municipalityId", 0))`,
    );
    await queryRunner.query(
      `ALTER TABLE "municipalityPricing" ADD CONSTRAINT "FK_municipalityPricing_municipality" FOREIGN KEY ("municipalityId") REFERENCES "municipality"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "municipalityPricing" ADD CONSTRAINT "FK_municipalityPricing_updatedBy" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // Tarifa general = lo que regía por variables de entorno.
    await queryRunner.query(`
      INSERT INTO "municipalityPricing" (
        "municipalityId", "baseKm", "baseFee", "baseMandaloCut",
        "extraKmRate", "extraMandaloRate", "nightSurcharge",
        "nightStartTime", "nightEndTime", "weatherSurcharge",
        "weatherHeavyRainMm", "demandSurcharge", "demandThreshold",
        "retryFee", "waitMinutes", "serviceFeePercent", "serviceFeeCap"
      ) VALUES (
        NULL, 4, 6000, 1000,
        3000, 16, 4500,
        '23:00', '05:30', 2500,
        7.5, 2500, 30,
        6000, 5, 5, 5000
      )`);

    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "retryFee" numeric(12,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "deliveryWaitMinutes" integer NOT NULL DEFAULT 5`,
    );
    await queryRunner.query(`UPDATE "invoice" SET "retryFee" = 6000`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" DROP COLUMN "deliveryWaitMinutes"`,
    );
    await queryRunner.query(`ALTER TABLE "invoice" DROP COLUMN "retryFee"`);
    await queryRunner.query(
      `ALTER TABLE "municipalityPricing" DROP CONSTRAINT "FK_municipalityPricing_updatedBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "municipalityPricing" DROP CONSTRAINT "FK_municipalityPricing_municipality"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_municipalityPricing_municipality"`,
    );
    await queryRunner.query(`DROP TABLE "municipalityPricing"`);
  }
}
