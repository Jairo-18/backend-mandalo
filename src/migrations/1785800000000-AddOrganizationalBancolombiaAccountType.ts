import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tipo de la cuenta Bancolombia del negocio ('AHORROS' | 'CORRIENTE'), junto
 * al número que ya se guardaba en `bancolombiaAccount` — el cliente necesita
 * saber cuál es para transferir bien.
 */
export class AddOrganizationalBancolombiaAccountType1785800000000
  implements MigrationInterface
{
  name = 'AddOrganizationalBancolombiaAccountType1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizational"
        ADD "bancolombiaAccountType" character varying(20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizational"
        DROP COLUMN "bancolombiaAccountType"
    `);
  }
}
