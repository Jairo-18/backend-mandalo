import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Verificación de repartidores:
 * - `user.identificationFrontUrl` / `user.identificationBackUrl` (nullable):
 *   fotos del documento por delante y por detrás, obligatorias en el registro
 *   DELI junto con el avatar. Un admin las revisa antes de activar la cuenta.
 * - `user.observations` (text, nullable): nota del admin PARA el usuario
 *   (p. ej. por qué su cuenta aún no se activa); se muestra en la pantalla
 *   "Cuenta en proceso de habilitación".
 */
export class AddDeliveryDocuments1783500000000 implements MigrationInterface {
  name = 'AddDeliveryDocuments1783500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "identificationFrontUrl" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "identificationBackUrl" character varying(500)`,
    );
    await queryRunner.query(`ALTER TABLE "user" ADD "observations" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "observations"`);
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "identificationBackUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "identificationFrontUrl"`,
    );
  }
}
