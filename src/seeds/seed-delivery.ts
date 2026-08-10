import { AppDataSource } from '../../typeorm.config';
import { User } from '../shared/entities/user.entity';
import { Organizational } from '../shared/entities/organizational.entity';
import { Product } from '../shared/entities/product.entity';
import { Invoice } from '../shared/entities/invoice.entity';
import { InvoiceDetail } from '../shared/entities/invoiceDetail.entity';
import { UserAddress } from '../shared/entities/userAddress.entity';

/**
 * Deja UN pedido en RUTA, asignado a `repartidor1@demo.mandalo.com`, para
 * grabar el video de "divulgación destacada" de Google Play (NOTAS §67-68).
 * NO crea negocio/cliente/repartidor nuevos — reusa las cuentas demo_* que
 * deja `dev-seed.ts` (falla con un mensaje claro si no las encuentra, en vez
 * de crearlas por su cuenta).
 *
 * Replica EXACTAMENTE las columnas que toca un despacho real PREP→RUTA
 * (`invoice.service.ts`: `take()` + `changeState()` + `stampTransition()`):
 * deliveryUserId, takenAt, stateTypeId, onRouteAt, deliveryEstimatedMinutes.
 * El resto de campos (pickupCode/deliveryCode/prepEstimatedMinutes/
 * acceptedAt/preparingAt) se llenan igual que `dev-seed.ts` los llena para
 * cualquier pedido que "reached('RUTA')" — no son necesarios para que
 * `needsBackgroundDisclosure` se dispare, pero sin ellos el detalle del
 * pedido en la app se vería con campos en null que un despacho real nunca
 * deja vacíos (código de recogida, tiempo estimado, etc.) — se rompería la
 * ilusión en el video.
 *
 * Idempotente: cada corrida borra el pedido de prueba anterior (marcado con
 * `[seed-delivery]` en `notes`, un tag más específico que el `[seed]` que ya
 * usa `dev-seed.ts` — sigue siendo barrido por su limpieza si esa corre después).
 *
 *   cd backend-mandalo
 *   cross-env NODE_ENV=development ts-node src/seeds/seed-delivery.ts
 */

const DEMO_PASSWORD = 'Demo@1234';
const DELIVERY_EMAIL = 'repartidor1@demo.mandalo.com';
const CLIENT_EMAIL = 'cliente1@demo.mandalo.com';
const API_BASE_URL = 'https://apidev.somosmandalo.com';

/**
 * Puntos REALES de Mocoa (verificados por OpenStreetMap/Nominatim, no
 * inventados) para que el video de tracking muestre movimiento visible: el
 * mapa del cliente encuadra TODOS los puntos conocidos (negocio + entrega +
 * domiciliario) — con el negocio original (~76km de la entrega real del
 * pedido) cualquier salto de GPS de unos cientos de metros es imperceptible
 * en pantalla. A ~1.7km, sí se ve.
 *   - Coliseo ITP: 1.1583370, -76.6515664
 *   - Estadio Agustín Codazzi: 1.1451559, -76.6438840
 * El negocio demo recupera sus coordenadas normales (aleatorias dentro de
 * Mocoa) la próxima vez que corra `dev-seed.ts` completo — este script solo
 * las pisa para la duración de la demo.
 */
const DEMO_BUSINESS_COORDS = { latitude: 1.158337, longitude: -76.6515664 };
const DEMO_DELIVERY_COORDS = { latitude: 1.1451559, longitude: -76.643884 };
const DEMO_DELIVERY_ADDRESS = 'Cerca al Estadio Agustín Codazzi, Mocoa';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const code4 = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0');

