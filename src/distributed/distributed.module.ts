import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { MANDALO_PEDIDOS_PACKAGE_NAME } from './generated/pedidos';
import { OrderEventsPublisher } from './kafka/order-events.publisher';
import { DemoController, PEDIDOS_GRPC } from './demo/demo.controller';

/**
 * Sistemas Distribuidos, lado del API:
 *  - `OrderEventsPublisher`: producer de Kafka (lo usa `InvoiceGateway`).
 *  - Cliente gRPC del servicio de pedidos + página de demo en `/sd`.
 * Todo apagado si no hay `KAFKA_BROKERS` / `SD_DEMO=true`.
 */
@Global()
@Module({
  imports: [
    ClientsModule.register([
      {
        name: PEDIDOS_GRPC,
        transport: Transport.GRPC,
        options: {
          url: process.env.GRPC_PEDIDOS_URL || 'localhost:50051',
          package: MANDALO_PEDIDOS_PACKAGE_NAME,
          protoPath: join(process.cwd(), 'proto', 'pedidos.proto'),
        },
      },
    ]),
  ],
  controllers: [DemoController],
  providers: [OrderEventsPublisher],
  exports: [OrderEventsPublisher],
})
export class DistributedModule {}
