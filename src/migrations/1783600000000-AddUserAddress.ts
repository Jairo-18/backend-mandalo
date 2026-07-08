import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla `userAddress`: direcciones de entrega del usuario (varias por user,
 * con label propio y UNA principal `isDefault`). `user.address` NO se toca —
 * solo se copia como dirección principal ("Casa") para que nadie arranque
 * con la lista vacía.
 */
export class AddUserAddress1783600000000 implements MigrationInterface {
  name = 'AddUserAddress1783600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "userAddress" (
        "id" SERIAL NOT NULL,
        "userId" uuid NOT NULL,
        "label" character varying(50) NOT NULL,
        "address" character varying(255) NOT NULL,
        "details" character varying(255),
        "latitude" double precision,
        "longitude" double precision,
        "isDefault" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP DEFAULT now(),
        CONSTRAINT "PK_userAddress_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_userAddress_user" FOREIGN KEY ("userId")
          REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_userAddress_userId" ON "userAddress" ("userId")`,
    );

    // Seed: SOLO para cuentas rol USER (los demás roles siguen usando el
    // user.address plano) — su dirección de perfil pasa a ser la principal.
    await queryRunner.query(`
      INSERT INTO "userAddress" ("userId", "label", "address", "latitude", "longitude", "isDefault")
      SELECT u."id", 'Casa', u."address", u."latitude", u."longitude", true
      FROM "user" u
      JOIN "roleType" r ON r."id" = u."roleTypeId"
      WHERE r."code" = 'USER'
        AND u."address" IS NOT NULL AND btrim(u."address") <> ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "userAddress"`);
  }
}
