import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Códigos de verificación del flujo físico del pedido:
 * - pickupCode: el repartidor se lo dicta al negocio al recoger (el negocio
 *   lo digita para poder despachar).
 * - deliveryCode: el cliente se lo dicta al repartidor al recibir (el
 *   repartidor lo digita para poder marcar entregado).
 */
export class AddInvoiceVerificationCodes1784000000000
  implements MigrationInterface
{
  name = 'AddInvoiceVerificationCodes1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "pickupCode" character varying(4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "deliveryCode" character varying(4)`,
    );
    // Pedidos existentes: código aleatorio para que el flujo no quede cojo.
    await queryRunner.query(
      `UPDATE "invoice" SET
         "pickupCode" = lpad(floor(random() * 10000)::text, 4, '0'),
         "deliveryCode" = lpad(floor(random() * 10000)::text, 4, '0')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoice" DROP COLUMN "deliveryCode"`);
    await queryRunner.query(`ALTER TABLE "invoice" DROP COLUMN "pickupCode"`);
  }
}
