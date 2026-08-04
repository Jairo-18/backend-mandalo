import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reporte de accidentes del repartidor (reunión con el cliente 2026-08-04):
 * tabla nueva `deliveryAccident` + 2 campos ARL — uno GLOBAL en `appSettings`
 * (compañía/póliza, único para toda la plataforma) y uno INDIVIDUAL en
 * `user` (número de afiliado propio de cada repartidor).
 */
export class AddDeliveryAccidents1786300000000 implements MigrationInterface {
  name = 'AddDeliveryAccidents1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "deliveryAccident" (
        "id" SERIAL PRIMARY KEY,
        "deliveryUserId" uuid NOT NULL,
        "invoiceId" integer,
        "reasonCode" varchar(50) NOT NULL,
        "notes" varchar(1000),
        "photos" text[] NOT NULL DEFAULT '{}',
        "incidentAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "reviewedAt" TIMESTAMP WITH TIME ZONE,
        "reviewedByAdminId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "FK_deliveryAccident_deliveryUser" FOREIGN KEY ("deliveryUserId") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_deliveryAccident_invoice" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_deliveryAccident_reviewedBy" FOREIGN KEY ("reviewedByAdminId") REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_deliveryAccident_deliveryUserId" ON "deliveryAccident" ("deliveryUserId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_deliveryAccident_reviewedAt" ON "deliveryAccident" ("reviewedAt")`,
    );

    // ARL global (toda la plataforma) — una sola póliza que cubre a todos
    // los repartidores.
    await queryRunner.query(
      `ALTER TABLE "appSettings" ADD "arlCompanyName" varchar(150)`,
    );
    await queryRunner.query(
      `ALTER TABLE "appSettings" ADD "arlPolicyNumber" varchar(80)`,
    );

    // ARL individual del repartidor (número de afiliado propio).
    await queryRunner.query(
      `ALTER TABLE "user" ADD "arlIndividualNumber" varchar(80)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "arlIndividualNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appSettings" DROP COLUMN "arlPolicyNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appSettings" DROP COLUMN "arlCompanyName"`,
    );
    await queryRunner.query(`DROP TABLE "deliveryAccident"`);
  }
}
