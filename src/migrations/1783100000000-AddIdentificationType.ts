import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega la tabla `identificationType` (id, code, name) y la FK desde
 * `user.identificationTypeId`. Los datos se insertan manualmente en la BD.
 */
export class AddIdentificationType1783100000000 implements MigrationInterface {
  name = 'AddIdentificationType1783100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "identificationType" ("id" SERIAL NOT NULL, "code" character varying(20) NOT NULL, "name" character varying(100) NOT NULL, CONSTRAINT "UQ_identificationType_code" UNIQUE ("code"), CONSTRAINT "PK_identificationType_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "FK_user_identificationType" FOREIGN KEY ("identificationTypeId") REFERENCES "identificationType"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT "FK_user_identificationType"`,
    );
    await queryRunner.query(`DROP TABLE "identificationType"`);
  }
}
