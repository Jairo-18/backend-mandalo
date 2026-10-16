/**
 * Servicio gRPC de pedidos (Sistemas Distribuidos, parte 1). Proceso aparte
 * del API: NO carga AppModule (ni crons, ni sockets), solo un pool de
 * Postgres y el consumer de Kafka.
 *
 *   GRPC_PORT=50051 DB_HOST=… KAFKA_BROKERS=localhost:9094 pnpm start:grpc
 */
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { Pool } from 'pg';
import { MANDALO_PEDIDOS_PACKAGE_NAME } from '../generated/pedidos';
import { PG_POOL, PedidosGrpcController } from './pedidos-grpc.controller';
import { PedidosFeedService } from './pedidos-feed.service';

@Module({
  controllers: [PedidosGrpcController],
  providers: [
    PedidosFeedService,
    {
      provide: PG_POOL,
      useFactory: () =>
        new Pool({
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          database: process.env.DB_DATABASE || 'mandalo_db',
          user: process.env.DB_USERNAME || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          ssl:
            process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
          max: 5,
        }),
    },
  ],
})
class PedidosGrpcModule {}

async function bootstrap() {
  const url = `0.0.0.0:${process.env.GRPC_PORT || 50051}`;
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    PedidosGrpcModule,
    {
      transport: Transport.GRPC,
      options: {
        url,
        package: MANDALO_PEDIDOS_PACKAGE_NAME,
        protoPath: join(process.cwd(), 'proto', 'pedidos.proto'),
      },
    },
  );
  app.enableShutdownHooks();
  await app.listen();
  new Logger('PedidosGrpc').log(`Servidor gRPC escuchando en ${url}`);
}

bootstrap();
