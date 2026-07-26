import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tarifa de servicio (`invoice.serviceFee`): % del subtotal (sin domicilio),
 * topada en un máximo fijo (`APP_SERVICE_FEE_PERCENT`/`APP_SERVICE_FEE_CAP`,
 * ver `config.ts`) — 100% ingreso de Mándalo, no se reparte con el negocio
 * (comisión) ni el repartidor (corte del domicilio). Default 0 para que los
 * pedidos históricos (creados antes de esta tarifa) no queden con un total
 * distinto al que en verdad se cobró.
 */
export class AddInvoiceServiceFee1785700000000 implements MigrationInterface {
  name = 'AddInvoiceServiceFee1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice" ADD "serviceFee" numeric(12,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoice" DROP COLUMN "serviceFee"`);
  }
}
