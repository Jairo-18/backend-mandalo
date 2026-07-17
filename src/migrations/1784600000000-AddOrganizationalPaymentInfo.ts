import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Datos de pago del negocio (para que el cliente transfiera cuando el método
 * NO es efectivo): titular, número y llave de Nequi, cuenta Bancolombia y la
 * imagen del QR de Bancolombia. Se muestran en el checkout según el método
 * elegido. Todos opcionales: el negocio llena los que tenga.
 */
export class AddOrganizationalPaymentInfo1784600000000
  implements MigrationInterface
{
  name = 'AddOrganizationalPaymentInfo1784600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizational"
        ADD "paymentHolderName" character varying(120),
        ADD "nequiNumber" character varying(30),
        ADD "nequiKey" character varying(80),
        ADD "bancolombiaAccount" character varying(60),
        ADD "bancolombiaQrUrl" character varying(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizational"
        DROP COLUMN "paymentHolderName",
        DROP COLUMN "nequiNumber",
        DROP COLUMN "nequiKey",
        DROP COLUMN "bancolombiaAccount",
        DROP COLUMN "bancolombiaQrUrl"
    `);
  }
}
