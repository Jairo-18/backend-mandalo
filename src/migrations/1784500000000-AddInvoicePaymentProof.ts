import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soporte de pago del pedido: cuando el método NO es efectivo, el cliente
 * sube la foto/pantallazo de la transferencia y el negocio la ve en el
 * detalle para verificar el pago. Una sola imagen (se reemplaza si vuelve a
 * subir).
 */
export class AddInvoicePaymentProof1784500000000 implements MigrationInterface {
  name = 'AddInvoicePaymentProof1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "paymentProofUrl" character varying(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" DROP COLUMN "paymentProofUrl"`,
    );
  }
}
