import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega `organizational.phone` (nullable): teléfono de contacto del negocio
 * (el que ve el cliente para llamar/pedir). Mismo formato que `user.phone`.
 */
export class AddOrganizationalPhone1783400000000 implements MigrationInterface {
  name = 'AddOrganizationalPhone1783400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "phone" character varying(30)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "organizational" DROP COLUMN "phone"`);
  }
}
