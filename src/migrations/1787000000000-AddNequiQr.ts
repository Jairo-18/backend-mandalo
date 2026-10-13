import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * QR Bre-B de Nequi del negocio (imagen que sube el negocio o el admin), al
 * lado del de Bancolombia (`bancolombiaQrUrl`). Solo se guarda la URL: el
 * archivo vive en disco (`uploads/organizational`).
 */
export class AddNequiQr1787000000000 implements MigrationInterface {
  name = 'AddNequiQr1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizational" ADD "nequiQrUrl" varchar(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizational" DROP COLUMN "nequiQrUrl"`,
    );
  }
}
