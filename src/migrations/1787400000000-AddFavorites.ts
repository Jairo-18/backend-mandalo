import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Favoritos del cliente ("Mi cuenta → Mis favoritos", pestañas Negocios /
 * Productos), marcados con el corazón en tarjetas, detalle y cabecera de la
 * tienda.
 *
 * - `favoriteBusiness` / `favoriteProduct`: uno por usuario y negocio/producto
 *   (UNIQUE). Si se borra el usuario, el negocio o el producto, el favorito
 *   se va con él (CASCADE). Si solo se DESACTIVA, el favorito queda y la app
 *   lo muestra como "No disponible".
 */
export class AddFavorites1787400000000 implements MigrationInterface {
  name = 'AddFavorites1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "favoriteBusiness" (
        "id" SERIAL PRIMARY KEY,
        "userId" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "organizationalId" int NOT NULL REFERENCES "organizational"("id") ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_favoriteBusiness" UNIQUE ("userId", "organizationalId")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "favoriteProduct" (
        "id" SERIAL PRIMARY KEY,
        "userId" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "productId" int NOT NULL REFERENCES "product"("id") ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_favoriteProduct" UNIQUE ("userId", "productId")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "favoriteProduct"`);
    await queryRunner.query(`DROP TABLE "favoriteBusiness"`);
  }
}
