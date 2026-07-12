import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Las columnas de tiempo de `invoice` pasan a `timestamptz` (instante
 * absoluto). Con `timestamp` a secas se mezclaban dos relojes: `createdAt`
 * lo escribe Postgres (`now()`, VPS en UTC) y las transiciones las escribe
 * Node (hora local del backend) — al leer, el pedido "Pendiente" salía con
 * +5 h respecto a "Aceptado" (bug visto 2026-07-11). Los datos viejos de dev
 * se convierten con la zona en la que fueron escritos (createdAt/updatedAt
 * en UTC por el VPS; las transiciones en hora Colombia por el backend local).
 */
export class InvoiceTimestamptz1783900000000 implements MigrationInterface {
  name = 'InvoiceTimestamptz1783900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoice"
        ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "updatedAt" TYPE timestamptz USING "updatedAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "acceptedAt" TYPE timestamptz USING "acceptedAt" AT TIME ZONE 'America/Bogota',
        ALTER COLUMN "preparingAt" TYPE timestamptz USING "preparingAt" AT TIME ZONE 'America/Bogota',
        ALTER COLUMN "takenAt" TYPE timestamptz USING "takenAt" AT TIME ZONE 'America/Bogota',
        ALTER COLUMN "onRouteAt" TYPE timestamptz USING "onRouteAt" AT TIME ZONE 'America/Bogota',
        ALTER COLUMN "deliveredAt" TYPE timestamptz USING "deliveredAt" AT TIME ZONE 'America/Bogota',
        ALTER COLUMN "cancelledAt" TYPE timestamptz USING "cancelledAt" AT TIME ZONE 'America/Bogota'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoice"
        ALTER COLUMN "createdAt" TYPE timestamp USING "createdAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "updatedAt" TYPE timestamp USING "updatedAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "acceptedAt" TYPE timestamp USING "acceptedAt" AT TIME ZONE 'America/Bogota',
        ALTER COLUMN "preparingAt" TYPE timestamp USING "preparingAt" AT TIME ZONE 'America/Bogota',
        ALTER COLUMN "takenAt" TYPE timestamp USING "takenAt" AT TIME ZONE 'America/Bogota',
        ALTER COLUMN "onRouteAt" TYPE timestamp USING "onRouteAt" AT TIME ZONE 'America/Bogota',
        ALTER COLUMN "deliveredAt" TYPE timestamp USING "deliveredAt" AT TIME ZONE 'America/Bogota',
        ALTER COLUMN "cancelledAt" TYPE timestamp USING "cancelledAt" AT TIME ZONE 'America/Bogota'
    `);
  }
}
