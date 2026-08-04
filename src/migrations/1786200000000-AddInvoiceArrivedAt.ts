import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `invoice.arrivedAt`: momento en que el repartidor marca "En sitio" al
 * llegar a la dirección de entrega (reunión con el cliente 2026-08-04).
 * Arranca la espera de `APP_DELIVERY_WAIT_MINUTES` (default 5) antes de
 * habilitar el "segundo intento" pagado — ver `retryAfterTimeout` en
 * `invoice.service.ts`. Null = el repartidor todavía no llegó (o el pedido
 * no ha entrado en ruta).
 */
export class AddInvoiceArrivedAt1786200000000 implements MigrationInterface {
  name = 'AddInvoiceArrivedAt1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "arrivedAt" TIMESTAMP WITH TIME ZONE`,
    );
    // El motivo de entrega fallida ahora combina un select + observaciones
    // libres del front — 255 se quedaba corto.
    await queryRunner.query(
      `ALTER TABLE "invoice" ALTER COLUMN "deliveryFailReason" TYPE varchar(500)`,
    );
    // Foto obligatoria del sitio/paquete al reportar que no se pudo entregar.
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "deliveryFailPhotoUrl" varchar(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" DROP COLUMN "deliveryFailPhotoUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice" ALTER COLUMN "deliveryFailReason" TYPE varchar(255)`,
    );
    await queryRunner.query(`ALTER TABLE "invoice" DROP COLUMN "arrivedAt"`);
  }
}
