import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tiempos del pedido: cuándo ocurrió cada transición (para mostrar horas
 * reales en el timeline) y los ESTIMADOS que ven los roles — el negocio se
 * compromete con minutos de preparación al ACEPTAR y el backend estima los
 * minutos de entrega al despachar (distancia negocio ↔ dirección, o tarifa
 * fija APP_DELIVERY_ETA_MINUTES si faltan coordenadas).
 */
export class AddInvoiceTimestamps1783800000000 implements MigrationInterface {
  name = 'AddInvoiceTimestamps1783800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoice"
        ADD COLUMN "acceptedAt" TIMESTAMP,
        ADD COLUMN "preparingAt" TIMESTAMP,
        ADD COLUMN "takenAt" TIMESTAMP,
        ADD COLUMN "onRouteAt" TIMESTAMP,
        ADD COLUMN "deliveredAt" TIMESTAMP,
        ADD COLUMN "cancelledAt" TIMESTAMP,
        ADD COLUMN "prepEstimatedMinutes" integer,
        ADD COLUMN "deliveryEstimatedMinutes" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoice"
        DROP COLUMN "acceptedAt",
        DROP COLUMN "preparingAt",
        DROP COLUMN "takenAt",
        DROP COLUMN "onRouteAt",
        DROP COLUMN "deliveredAt",
        DROP COLUMN "cancelledAt",
        DROP COLUMN "prepEstimatedMinutes",
        DROP COLUMN "deliveryEstimatedMinutes"
    `);
  }
}
