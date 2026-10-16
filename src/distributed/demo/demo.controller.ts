import {
  Controller,
  Get,
  Header,
  Inject,
  MessageEvent,
  NotFoundException,
  OnModuleInit,
  Param,
  ParseIntPipe,
  Sse,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Observable, catchError, firstValueFrom, map, of } from 'rxjs';
import { SkipApiKey } from '../../shared/decorators/skip-api-key.decorator';
import {
  PEDIDOS_SERVICE_NAME,
  PedidosServiceClient,
} from '../generated/pedidos';

export const PEDIDOS_GRPC = 'PEDIDOS_GRPC';
const ASSETS = join(process.cwd(), 'sistemas-distribuidos', 'demo');

/**
 * Página de demo en vivo (`/sd`): el API actúa como CLIENTE gRPC del servicio
 * de pedidos y le pasa el resultado al navegador (unary → JSON, server-
 * streaming → Server-Sent Events). Solo existe con `SD_DEMO=true`.
 */
@SkipApiKey()
@Controller('sd')
export class DemoController implements OnModuleInit {
  private pedidos: PedidosServiceClient;

  constructor(@Inject(PEDIDOS_GRPC) private readonly _client: ClientGrpc) {}

  onModuleInit(): void {
    this.pedidos = this._client.getService<PedidosServiceClient>(PEDIDOS_SERVICE_NAME);
  }

  private assertEnabled(): void {
    if (process.env.SD_DEMO !== 'true') throw new NotFoundException();
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  page(): string {
    this.assertEnabled();
    return readFileSync(join(ASSETS, 'index.html'), 'utf8');
  }

  @Get('app.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  script(): string {
    this.assertEnabled();
    return readFileSync(join(ASSETS, 'app.js'), 'utf8');
  }

  /** Unary: GET /sd/api/pedidos/:id → ObtenerPedido. */
  @Get('api/pedidos/:id')
  async obtener(@Param('id', ParseIntPipe) id: number) {
    this.assertEnabled();
    const inicio = Date.now();
    try {
      const pedido = await firstValueFrom(this.pedidos.obtenerPedido({ pedidoId: id }));
      return { ok: true, ms: Date.now() - inicio, pedido };
    } catch (e: any) {
      return { ok: false, ms: Date.now() - inicio, error: e.details || e.message };
    }
  }

  /** Server-streaming: GET /sd/api/seguir/:id (0 = todos) → SeguirPedido. */
  @Sse('api/seguir/:id')
  seguir(@Param('id', ParseIntPipe) id: number): Observable<MessageEvent> {
    this.assertEnabled();
    return this.pedidos.seguirPedido({ pedidoId: id }).pipe(
      map((evento) => ({ data: evento })),
      catchError((e) => of({ type: 'error-grpc', data: { error: e.details || e.message } })),
    );
  }
}
