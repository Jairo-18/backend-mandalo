import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega `user.latitude` / `user.longitude` (nullable): coordenadas de la
 * dirección capturadas de la ubicación del dispositivo al registrarse.
 */
export class AddUserCoordinates1783200000000 implements MigrationInterface {
  name = 'AddUserCoordinates1783200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "latitude" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "longitude" double precision`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "longitude"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "latitude"`);
  }
}