function haversineKm(la1: number, lo1: number, la2: number, lo2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLa = toRad(la2 - la1);
  const dLo = toRad(lo2 - lo1);
  const a =
    Math.sin(dLa / 2) ** 2 +
    Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Falla con un mensaje que dice EXACTAMENTE qué correr antes de reintentar. */
function requireSeeded<T>(value: T | null, what: string): T {
  if (!value) {
    throw new Error(
      `No encontré ${what}. Corre primero:\n` +
        `  cd backend-mandalo && cross-env NODE_ENV=development ts-node src/seeds/dev-seed.ts`,
    );
  }
  return value;
}

async function main() {
  await AppDataSource.initialize();
  const ds = AppDataSource;

  const userRepo = ds.getRepository(User);
  const orgRepo = ds.getRepository(Organizational);
  const productRepo = ds.getRepository(Product);
  const addrRepo = ds.getRepository(UserAddress);
  const invoiceRepo = ds.getRepository(Invoice);
  const detailRepo = ds.getRepository(InvoiceDetail);

  const states = Object.fromEntries(
    (await ds.query(`SELECT id, code FROM "stateType"`)).map((r: any) => [
      r.code,
      r.id,
    ]),
  ) as Record<string, number>;
  const paids = Object.fromEntries(
    (await ds.query(`SELECT id, code FROM "paidType"`)).map((r: any) => [
      r.code,
      r.id,
    ]),
  ) as Record<string, number>;

  // ---- cuentas demo existentes (nunca se crean acá) ----
  const delivery = requireSeeded(
    await userRepo.findOne({ where: { email: DELIVERY_EMAIL } }),
    `el repartidor demo "${DELIVERY_EMAIL}"`,
  );
  const client = requireSeeded(
    await userRepo.findOne({ where: { email: CLIENT_EMAIL } }),
    `el cliente demo "${CLIENT_EMAIL}"`,
  );
  const org = requireSeeded(
    await orgRepo
      .createQueryBuilder('o')
      .where(`o."identificationNumber" LIKE '900500%'`)
      .orderBy('o.id', 'ASC')
      .getOne(),
    'ningún negocio demo (NIT 9005*)',
  );
  const product = requireSeeded(
    await productRepo.findOne({ where: { organizationalId: org.id } }),
    `productos del negocio demo "${org.tradeName}"`,
  );
  const clientAddr = await addrRepo.findOne({
    where: { userId: client.id, isDefault: true },
  });

  // Reancla el negocio demo a un punto real de Mocoa para esta demo (ver
  // comentario de DEMO_BUSINESS_COORDS) — se guarda antes de calcular
  // distancia/tarifa para que salgan consistentes con la ruta que se va a
  // simular por geo fix.
  org.latitude = DEMO_BUSINESS_COORDS.latitude;
  org.longitude = DEMO_BUSINESS_COORDS.longitude;
  await orgRepo.save(org);

  const deliveryLat = DEMO_DELIVERY_COORDS.latitude;
  const deliveryLng = DEMO_DELIVERY_COORDS.longitude;
  const deliveryAddress = DEMO_DELIVERY_ADDRESS;

  const routeKm = haversineKm(
    DEMO_BUSINESS_COORDS.latitude,
    DEMO_BUSINESS_COORDS.longitude,
    deliveryLat,
    deliveryLng,
  );
  console.log(
    `Usando: repartidor="${delivery.email}", cliente="${client.email}", negocio="${org.tradeName}" (reanclado a Coliseo ITP), producto="${product.name}"`,
  );
  console.log(`Ruta negocio -> entrega: ${routeKm.toFixed(3)} km (Coliseo ITP -> Estadio Agustín Codazzi).`);

  // ---- limpieza idempotente de la corrida anterior ----
  const old: any[] = await ds.query(
    `SELECT id FROM invoice WHERE notes LIKE '%[seed-delivery]%'`,
  );
  if (old.length) {
    const ids = old.map((r) => r.id);
    await ds.query(`DELETE FROM "invoiceDetail" WHERE "invoiceId" = ANY($1)`, [
      ids,
    ]);
    await ds.query(`DELETE FROM invoice WHERE id = ANY($1)`, [ids]);
    console.log(`Borrado pedido [seed-delivery] anterior (id ${ids.join(', ')}).`);
  }

  // ---- pedido: subtotal/fee reales, como los calcularía el checkout ----
  const unitPrice = product.priceSale;
  const discount = product.discount ?? 0;
  const finalUnit = round2(unitPrice * (1 - discount / 100));
  const subtotal = finalUnit; // qty = 1
  const distKm = haversineKm(org.latitude, org.longitude, deliveryLat, deliveryLng);
  const deliveryFee = Math.min(Math.max(round2(2500 + 1200 * distKm), 2500), 12000);
  const total = round2(subtotal + deliveryFee);
  const deliveryEstimatedMinutes = Math.min(
    Math.max(Math.round(((distKm * 1.3) / 25) * 60) + 5, 10),
    90,
  );

  const now = Date.now();
  const createdAt = new Date(now - 40 * 60_000);
  const t = (offsetMin: number) => new Date(createdAt.getTime() + offsetMin * 60_000);

  const invoice = invoiceRepo.create({
    userId: client.id,
    organizationalId: org.id,
    deliveryUserId: delivery.id,
    stateTypeId: states['RUTA'],
    paidTypeId: paids['EFEC'], // efectivo: sin comprobante de pago que simular
    deliveryAddress,
    deliveryDetails: clientAddr?.details ?? undefined,
    deliveryLatitude: deliveryLat,
    deliveryLongitude: deliveryLng,
    subtotal,
    deliveryFee,
    total,
    notes: '[seed] [seed-delivery] Pedido de prueba — video de divulgación de ubicación.',
    pickupCode: code4(),
    deliveryCode: code4(),
    prepEstimatedMinutes: 20,
    deliveryEstimatedMinutes,
    // Mismo conjunto de columnas que un despacho PREP→RUTA real deja escrito
    // (invoice.service.ts: take() + changeState() + stampTransition()).
    acceptedAt: t(2),
    preparingAt: t(11),
    takenAt: t(21),
    onRouteAt: t(31),
  });

  const saved = await invoiceRepo.save(invoice);
  await detailRepo.save(
    detailRepo.create({
      invoiceId: saved.id,
      productId: product.id,
      productName: product.name,
      unitPrice,
      discount,
      quantity: 1,
      lineTotal: subtotal,
    }),
  );
  // CreateDateColumn pone "now" al insertar — igual que dev-seed.ts, se
  // corrige aparte para que el pedido no se vea creado hace 0 minutos.
  await ds.query(`UPDATE invoice SET "createdAt" = $1 WHERE id = $2`, [
    createdAt,
    saved.id,
  ]);

  console.log(`✅ Invoice #${saved.id} creado en RUTA, asignado a ${delivery.email}.`);

  // ---- validación desde el lado de la app: el endpoint real, no solo la DB ----
  const clientApiKey = process.env.APP_CLIENT_API_KEY;
  if (!clientApiKey) {
    console.warn(
      '⚠️  APP_CLIENT_API_KEY no está en el entorno — me salto la validación por API. Verifica a mano en la app.',
    );
  } else {
    const signIn = await fetch(`${API_BASE_URL}/auth/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: DELIVERY_EMAIL, password: DEMO_PASSWORD }),
    });
    if (!signIn.ok) {
      throw new Error(
        `Sign-in de ${DELIVERY_EMAIL} contra ${API_BASE_URL} falló (${signIn.status}): ${await signIn.text()}`,
      );
    }
    const signInBody = (await signIn.json()) as {
      data: { tokens: { accessToken: string } };
    };
    const accessToken = signInBody.data.tokens.accessToken;

    const list = await fetch(`${API_BASE_URL}/invoice/paginated?perPage=50`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Client-Key': clientApiKey,
      },
    });
    if (!list.ok) {
      throw new Error(
        `GET /invoice/paginated falló (${list.status}): ${await list.text()}`,
      );
    }
    const listBody = (await list.json()) as {
      data: Array<{ id: number; stateType?: { code: string }; deliveryUserId: string }>;
    };
    const found = listBody.data.find((i) => i.id === saved.id);

    if (!found) {
      console.error(
        `❌ El pedido #${saved.id} NO aparece en /invoice/paginated para ${DELIVERY_EMAIL}. ` +
          `activeInvoiceIds quedaría vacío y la app no mostraría el aviso de divulgación. ` +
          `Revisa: deliveryUserId guardado, stateTypeId resuelto a RUTA, y que el JWT/API key sean del entorno dev correcto.`,
      );
      process.exitCode = 1;
    } else if (found.stateType?.code !== 'RUTA') {
      console.error(
        `❌ El pedido #${saved.id} aparece pero con estado "${found.stateType?.code}", no RUTA.`,
      );
      process.exitCode = 1;
    } else {
      console.log(
        `✅ Confirmado por API: /invoice/paginated devuelve #${saved.id} en RUTA para ${DELIVERY_EMAIL} — activeInvoiceIds lo va a recoger.`,
      );
    }
  }

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
