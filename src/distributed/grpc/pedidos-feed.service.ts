import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { hostname } from 'os';
import { Consumer } from 'kafkajs';
import { Subject } from 'rxjs';
import { EventoPedido } from '../generated/pedidos';
import {
  KAFKA_TOPIC,
  PedidoEvento,
  createKafka,
  ensureTopic,
  kafkaBrokers,
} from '../kafka/kafka.config';

/**
 * Feed en vivo del servicio gRPC: consume `pedidos.eventos` y lo reemite en
 * un Subject al que se suscriben los streams de `SeguirPedido`.
 *
 * Usa un consumer group PROPIO por instancia (`pedidos-grpc-<host>`): cada
 * réplica del servicio gRPC necesita ver TODOS los eventos (broadcast), a
 * diferencia del grupo `notificaciones`, que reparte el trabajo.
 */
@Injectable()
export class PedidosFeedService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PedidosFeed');
  private consumer: Consumer | null = null;
  readonly eventos$ = new Subject<EventoPedido>();

  async onModuleInit(): Promise<void> {
    if (!kafkaBrokers().length) {
      this.logger.warn('Sin KAFKA_BROKERS: SeguirPedido solo enviará el snapshot');
      return;
    }
    const kafka = createKafka(`pedidos-grpc-${hostname()}`);
    await ensureTopic(kafka);
    this.consumer = kafka.consumer({ groupId: `pedidos-grpc-${hostname()}` });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ partition, message }) => {
        const e = JSON.parse(message.value!.toString()) as PedidoEvento;
        this.eventos$.next({
          tipo: e.tipo,
          pedidoId: e.pedidoId,
          estadoCodigo: e.estadoCodigo,
          negocio: e.negocio,
          total: e.total,
          ocurridoEn: e.ocurridoEn,
          particion: partition,
          offset: message.offset,
        });
      },
    });
    this.logger.log(`Escuchando ${KAFKA_TOPIC} para los streams gRPC`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect();
  }
}
