import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Solicitud de eliminación de cuenta SIN sesión (punto 1b de la auditoría de
 * Google Play, ver NOTAS.md §47/§49): la página web pública de borrado pide
 * el correo, el backend manda un enlace con `deletionRequestToken` (mismo
 * patrón que `emailVerificationToken`) y al abrirlo se ejecuta el mismo
 * borrado/baneo que ya hace `DELETE /user/me` (self-service logueado).
 *
 * IDEMPOTENTE (`IF NOT EXISTS`), mismo patrón que las migraciones recientes.
 */
export class AddUserDeletionRequestToken1785400000000
  implements MigrationInterface
{
  name = 'AddUserDeletionRequestToken1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "deletionRequestToken" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "deletionRequestTokenExpiry" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "deletionRequestTokenExpiry"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "deletionRequestToken"`,
    );
  }
}
