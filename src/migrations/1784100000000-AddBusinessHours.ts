import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Horario de atención del negocio:
 * - openTime/closeTime "HH:MM" hora local de Colombia (closeTime menor que
 *   openTime = horario nocturno que cruza medianoche, ej. 18:00–02:00).
 * - openDays: días que abre, números JS 0–6 (0=domingo) separados por coma.
 * - temporarilyClosed: candado manual ("cerrado temporalmente") del negocio.
 * Todo nullable: un negocio sin horario configurado se considera SIEMPRE
 * abierto (compatibilidad con los negocios existentes).
 */
export class AddBusinessHours1784100000000 implements MigrationInterface {
  name = 'AddBusinessHours1784100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "openTime" character varying(5)`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "closeTime" character varying(5)`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "openDays" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "temporarilyClosed" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP COLUMN "temporarilyClosed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP COLUMN "openDays"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP COLUMN "closeTime"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP COLUMN "openTime"`,
    );
  }
}
