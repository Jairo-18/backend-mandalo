# Despliegue en Dokploy (demo en vivo)

Se reutiliza lo que ya existe en dev:

| App de Dokploy | Dominio | Cambio |
|---|---|---|
| back dev | `apidev.somosmandalo.com` | rama **`sistemas-distribuidos`** + 3 variables |
| front dev | `app.somosmandalo.com` | ninguno (ya apunta a apidev) |
| **nueva** Compose `sistemas-distribuidos` | `sd-kafka.somosmandalo.com` (Kafka UI) | Kafka, Kafka UI, gRPC, 2 consumers |

Todo usa **mandalo_dev**. Producción no se toca.

## 1. Compose nueva (Kafka + gRPC + consumers)

1. Proyecto Mándalo → **Create Service → Compose**, nombre `sistemas-distribuidos`.
2. GitHub `backend-mandalo`, rama `sistemas-distribuidos`, Compose Path
   `./sistemas-distribuidos/docker-compose.yml`.
3. **Environment** (ver `.env.example`): `DB_HOST/PORT/DATABASE/USERNAME/PASSWORD/SSL`
   de **mandalo_dev** (los mismos del back dev), `KAFKA_UI_USER`, `KAFKA_UI_PASSWORD`.
4. **Domains**: servicio `kafka-ui`, puerto `8080` → `sd-kafka.somosmandalo.com`
   (crear el registro DNS igual que los otros subdominios).
5. **Deploy** primero esta Compose, antes del paso 2.
   - `kafka-init` debe terminar con `PartitionCount: 2`.
   - `consumer-a` y `consumer-b` muestran `particiones asignadas: [1]` y `[0]`.
   - `pedidos-grpc` muestra `Servidor gRPC escuchando en 0.0.0.0:50051`.

Kafka y el servicio gRPC quedan en `dokploy-network` con los nombres `sd-kafka`
y `sd-pedidos-grpc`, que es como los encuentra el back dev.

## 2. Back dev (`apidev.somosmandalo.com`)

1. General → Provider → rama: `dev` → **`sistemas-distribuidos`**. La rama sale de
   `dev`, así que trae todo lo de dev más esto.
2. Environment, agregar:
   ```
   KAFKA_BROKERS=sd-kafka:9092
   GRPC_PEDIDOS_URL=sd-pedidos-grpc:50051
   SD_DEMO=true
   ```
3. Deploy. En sus logs debe salir
   `[KafkaProducer] Conectado a sd-kafka:9092 → topic pedidos.eventos`.
4. Abrir **https://apidev.somosmandalo.com/sd**, la página de la demo.

Si algo falla, quitar `KAFKA_BROKERS` deja el API exactamente como antes, porque
el producer queda apagado. Para volver del todo: rama `dev` y redeploy.

## 3. Logs en tiempo real

Dokploy → Compose `sistemas-distribuidos` → **Logs** → elegir `consumer-a`,
`consumer-b` o `pedidos-grpc`; y Dokploy → back dev → Logs (líneas `KafkaProducer →`).

## 4. Guion de la demo (≈5 min)

Pantallas abiertas: **(1)** `apidev.somosmandalo.com/sd`, **(2)** Kafka UI → Topics →
`pedidos.eventos` (Partitions / Consumers), **(3)** logs de `consumer-a` y `consumer-b`.

1. **Topic y grupo**: en Kafka UI, 2 particiones y el grupo `notificaciones`
   con un consumer en cada una.
2. **Pedido en vivo**: desde el celular (cliente, `app.somosmandalo.com`), pedir en
   "Comidas Rapidas 24 H".
   - En `/sd` aparece `pedido.creado` con su partición y offset (stream gRPC).
   - En los logs, UN solo consumer imprime "🛍️ Nuevo pedido #…".
3. **Flujo**: el negocio (otra ventana) acepta y prepara; el repartidor (ventana
   incógnito) toma y entrega. Cada paso sale en `/sd` y siempre en la **misma
   partición** (key = id del pedido → orden garantizado).
4. **Unary**: en `/sd`, escribir el número del pedido → `ObtenerPedido` responde en ms.
5. **Rebalanceo**: Stop a `consumer-b`. En ~30 s `consumer-a` imprime
   `particiones asignadas: [0, 1]`; otro pedido lo procesa A. Start a B y se
   vuelven a repartir.
6. Opcional, ráfaga simulada: terminal del contenedor `pedidos-grpc` →
   `KAFKAJS_NO_PARTITIONER_WARNING=1 SIMULAR_PEDIDOS=10 node dist/src/distributed/kafka/simulate-producer.main`

## Apagar

Back dev → volver a rama `dev`, quitar las 3 variables y redeploy. Stop o borrar la
Compose `sistemas-distribuidos` (y su volumen `kafka-data`).
