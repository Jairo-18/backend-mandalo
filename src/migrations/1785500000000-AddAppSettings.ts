import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Paleta de marca editable por el admin desde "Aplicación" (ver NOTAS.md
 * §50): tabla SINGLETON `appSettings` (una sola fila, `id` fijo en 1),
 * sembrada con los mismos valores que hoy están fijos en
 * `frontend-mandalo/tailwind.config.js`.
 *
 * IDEMPOTENTE (`IF NOT EXISTS` + `ON CONFLICT DO NOTHING`), mismo patrón que
 * las migraciones recientes.
 */
export class AddAppSettings1785500000000 implements MigrationInterface {
  name = 'AddAppSettings1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "appSettings" (
        "id" integer PRIMARY KEY,
        "primaryColor" character varying(7) NOT NULL DEFAULT '#FF5A3C',
        "darkColor" character varying(7) NOT NULL DEFAULT '#1E1E2D',
        "mutedColor" character varying(7) NOT NULL DEFAULT '#7A7A8A',
        "surfaceColor" character varying(7) NOT NULL DEFAULT '#F2F2F2',
        "updatedAt" TIMESTAMP
      )
    `);

    await queryRunner.query(`
      INSERT INTO "appSettings" ("id", "primaryColor", "darkColor", "mutedColor", "surfaceColor")
      VALUES (1, '#FF5A3C', '#1E1E2D', '#7A7A8A', '#F2F2F2')
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "appSettings"`);
  }
}
