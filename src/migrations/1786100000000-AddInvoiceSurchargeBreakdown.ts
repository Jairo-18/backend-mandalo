import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Desglose de `invoice.deliverySurcharge` por tipo (reunión con el cliente
 * 2026-08-04: quiere ver "valor de viaje / recargo nocturno / clima /
 * demanda" por separado en Mis cobros del repartidor y en el panel admin,
 * no solo el total). Hasta ahora el motivo del recargo se calculaba en el
 * checkout pero se descartaba al crear el pedido — solo quedaba la suma.
 * El reintento YA tenía su propia columna (`retryFeeCharged`, §60) — estas 3
 * más `retryFeeCharged` SIEMPRE deben sumar `deliverySurcharge`.
 */
export class AddInvoiceSurchargeBreakdown1786100000000
  implements MigrationInterface
{
  name = 'AddInvoiceSurchargeBreakdown1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "nightSurcharge" numeric(12,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "weatherSurcharge" numeric(12,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "demandSurcharge" numeric(12,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoice" DROP COLUMN "demandSurcharge"`);
    await queryRunner.query(`ALTER TABLE "invoice" DROP COLUMN "weatherSurcharge"`);
    await queryRunner.query(`ALTER TABLE "invoice" DROP COLUMN "nightSurcharge"`);
  }
}
