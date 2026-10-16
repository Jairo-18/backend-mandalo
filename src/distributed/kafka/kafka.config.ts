import { Kafka, logLevel } from 'kafkajs';

/**
 * Configuración compartida de Kafka (Sistemas Distribuidos). La usan el API
 * (producer), el servicio gRPC y el consumer de notificaciones.
 *
 * Sin `KAFKA_BROKERS` todo queda apagado: el API se comporta igual que en
 * producción.
 */
export const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'pedidos.eventos';
export const KAFKA_PARTITIONS = 2;

export function kafkaBrokers(): string[] {
  return (process.env.KAFKA_BROKERS || '')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
}

export function createKafka(clientId: string): Kafka {
  return new Kafka({
    clientId,
    brokers: kafkaBrokers(),
    logLevel: logLevel.WARN,
    retry: { retries: 10, initialRetryTime: 500 },
  });
}

/** Crea el topic con 2 particiones si no existe (idempotente). */
export async function ensureTopic(kafka: Kafka): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();
  try {
    if ((await admin.listTopics()).includes(KAFKA_TOPIC)) return;
    await admin.createTopics({
      waitForLeaders: true,
      topics: [
        {
          topic: KAFKA_TOPIC,
          numPartitions: KAFKA_PARTITIONS,
          replicationFactor: 1,
        },
      ],
    });
  } finally {
    await admin.disconnect();
  }
}

/** Mensaje que viaja por el topic `pedidos.eventos` (value en JSON). */
export interface PedidoEvento {
  tipo: 'pedido.creado' | 'pedido.actualizado' | 'pedido.eliminado';
  pedidoId: number;
  estadoCodigo: string;
  negocioId: number;
  negocio: string;
  municipioId: number | null;
  total: number;
  ocurridoEn: string;
  origen: string;
}
