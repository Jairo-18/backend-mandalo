import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Segundo intento de entrega" (Anexo I / Art. 31-32 de los Términos y
 * Condiciones, NOTAS §59): nuevo estado `FALL` (entrega fallida, esperando
 * decisión del cliente) + columnas de auditoría en `invoice`. Solo se
 * permite UN reintento por pedido (`retryCount` tope 1, validado en el
 * service, no acá). El estado se inserta por migración (no "a mano" como
 * los demás `stateType`, NOTAS §1) porque la máquina de estados del backend
 * depende de que exista desde el arranque.
 */
export class AddInvoiceDeliveryFailureAndRetry1786000000000
  implements MigrationInterface
{
  name = 'AddInvoiceDeliveryFailureAndRetry1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "stateType" ("code", "name")
      VALUES ('FALL', 'Entrega fallida')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "deliveryFailReason" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "deliveryFailedAt" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "retryCount" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "retryFeeCharged" numeric(12,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "retryAcceptedAt" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" DROP COLUMN "retryAcceptedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice" DROP COLUMN "retryFeeCharged"`,
    );
    await queryRunner.query(`ALTER TABLE "invoice" DROP COLUMN "retryCount"`);
    await queryRunner.query(
      `ALTER TABLE "invoice" DROP COLUMN "deliveryFailedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice" DROP COLUMN "deliveryFailReason"`,
    );
    await queryRunner.query(`DELETE FROM "stateType" WHERE "code" = 'FALL'`);
  }
}
