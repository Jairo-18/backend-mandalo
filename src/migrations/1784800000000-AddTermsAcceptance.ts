import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aceptación de Términos y Condiciones + Política de Tratamiento de Datos:
 * `user.termsAcceptedAt` (cuándo) + `user.termsVersion` (qué versión) —
 * ambos nullable (usuarios viejos quedan sin aceptación registrada).
 */
export class AddTermsAcceptance1784800000000 implements MigrationInterface {
  name = 'AddTermsAcceptance1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "termsAcceptedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "termsVersion" character varying(20)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "termsVersion"`);
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "termsAcceptedAt"`,
    );
  }
}
