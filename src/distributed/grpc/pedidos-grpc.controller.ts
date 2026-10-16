import { Controller, Inject, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { Pool } from 'pg';
import { Observable, concat, defer, filter, from, map, EMPTY } from 'rxjs';
import {
  EventoPedido,
  ObtenerPedidoRequest,
  PedidoResumen,
  PedidosServiceController,
  PedidosServiceControllerMethods,
  SeguirPedidoRequest,
} from '../generated/pedidos';
import { PedidosFeedService } from './pedidos-feed.service';

export const PG_POOL = 'PG_POOL';

/** Servidor gRPC: implementa el contrato `proto/pedidos.proto`. */
@Controller()
@PedidosServiceControllerMethods()
export class PedidosGrpcController implements PedidosServiceController {
  private readonly logger = new Logger('PedidosGrpc');

  constructor(
    @Inject(PG_POOL) private readonly _pool: Pool,
    private readonly _feed: PedidosFeedService,
  ) {}

  async obtenerPedido({ pedidoId }: ObtenerPedidoRequest): Promise<PedidoResumen> {
    this.logger.log(`ObtenerPedido(${pedidoId}) [unary]`);
    const { rows } = await this._pool.query(
      `SELECT i.id, s.code AS estado_codigo, s.name AS estado_nombre,
              COALESCE(o."tradeName", o."legalName") AS negocio,
              COALESCE(m.name, '') AS municipio,
              i.subtotal, i."deliveryFee", i.total,
              COALESCE(p.name, '') AS metodo_pago,
              i."deliveryUserId" IS NOT NULL AS tiene_repartidor,
              i."createdAt", i."updatedAt"
         FROM invoice i
         JOIN "stateType" s ON s.id = i."stateTypeId"
         JOIN organizational o ON o.id = i."organizationalId"
         LEFT JOIN municipality m ON m.id = o."municipalityId"
         LEFT JOIN "paidType" p ON p.id = i."paidTypeId"
        WHERE i.id = $1`,
      [pedidoId],
    );
    const r = rows[0];
    if (!r) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `El pedido #${pedidoId} no existe`,
      });
    }
    return {
      id: r.id,
      estadoCodigo: r.estado_codigo,
      estadoNombre: r.estado_nombre,
      negocio: r.negocio,
      municipio: r.municipio,
      subtotal: Number(r.subtotal),
      domicilio: Number(r.deliveryFee),
      total: Number(r.total),
      metodoPago: r.metodo_pago,
      tieneRepartidor: r.tiene_repartidor,
      creadoEn: r.createdAt?.toISOString() ?? '',
      actualizadoEn: r.updatedAt?.toISOString() ?? '',
    };
  }

  seguirPedido({ pedidoId }: SeguirPedidoRequest): Observable<EventoPedido> {
    this.logger.log(`SeguirPedido(${pedidoId || 'todos'}) [server-streaming] abierto`);

    // 1) Snapshot: el estado actual del pedido (si se pidió uno concreto).
    const snapshot$ = pedidoId
      ? defer(() => from(this.obtenerPedido({ pedidoId }))).pipe(
          map(
            (p): EventoPedido => ({
              tipo: 'pedido.snapshot',
              pedidoId: p.id,
              estadoCodigo: p.estadoCodigo,
              negocio: p.negocio,
              total: p.total,
              ocurridoEn: p.actualizadoEn || p.creadoEn,
              particion: -1,
              offset: '',
            }),
          ),
        )
      : EMPTY;

    // 2) En vivo: cada evento que llega por Kafka para ese pedido (o todos).
    const vivo$ = this._feed.eventos$.pipe(
      filter((e) => !pedidoId || e.pedidoId === pedidoId),
    );

    return new Observable<EventoPedido>((sub) => {
      const s = concat(snapshot$, vivo$).subscribe(sub);
      return () => {
        this.logger.log(`SeguirPedido(${pedidoId || 'todos'}) cerrado por el cliente`);
        s.unsubscribe();
      };
    });
  }
}
