import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Eliminar mi cuenta" self-service (exigido por Google Play, ver NOTAS.md
 * §47): `user.deletionRequestedAt` marca cuándo el propio usuario pidió
 * eliminar su cuenta. Sin historial (pedidos/negocio) se borra al instante y
 * esta columna nunca llega a usarse; con historial la cuenta se banea y
 * queda marcada acá para limpieza/anonimización manual del admin.
 *
 * IDEMPOTENTE (`IF NOT EXISTS`), mismo patrón que las migraciones recientes.
 */
export class AddUserDeletionRequest1785300000000
  implements MigrationInterface
{
  name = 'AddUserDeletionRequest1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "deletionRequestedAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "deletionRequestedAt"`,
    );
  }
}
