import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Snapshot del reparto Mándalo/repartidor de `deliveryFee` en el momento de
 * crear el pedido — antes se reconstruía en cada liquidación llamando
 * `DeliveryPricingService.splitFee(deliveryFee)` con la configuración
 * VIGENTE (no la que regía cuando se creó el pedido), así que si el admin
 * ajusta `APP_DELIVERY_BASE_FEE`/`APP_DELIVERY_BASE_MANDALO_CUT`/
 * `APP_DELIVERY_EXTRA_MANDALO_RATE` más adelante, toda liquidación vieja sin
 * marcar pagada cambiaba de monto sola. Ahora se guarda en la factura al
 * crearla y `deliverySettlement` ya no recalcula.
 */
export class AddInvoiceDeliverySplit1786400000000
  implements MigrationInterface
{
  name = 'AddInvoiceDeliverySplit1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "deliveryMandaloCut" numeric(12,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "deliveryRiderCut" numeric(12,2) NOT NULL DEFAULT 0`,
    );

    // Backfill de pedidos existentes: reconstruye el reparto UNA sola vez con
    // la fórmula/config vigente HOY (la misma que ya se usaba en vivo hasta
    // este momento) — de aquí en adelante queda congelado por pedido, no se
    // vuelve a recalcular al liquidar.
    const baseFee =
      parseFloat(process.env.APP_DELIVERY_BASE_FEE as string) || 6000;
    const baseMandaloCut =
      parseFloat(process.env.APP_DELIVERY_BASE_MANDALO_CUT as string) || 1000;
    const extraMandaloRate =
      parseFloat(process.env.APP_DELIVERY_EXTRA_MANDALO_RATE as string) || 16;

    await queryRunner.query(
      `UPDATE "invoice" i
       SET "deliveryMandaloCut" = calc.mandalo_cut,
           "deliveryRiderCut" = round((i."deliveryFee" - calc.mandalo_cut)::numeric, 2)
       FROM (
         SELECT id,
           CASE
             WHEN "deliveryFee" <= $1 THEN LEAST($2, "deliveryFee")
             ELSE round(($2 + ("deliveryFee" - $1) * $3 / 100)::numeric, 2)
           END AS mandalo_cut
         FROM "invoice"
       ) calc
       WHERE i.id = calc.id`,
      [baseFee, baseMandaloCut, extraMandaloRate],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" DROP COLUMN "deliveryRiderCut"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice" DROP COLUMN "deliveryMandaloCut"`,
    );
  }
}
