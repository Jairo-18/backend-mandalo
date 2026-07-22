import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aceptación de Términos y Condiciones + Política de Tratamiento de Datos del
 * NEGOCIO: `organizational.termsAcceptedAt` (cuándo) + `termsVersion` (qué
 * versión). La marca el usuario dueño (rol NEGO) al aceptar en el gate de
 * inicio de sesión. Ambas nullable (negocios viejos quedan sin registro).
 *
 * IDEMPOTENTE (`IF NOT EXISTS`): una versión anterior de este archivo llegó a
 * ejecutarse con otro timestamp en dev y ya creó las columnas; con esto la
 * migración se salta lo que exista y queda registrada sin fallar (y en una DB
 * limpia crea las columnas normalmente).
 */
export class AddOrganizationalTerms1785100000000
  implements MigrationInterface
{
  name = 'AddOrganizationalTerms1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD COLUMN IF NOT EXISTS "termsVersion" character varying(20)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP COLUMN IF EXISTS "termsVersion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP COLUMN IF EXISTS "termsAcceptedAt"`,
    );
  }
}
