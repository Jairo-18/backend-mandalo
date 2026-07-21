import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Documentos del vehículo del repartidor (además de la identidad de §17):
 * - `user.vehiclePlate` (nullable): placa de la moto/vehículo.
 * - `user.licenseFrontUrl` / `licenseBackUrl` (nullable): licencia de
 *   conducción, foto por delante y por detrás (misma lógica que la cédula).
 * - `user.soatUrl` / `technicalInspectionUrl` (nullable): SOAT y
 *   tecnomecánica, UN solo archivo cada uno (certificado de una sola página,
 *   no tiene reverso relevante) que puede ser foto O pdf.
 * Un admin revisa todo antes de activar la cuenta, igual que con la identidad.
 */
export class AddDeliveryVehicleDocuments1784700000000
  implements MigrationInterface
{
  name = 'AddDeliveryVehicleDocuments1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "vehiclePlate" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "licenseFrontUrl" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "licenseBackUrl" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "soatUrl" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "technicalInspectionUrl" character varying(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "technicalInspectionUrl"`,
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "soatUrl"`);
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "licenseBackUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "licenseFrontUrl"`,
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "vehiclePlate"`);
  }
}
