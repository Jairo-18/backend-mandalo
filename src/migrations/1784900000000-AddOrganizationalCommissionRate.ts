import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Comisión por negocio (§42): `organizational.commissionOrderRate` — antes
 * era una tasa GLOBAL por variable de entorno (APP_COMMISSION_ORDER_RATE),
 * ahora cada negocio guarda la suya (el admin la sube de 5% a 12% a mano).
 * Default 5 para que los negocios existentes arranquen igual que antes.
 */
export class AddOrganizationalCommissionRate1784900000000
  implements MigrationInterface
{
  name = 'AddOrganizationalCommissionRate1784900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "commissionOrderRate" numeric(5,2) NOT NULL DEFAULT 5`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP COLUMN "commissionOrderRate"`,
    );
  }
}
