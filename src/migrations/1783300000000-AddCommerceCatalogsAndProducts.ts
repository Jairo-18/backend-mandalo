import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Módulo comercio (fase 1):
 * - Catálogos `categoryType`, `stateType`, `paidType`, `tag` (datos manuales,
 *   igual que `identificationType`).
 * - Expande `organizational` (negocio): identificación, nombre comercial,
 *   descripción, dirección + coordenadas, ubicación DANE, representante legal
 *   (FK a `user`), isActive, updatedAt.
 * - `product` (pertenece a un negocio) y `organizationalTag` (N:M negocio–tag).
 */
export class AddCommerceCatalogsAndProducts1783300000000
  implements MigrationInterface
{
  name = 'AddCommerceCatalogsAndProducts1783300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Catálogos ---
    await queryRunner.query(
      `CREATE TABLE "categoryType" ("id" SERIAL NOT NULL, "code" character varying(30) NOT NULL, "name" character varying(100) NOT NULL, "icon" character varying(100), CONSTRAINT "UQ_categoryType_code" UNIQUE ("code"), CONSTRAINT "PK_categoryType_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "stateType" ("id" SERIAL NOT NULL, "code" character varying(30) NOT NULL, "name" character varying(100) NOT NULL, CONSTRAINT "UQ_stateType_code" UNIQUE ("code"), CONSTRAINT "PK_stateType_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "paidType" ("id" SERIAL NOT NULL, "code" character varying(30) NOT NULL, "name" character varying(100) NOT NULL, CONSTRAINT "UQ_paidType_code" UNIQUE ("code"), CONSTRAINT "PK_paidType_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tag" ("id" SERIAL NOT NULL, "code" character varying(30) NOT NULL, "name" character varying(100) NOT NULL, "icon" character varying(100), CONSTRAINT "UQ_tag_code" UNIQUE ("code"), CONSTRAINT "PK_tag_id" PRIMARY KEY ("id"))`,
    );

    // --- Organizational: columnas nuevas ---
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "tradeName" character varying(150)`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "identificationNumber" character varying(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD CONSTRAINT "UQ_organizational_identificationNumber" UNIQUE ("identificationNumber")`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "identificationTypeId" integer`,
    );
    await queryRunner.query(`ALTER TABLE "organizational" ADD "description" text`);
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "logoUrl" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "address" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "latitude" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "longitude" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "municipalityId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "departmentId" integer`,
    );
    await queryRunner.query(`ALTER TABLE "organizational" ADD "legalPersonId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "isActive" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "updatedAt" TIMESTAMP DEFAULT now()`,
    );

    // --- Organizational: FKs ---
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD CONSTRAINT "FK_organizational_identificationType" FOREIGN KEY ("identificationTypeId") REFERENCES "identificationType"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD CONSTRAINT "FK_organizational_municipality" FOREIGN KEY ("municipalityId") REFERENCES "municipality"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD CONSTRAINT "FK_organizational_department" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD CONSTRAINT "FK_organizational_legalPerson" FOREIGN KEY ("legalPersonId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // --- Product ---
    await queryRunner.query(
      `CREATE TABLE "product" ("id" SERIAL NOT NULL, "code" character varying(50), "name" character varying(150) NOT NULL, "description" text, "categoryTypeId" integer, "priceSale" numeric(12,2) NOT NULL, "discount" numeric(5,2) NOT NULL DEFAULT '0', "images" text array NOT NULL DEFAULT '{}',"isActive" boolean NOT NULL DEFAULT true, "organizationalId" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP DEFAULT now(), CONSTRAINT "PK_product_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD CONSTRAINT "FK_product_categoryType" FOREIGN KEY ("categoryTypeId") REFERENCES "categoryType"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD CONSTRAINT "FK_product_organizational" FOREIGN KEY ("organizationalId") REFERENCES "organizational"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_organizationalId" ON "product" ("organizationalId")`,
    );

    // --- organizationalTag (N:M) ---
    await queryRunner.query(
      `CREATE TABLE "organizationalTag" ("organizationalId" integer NOT NULL, "tagId" integer NOT NULL, CONSTRAINT "PK_organizationalTag" PRIMARY KEY ("organizationalId", "tagId"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizationalTag" ADD CONSTRAINT "FK_organizationalTag_organizational" FOREIGN KEY ("organizationalId") REFERENCES "organizational"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizationalTag" ADD CONSTRAINT "FK_organizationalTag_tag" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "organizationalTag"`);
    await queryRunner.query(`DROP INDEX "IDX_product_organizationalId"`);
    await queryRunner.query(`DROP TABLE "product"`);

    await queryRunner.query(
      `ALTER TABLE "organizational" DROP CONSTRAINT "FK_organizational_legalPerson"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP CONSTRAINT "FK_organizational_department"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP CONSTRAINT "FK_organizational_municipality"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP CONSTRAINT "FK_organizational_identificationType"`,
    );
    await queryRunner.query(`ALTER TABLE "organizational" DROP COLUMN "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "organizational" DROP COLUMN "isActive"`);
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP COLUMN "legalPersonId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP COLUMN "departmentId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP COLUMN "municipalityId"`,
    );
    await queryRunner.query(`ALTER TABLE "organizational" DROP COLUMN "longitude"`);
    await queryRunner.query(`ALTER TABLE "organizational" DROP COLUMN "latitude"`);
    await queryRunner.query(`ALTER TABLE "organizational" DROP COLUMN "address"`);
    await queryRunner.query(`ALTER TABLE "organizational" DROP COLUMN "logoUrl"`);
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP COLUMN "description"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP COLUMN "identificationTypeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP CONSTRAINT "UQ_organizational_identificationNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP COLUMN "identificationNumber"`,
    );
    await queryRunner.query(`ALTER TABLE "organizational" DROP COLUMN "tradeName"`);

    await queryRunner.query(`DROP TABLE "tag"`);
    await queryRunner.query(`DROP TABLE "paidType"`);
    await queryRunner.query(`DROP TABLE "stateType"`);
    await queryRunner.query(`DROP TABLE "categoryType"`);
  }
}
