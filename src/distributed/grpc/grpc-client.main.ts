/**
 * Cliente gRPC de consola (Sistemas Distribuidos, parte 1): consume los dos
 * métodos del servicio.
 *
 *   GRPC_PEDIDOS_URL=localhost:50051 pnpm grpc:cliente 123     → unary + stream del pedido 123
 *   GRPC_PEDIDOS_URL=localhost:50051 pnpm grpc:cliente 0       → stream de todos los pedidos
 */
import { ClientGrpcProxy } from '@nestjs/microservices';
import { join } from 'path';
import { firstValueFrom } from 'rxjs';
import {
  MANDALO_PEDIDOS_PACKAGE_NAME,
  PEDIDOS_SERVICE_NAME,
  PedidosServiceClient,
} from '../generated/pedidos';

async function main() {
  const pedidoId = parseInt(process.argv[2] || '0', 10);
  const client = new ClientGrpcProxy({
    url: process.env.GRPC_PEDIDOS_URL || 'localhost:50051',
    package: MANDALO_PEDIDOS_PACKAGE_NAME,
    protoPath: join(process.cwd(), 'proto', 'pedidos.proto'),
  } as any);
  const svc = client.getService<PedidosServiceClient>(PEDIDOS_SERVICE_NAME);
  const t = () => new Date().toISOString();

  if (pedidoId) {
    const inicio = Date.now();
    const resumen = await firstValueFrom(svc.obtenerPedido({ pedidoId }));
    console.log(`${t()} [unary] ObtenerPedido(${pedidoId}) en ${Date.now() - inicio} ms:`);
    console.log(resumen);
  }

  console.log(`${t()} [stream] SeguirPedido(${pedidoId || 'todos'}) — Ctrl+C para salir`);
  svc.seguirPedido({ pedidoId }).subscribe({
    next: (e) =>
      console.log(
        `${t()} [stream] ${e.tipo} #${e.pedidoId} [${e.estadoCodigo}] ${e.negocio} ` +
          (e.particion >= 0 ? `(kafka p${e.particion} @${e.offset})` : '(snapshot DB)'),
      ),
    error: (err) => {
      console.error(`${t()} [stream] error: ${err.details || err.message}`);
      process.exit(1);
    },
  });
}

main().catch((e) => {
  console.error(e.details || e.message);
  process.exit(1);
});
