import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tarifa de servicio por TRAMOS en vez de % con tope (pedido del usuario,
 * 2026-10-08: "siempre me piden cambiarla"). Tres valores por fila de tarifa:
 *   - `serviceFeeThreshold`: umbral sobre el subtotal de los productos (COP).
 *   - `serviceFeeBelow`:     tarifa fija si el subtotal es MENOR al umbral.
 *   - `serviceFeeAbove`:     tarifa fija si el subtotal es IGUAL O MAYOR.
 * Arranca en 50.000 / 800 / 1.600 en todas las filas (decisión del usuario).
 * Los pedidos ya creados conservan su `invoice.serviceFee` (no se recalcula).
 */
export class ServiceFeeTiers1786900000000 implements MigrationInterface {
  name = 'ServiceFeeTiers1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "municipalityPricing"
        ADD "serviceFeeThreshold" numeric(12,2) NOT NULL DEFAULT 50000,
        ADD "serviceFeeBelow" numeric(12,2) NOT NULL DEFAULT 800,
        ADD "serviceFeeAbove" numeric(12,2) NOT NULL DEFAULT 1600
    `);
    // Sin DEFAULT en adelante: igual que el resto de columnas tarifarias, las
    // filas nuevas las llena el service con los valores heredados.
    await queryRunner.query(`
      ALTER TABLE "municipalityPricing"
        ALTER COLUMN "serviceFeeThreshold" DROP DEFAULT,
        ALTER COLUMN "serviceFeeBelow" DROP DEFAULT,
        ALTER COLUMN "serviceFeeAbove" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "municipalityPricing"
        DROP COLUMN "serviceFeePercent",
        DROP COLUMN "serviceFeeCap"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "municipalityPricing"
        ADD "serviceFeePercent" numeric(5,2) NOT NULL DEFAULT 5,
        ADD "serviceFeeCap" numeric(12,2) NOT NULL DEFAULT 5000
    `);
    await queryRunner.query(`
      ALTER TABLE "municipalityPricing"
        ALTER COLUMN "serviceFeePercent" DROP DEFAULT,
        ALTER COLUMN "serviceFeeCap" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "municipalityPricing"
        DROP COLUMN "serviceFeeThreshold",
        DROP COLUMN "serviceFeeBelow",
        DROP COLUMN "serviceFeeAbove"
    `);
  }
}
