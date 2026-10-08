import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Foto opcional de la dirección de entrega (fachada, portón, punto de
 * referencia) para que el repartidor reconozca el lugar. `userAddress.photoUrl`
 * es la foto vigente de la dirección; `invoice.deliveryPhotoUrl` es el snapshot
 * que se copia al crear el pedido (igual que `deliveryAddress`), así editar o
 * borrar la dirección después no cambia lo que ve el repartidor.
 * Solo se guarda la URL: el archivo vive en disco (`uploads/addresses`).
 */
export class AddAddressPhoto1786800000000 implements MigrationInterface {
  name = 'AddAddressPhoto1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "userAddress" ADD "photoUrl" varchar(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "deliveryPhotoUrl" varchar(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" DROP COLUMN "deliveryPhotoUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "userAddress" DROP COLUMN "photoUrl"`,
    );
  }
}
