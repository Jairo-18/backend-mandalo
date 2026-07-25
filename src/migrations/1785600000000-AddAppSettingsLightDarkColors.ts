import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Paleta de marca con par claro/oscuro EXPLÍCITO para cada rol de color
 * (§51 en NOTAS.md): antes `surfaceColor`/`mutedColor` eran un solo valor y
 * el front les inventaba una variante oscura sola (con matemática de color);
 * ahora el admin controla los dos directamente, sin que el sistema adivine
 * nada. También suma control sobre `card` (tarjetas) y `border` (líneas),
 * que antes eran fijos.
 *
 * Migra los valores existentes: `surfaceColor`→`surfaceLightColor`,
 * `mutedColor`→`textSecondaryLightColor` (y las variantes oscuras arrancan
 * con los mismos defaults que ya usaba `global.css`). `card`/`border`/
 * `textPrimary` no tenían columna propia — arrancan con los valores fijos
 * que ya se veían en la app.
 *
 * IDEMPOTENTE (`IF NOT EXISTS`), mismo patrón que las migraciones recientes.
 */
export class AddAppSettingsLightDarkColors1785600000000
  implements MigrationInterface
{
  name = 'AddAppSettingsLightDarkColors1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appSettings"
        ADD COLUMN IF NOT EXISTS "surfaceLightColor" character varying(7) NOT NULL DEFAULT '#F2F2F2',
        ADD COLUMN IF NOT EXISTS "surfaceDarkColor" character varying(7) NOT NULL DEFAULT '#12121B',
        ADD COLUMN IF NOT EXISTS "cardLightColor" character varying(7) NOT NULL DEFAULT '#FFFFFF',
        ADD COLUMN IF NOT EXISTS "cardDarkColor" character varying(7) NOT NULL DEFAULT '#262636',
        ADD COLUMN IF NOT EXISTS "textPrimaryLightColor" character varying(7) NOT NULL DEFAULT '#1E1E2D',
        ADD COLUMN IF NOT EXISTS "textPrimaryDarkColor" character varying(7) NOT NULL DEFAULT '#EDEDF2',
        ADD COLUMN IF NOT EXISTS "textSecondaryLightColor" character varying(7) NOT NULL DEFAULT '#7A7A8A',
        ADD COLUMN IF NOT EXISTS "textSecondaryDarkColor" character varying(7) NOT NULL DEFAULT '#A0A0B2',
        ADD COLUMN IF NOT EXISTS "borderLightColor" character varying(7) NOT NULL DEFAULT '#E5E7EB',
        ADD COLUMN IF NOT EXISTS "borderDarkColor" character varying(7) NOT NULL DEFAULT '#33334A'
    `);

    // Migra lo que ya había elegido el admin (si algo cambió desde el default).
    await queryRunner.query(`
      UPDATE "appSettings"
      SET "surfaceLightColor" = "surfaceColor",
          "textSecondaryLightColor" = "mutedColor"
      WHERE "id" = 1
    `);

    await queryRunner.query(`
      ALTER TABLE "appSettings"
        DROP COLUMN IF EXISTS "surfaceColor",
        DROP COLUMN IF EXISTS "mutedColor"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appSettings"
        ADD COLUMN IF NOT EXISTS "surfaceColor" character varying(7) NOT NULL DEFAULT '#F2F2F2',
        ADD COLUMN IF NOT EXISTS "mutedColor" character varying(7) NOT NULL DEFAULT '#7A7A8A'
    `);
    await queryRunner.query(`
      UPDATE "appSettings"
      SET "surfaceColor" = "surfaceLightColor",
          "mutedColor" = "textSecondaryLightColor"
      WHERE "id" = 1
    `);
    await queryRunner.query(`
      ALTER TABLE "appSettings"
        DROP COLUMN IF EXISTS "surfaceLightColor",
        DROP COLUMN IF EXISTS "surfaceDarkColor",
        DROP COLUMN IF EXISTS "cardLightColor",
        DROP COLUMN IF EXISTS "cardDarkColor",
        DROP COLUMN IF EXISTS "textPrimaryLightColor",
        DROP COLUMN IF EXISTS "textPrimaryDarkColor",
        DROP COLUMN IF EXISTS "textSecondaryLightColor",
        DROP COLUMN IF EXISTS "textSecondaryDarkColor",
        DROP COLUMN IF EXISTS "borderLightColor",
        DROP COLUMN IF EXISTS "borderDarkColor"
    `);
  }
}
