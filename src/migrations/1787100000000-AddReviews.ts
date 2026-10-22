import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reseñas entre las 3 partes de un pedido ENTREGADO (cliente, negocio y
 * repartidor): cada parte puede calificar a las otras dos, una sola vez por
 * pedido, de 0.5 a 5 estrellas en pasos de media, con comentario opcional.
 *
 * El promedio y el conteo se guardan desnormalizados en `user` (cliente y
 * repartidor) y `organizational` (negocio) para pintarlos en listados sin
 * subconsultas. Los mantiene un TRIGGER (no el código): así también quedan
 * bien cuando las reseñas se borran en cascada (pedido o cuenta eliminados).
 */
export class AddReviews1787100000000 implements MigrationInterface {
  name = 'AddReviews1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "review" (
        "id" SERIAL PRIMARY KEY,
        "invoiceId" int NOT NULL REFERENCES "invoice"("id") ON DELETE CASCADE,
        "authorUserId" uuid REFERENCES "user"("id") ON DELETE SET NULL,
        "authorRole" varchar(10) NOT NULL,
        "authorOrganizationalId" int REFERENCES "organizational"("id") ON DELETE SET NULL,
        "authorName" varchar(255),
        "targetType" varchar(10) NOT NULL,
        "targetUserId" uuid REFERENCES "user"("id") ON DELETE CASCADE,
        "targetOrganizationalId" int REFERENCES "organizational"("id") ON DELETE CASCADE,
        "rating" numeric(2,1) NOT NULL,
        "comment" varchar(250),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_review_rating" CHECK ("rating" >= 0.5 AND "rating" <= 5 AND "rating" * 2 = floor("rating" * 2)),
        CONSTRAINT "CHK_review_target" CHECK (
          ("targetType" = 'BUSINESS' AND "targetOrganizationalId" IS NOT NULL AND "targetUserId" IS NULL)
          OR ("targetType" IN ('CLIENT', 'DELIVERY') AND "targetUserId" IS NOT NULL AND "targetOrganizationalId" IS NULL)
        ),
        CONSTRAINT "UQ_review_invoice_author_target" UNIQUE ("invoiceId", "authorRole", "targetType")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_review_targetUser" ON "review" ("targetUserId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_review_targetOrg" ON "review" ("targetOrganizationalId", "createdAt")`,
    );

    for (const table of ['user', 'organizational']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD "ratingAverage" numeric(3,2), ADD "ratingCount" int NOT NULL DEFAULT 0`,
      );
    }

    await queryRunner.query(`
      CREATE FUNCTION review_refresh_rating() RETURNS trigger AS $$
      DECLARE
        r record;
      BEGIN
        IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
        IF r."targetUserId" IS NOT NULL THEN
          UPDATE "user" SET
            "ratingAverage" = (SELECT round(avg("rating"), 2) FROM "review" WHERE "targetUserId" = r."targetUserId"),
            "ratingCount" = (SELECT count(*) FROM "review" WHERE "targetUserId" = r."targetUserId")
          WHERE "id" = r."targetUserId";
        END IF;
        IF r."targetOrganizationalId" IS NOT NULL THEN
          UPDATE "organizational" SET
            "ratingAverage" = (SELECT round(avg("rating"), 2) FROM "review" WHERE "targetOrganizationalId" = r."targetOrganizationalId"),
            "ratingCount" = (SELECT count(*) FROM "review" WHERE "targetOrganizationalId" = r."targetOrganizationalId")
          WHERE "id" = r."targetOrganizationalId";
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_review_refresh_rating"
      AFTER INSERT OR UPDATE OR DELETE ON "review"
      FOR EACH ROW EXECUTE FUNCTION review_refresh_rating()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "review"`);
    await queryRunner.query(`DROP FUNCTION review_refresh_rating()`);
    for (const table of ['user', 'organizational']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN "ratingAverage", DROP COLUMN "ratingCount"`,
      );
    }
  }
}
