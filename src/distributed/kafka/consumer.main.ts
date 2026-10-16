/**
 * Consumer de notificaciones (Sistemas Distribuidos, parte 2).
 *
 * Se suscribe a `pedidos.eventos` dentro del consumer group
 * `notificaciones`. Correr DOS instancias con distinto CONSUMER_NAME para ver
 * el reparto de las 2 particiones (una para cada una); si se apaga una, la
 * otra se queda con las dos (rebalanceo).
 *
 *   CONSUMER_NAME=consumer-A KAFKA_BROKERS=localhost:9094 pnpm start:consumer
 */
import { hostname } from 'os';
import { EachMessagePayload } from 'kafkajs';
import {
  KAFKA_TOPIC,
  PedidoEvento,
  createKafka,
  ensureTopic,
} from './kafka.config';

const NAME = process.env.CONSUMER_NAME || hostname();
const GROUP = process.env.KAFKA_GROUP || 'notificaciones';

const log = (msg: string) =>
  console.log(`${new Date().toISOString()} [${NAME}] ${msg}`);

const ESTADOS: Record<string, string> = {
  PEND: 'Pendiente',
  ACEP: 'Aceptado',
  PREP: 'En preparación',
  RUTA: 'En ruta',
  FALL: 'Entrega fallida',
  ENTR: 'Entregado',
  CANC: 'Cancelado',
  DEL: 'Eliminado',
};

/** "Procesamiento": contadores por estado y mensaje de notificación. */
const porEstado = new Map<string, number>();
let procesados = 0;

async function procesar({ partition, message }: EachMessagePayload) {
  const evento = JSON.parse(message.value!.toString()) as PedidoEvento;
  procesados++;
  porEstado.set(evento.estadoCodigo, (porEstado.get(evento.estadoCodigo) ?? 0) + 1);

  const estado = ESTADOS[evento.estadoCodigo] ?? evento.estadoCodigo;
  const notificacion =
    evento.tipo === 'pedido.creado'
      ? `🛍️  Nuevo pedido #${evento.pedidoId} en "${evento.negocio}" por $${evento.total.toLocaleString('es-CO')}`
      : `📦 Pedido #${evento.pedidoId} → ${estado}`;

  log(
    `partición=${partition} offset=${message.offset} key=${message.key} | ${notificacion}`,
  );
  if (procesados % 5 === 0) {
    log(`resumen: ${procesados} eventos | ${JSON.stringify(Object.fromEntries(porEstado))}`);
  }
}

async function main() {
  const kafka = createKafka(`notificaciones-${NAME}`);
  await ensureTopic(kafka);
  const consumer = kafka.consumer({ groupId: GROUP });

  // Muestra qué particiones le tocaron a ESTA instancia tras cada rebalanceo.
  consumer.on(consumer.events.GROUP_JOIN, ({ payload }) => {
    const parts = payload.memberAssignment[KAFKA_TOPIC] ?? [];
    log(
      `unido al grupo "${payload.groupId}" (líder: ${payload.isLeader}) → particiones asignadas: [${parts.join(', ')}]`,
    );
  });
  consumer.on(consumer.events.REBALANCING, () =>
    log('rebalanceando el grupo…'),
  );

  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: true });
  log(`escuchando ${KAFKA_TOPIC} en el grupo "${GROUP}"`);
  await consumer.run({ eachMessage: procesar });

  const salir = async () => {
    log('apagando (saldrá del grupo y el otro consumer tomará sus particiones)');
    await consumer.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
