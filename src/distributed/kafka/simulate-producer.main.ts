/**
 * Producer de prueba (Sistemas Distribuidos, parte 2): simula N pedidos que
 * nacen y avanzan por sus estados, sin pasar por la app. Sirve para probar el
 * topic y los consumers sin hacer pedidos reales.
 *
 *   KAFKA_BROKERS=localhost:9094 pnpm kafka:simular            (10 pedidos)
 *   KAFKA_BROKERS=localhost:9094 SIMULAR_PEDIDOS=30 pnpm kafka:simular
 */
import { hostname } from 'os';
import {
  KAFKA_TOPIC,
  PedidoEvento,
  createKafka,
  ensureTopic,
} from './kafka.config';

const N = parseInt(process.env.SIMULAR_PEDIDOS || '10', 10);
const NEGOCIOS = ['Comidas Rapidas 24 H', 'Pizzería Villagarzón', 'Droguería Central'];
const FLUJO = ['PEND', 'ACEP', 'PREP', 'RUTA', 'ENTR'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const kafka = createKafka('simulador');
  await ensureTopic(kafka);
  const producer = kafka.producer();
  await producer.connect();

  const base = 900000 + Math.floor(Math.random() * 1000) * 100;
  for (let i = 0; i < N; i++) {
    const pedidoId = base + i;
    const negocio = NEGOCIOS[i % NEGOCIOS.length];
    const total = 15000 + Math.round(Math.random() * 60) * 1000;
    // Cada pedido recorre parte del flujo; todos sus eventos van con la misma
    // key → misma partición → orden garantizado.
    const pasos = FLUJO.slice(0, 1 + Math.floor(Math.random() * FLUJO.length));
    for (const [k, estado] of pasos.entries()) {
      const evento: PedidoEvento = {
        tipo: k === 0 ? 'pedido.creado' : 'pedido.actualizado',
        pedidoId,
        estadoCodigo: estado,
        negocioId: (i % NEGOCIOS.length) + 1,
        negocio,
        municipioId: 1086,
        total,
        ocurridoEn: new Date().toISOString(),
        origen: `simulador@${hostname()}`,
      };
      const [meta] = await producer.send({
        topic: KAFKA_TOPIC,
        messages: [{ key: String(pedidoId), value: JSON.stringify(evento) }],
      });
      console.log(
        `→ ${evento.tipo.padEnd(18)} #${pedidoId} [${estado}] partición ${meta.partition} offset ${meta.baseOffset}`,
      );
      await sleep(300);
    }
  }
  await producer.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
