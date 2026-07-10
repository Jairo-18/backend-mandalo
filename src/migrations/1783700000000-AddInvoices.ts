import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tablas del módulo de pedidos: `invoice` (el pedido, negocio-first) e
 * `invoiceDetail` (renglones con snapshot de producto/precio). La dirección
 * de entrega va copiada (texto + coords) y los totales son snapshot de lo
 * vigente al crear. Requiere las filas de `stateType` (PEND, ACEP, PREP,
 * RUTA, ENTR, CANC) y `paidType` (EFEC, TRAN, NEQUI, DAVI) en la DB.
 */
export class AddInvoices1783700000000 implements MigrationInterface {
  name = 'AddInvoices1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "invoice" (
        "id" SERIAL NOT NULL,
        "userId" uuid NOT NULL,
        "organizationalId" integer NOT NULL,
        "deliveryUserId" uuid,
        "stateTypeId" integer NOT NULL,
        "paidTypeId" integer NOT NULL,
        "deliveryAddress" character varying(255) NOT NULL,
        "deliveryDetails" character varying(255),
        "deliveryLatitude" double precision,
        "deliveryLongitude" double precision,
        "subtotal" numeric(12,2) NOT NULL,
        "deliveryFee" numeric(12,2) NOT NULL DEFAULT 0,
        "total" numeric(12,2) NOT NULL,
        "notes" text,
        "cancellationReason" character varying(255),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP DEFAULT now(),
        CONSTRAINT "PK_invoice_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invoice_user" FOREIGN KEY ("userId")
          REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invoice_organizational" FOREIGN KEY ("organizationalId")
          REFERENCES "organizational"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invoice_deliveryUser" FOREIGN KEY ("deliveryUserId")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_invoice_stateType" FOREIGN KEY ("stateTypeId")
          REFERENCES "stateType"("id"),
        CONSTRAINT "FK_invoice_paidType" FOREIGN KEY ("paidTypeId")
          REFERENCES "paidType"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_invoice_userId" ON "invoice" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_invoice_organizationalId" ON "invoice" ("organizationalId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_invoice_deliveryUserId" ON "invoice" ("deliveryUserId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_invoice_stateTypeId" ON "invoice" ("stateTypeId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "invoiceDetail" (
        "id" SERIAL NOT NULL,
        "invoiceId" integer NOT NULL,
        "productId" integer,
        "productName" character varying(150) NOT NULL,
        "unitPrice" numeric(12,2) NOT NULL,
        "discount" numeric(5,2) NOT NULL DEFAULT 0,
        "quantity" integer NOT NULL,
        "lineTotal" numeric(12,2) NOT NULL,
        CONSTRAINT "PK_invoiceDetail_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invoiceDetail_invoice" FOREIGN KEY ("invoiceId")
          REFERENCES "invoice"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invoiceDetail_product" FOREIGN KEY ("productId")
          REFERENCES "product"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_invoiceDetail_invoiceId" ON "invoiceDetail" ("invoiceId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "invoiceDetail"`);
    await queryRunner.query(`DROP TABLE "invoice"`);
  }
}
