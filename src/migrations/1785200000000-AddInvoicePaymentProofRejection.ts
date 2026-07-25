import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Motivo de rechazo del comprobante de pago: `invoice.paymentProofRejectedReason`
 * (varchar 255, nullable). Cuando el negocio rechaza el soporte (foto que no
 * corresponde, etc.) se borra la foto y se guarda el motivo; el cliente lo ve y
 * vuelve a subir. Idempotente (`IF NOT EXISTS`) por precaución.
 */
export class AddInvoicePaymentProofRejection1785200000000
  implements MigrationInterface
{
  name = 'AddInvoicePaymentProofRejection1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD COLUMN IF NOT EXISTS "paymentProofRejectedReason" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" DROP COLUMN IF EXISTS "paymentProofRejectedReason"`,
    );
  }
}
