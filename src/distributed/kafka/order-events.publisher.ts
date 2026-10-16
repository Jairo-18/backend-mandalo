import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { hostname } from 'os';
import { Producer } from 'kafkajs';
import {
  KAFKA_TOPIC,
  PedidoEvento,
  createKafka,
  ensureTopic,
  kafkaBrokers,
} from './kafka.config';

/**
 * Producer de Kafka del API: publica cada cambio de un pedido en
 * `pedidos.eventos`. La clave del mensaje es el id del pedido, así todos los
 * eventos de UN pedido caen en la misma partición y se consumen en orden.
 *
 * Es "fire and forget": si Kafka no está, se loguea y el pedido sigue su curso
 * (el flujo síncrono del cliente nunca depende del broker).
 */
@Injectable()
export class OrderEventsPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('KafkaProducer');
  private producer: Producer | null = null;

  async onModuleInit(): Promise<void> {
    if (!kafkaBrokers().length) return;
    const kafka = createKafka('mandalo-api');
    try {
      await ensureTopic(kafka);
      this.producer = kafka.producer({ allowAutoTopicCreation: false });
      await this.producer.connect();
      this.logger.log(`Conectado a ${kafkaBrokers().join(',')} → topic ${KAFKA_TOPIC}`);
    } catch (e) {
      this.producer = null;
      this.logger.error(`Kafka no disponible: ${(e as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer?.disconnect();
  }

  /**
   * Traduce lo que el gateway manda al negocio por socket a un evento de
   * dominio. Solo interesan `invoice:created` / `invoice:updated`.
   */
  fromSocket(event: string, payload: any): void {
    if (!this.producer || !payload?.id) return;
    if (event !== 'invoice:created' && event !== 'invoice:updated') return;

    const tipo: PedidoEvento['tipo'] =
      event === 'invoice:created'
        ? 'pedido.creado'
        : payload.deleted
          ? 'pedido.eliminado'
          : 'pedido.actualizado';

    void this.publish({
      tipo,
      pedidoId: payload.id,
      estadoCodigo: payload.stateType?.code ?? (payload.deleted ? 'DEL' : ''),
      negocioId: payload.organizationalId ?? payload.organizational?.id ?? 0,
      negocio:
        payload.organizational?.tradeName ||
        payload.organizational?.legalName ||
        '',
      municipioId: payload.organizational?.municipalityId ?? null,
      total: Number(payload.total ?? 0),
      ocurridoEn: new Date().toISOString(),
      origen: hostname(),
    });
  }

  async publish(evento: PedidoEvento): Promise<void> {
    if (!this.producer) return;
    try {
      const [meta] = await this.producer.send({
        topic: KAFKA_TOPIC,
        messages: [
          {
            key: String(evento.pedidoId),
            value: JSON.stringify(evento),
            headers: { tipo: evento.tipo },
          },
        ],
      });
      this.logger.log(
        `→ ${evento.tipo} pedido #${evento.pedidoId} [${evento.estadoCodigo}] ` +
          `partición ${meta.partition} offset ${meta.baseOffset}`,
      );
    } catch (e) {
      this.logger.error(
        `No se pudo publicar ${evento.tipo} #${evento.pedidoId}: ${(e as Error).message}`,
      );
    }
  }
}
