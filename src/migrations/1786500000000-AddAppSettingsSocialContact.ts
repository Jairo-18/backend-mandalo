import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Redes sociales y teléfono de contacto públicos de la app (el admin los
 * carga desde "Aplicación"): se muestran en login/registro (debajo de
 * "¿Cómo funciona Mandalo?") y en la ayuda de los 4 roles.
 */
export class AddAppSettingsSocialContact1786500000000
  implements MigrationInterface
{
  name = 'AddAppSettingsSocialContact1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appSettings" ADD "youtubeUrl" varchar(300)`,
    );
    await queryRunner.query(
      `ALTER TABLE "appSettings" ADD "facebookUrl" varchar(300)`,
    );
    await queryRunner.query(
      `ALTER TABLE "appSettings" ADD "instagramUrl" varchar(300)`,
    );
    await queryRunner.query(
      `ALTER TABLE "appSettings" ADD "contactPhone" varchar(30)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appSettings" DROP COLUMN "contactPhone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appSettings" DROP COLUMN "instagramUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appSettings" DROP COLUMN "facebookUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appSettings" DROP COLUMN "youtubeUrl"`,
    );
  }
}
