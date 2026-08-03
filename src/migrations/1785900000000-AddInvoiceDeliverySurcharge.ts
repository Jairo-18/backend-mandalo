import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `invoice.deliverySurcharge`: suma de los recargos del Anexo I (§59 de
 * NOTAS — nocturno, condiciones climáticas, alta demanda, y más tarde el
 * cargo de "segundo intento") calculados al crear el pedido. Vive SEPARADO
 * de `deliveryFee` (que sigue siendo solo base+km extra) para que
 * `DeliveryPricingService.splitFee()` no lo confunda con el tramo "extra por
 * distancia" — este campo es 100% para el repartidor, siempre.
 */
export class AddInvoiceDeliverySurcharge1785900000000
  implements MigrationInterface
{
  name = 'AddInvoiceDeliverySurcharge1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "deliverySurcharge" numeric(12,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" DROP COLUMN "deliverySurcharge"`,
    );
  }
}
