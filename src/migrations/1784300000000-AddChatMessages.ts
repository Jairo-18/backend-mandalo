import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chat por pedido (cliente ↔ repartidor asignado). Un mensaje pertenece a un
 * invoice; el hilo se habilita al tomar el pedido y queda de solo lectura al
 * entregar/cancelar. Tiempos en timestamptz (los ve el usuario).
 */
export class AddChatMessages1784300000000 implements MigrationInterface {
  name = 'AddChatMessages1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chatMessage" (
        "id" SERIAL NOT NULL,
        "invoiceId" integer NOT NULL,
        "senderUserId" uuid NOT NULL,
        "body" character varying(500) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "readAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_chatMessage" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chatMessage_invoice" FOREIGN KEY ("invoiceId")
          REFERENCES "invoice"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chatMessage_sender" FOREIGN KEY ("senderUserId")
          REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_chatMessage_invoiceId" ON "chatMessage" ("invoiceId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_chatMessage_invoiceId"`);
    await queryRunner.query(`DROP TABLE "chatMessage"`);
  }
}
