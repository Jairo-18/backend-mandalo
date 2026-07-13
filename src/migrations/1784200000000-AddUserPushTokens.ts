import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tokens de notificaciones push (Expo) por dispositivo. Un usuario puede
 * tener varios; el token es único global (si otra cuenta entra en el mismo
 * teléfono, el registro se reasigna a esa cuenta).
 */
export class AddUserPushTokens1784200000000 implements MigrationInterface {
  name = 'AddUserPushTokens1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "userPushToken" (
        "id" SERIAL NOT NULL,
        "userId" uuid NOT NULL,
        "token" character varying(100) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP DEFAULT now(),
        CONSTRAINT "PK_userPushToken" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_userPushToken_token" UNIQUE ("token"),
        CONSTRAINT "FK_userPushToken_user" FOREIGN KEY ("userId")
          REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_userPushToken_userId" ON "userPushToken" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_userPushToken_userId"`);
    await queryRunner.query(`DROP TABLE "userPushToken"`);
  }
}
