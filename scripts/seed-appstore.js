/**
 * Siembra de catálogo DEMO en PRODUCCIÓN para la revisión de la App Store.
 *
 * Crea negocios ficticios en Mocoa y Villagarzón (con su dueño NEGO) y los
 * productos de cada uno, más las 3 cuentas demo que se le entregan a Apple
 * (cliente con dirección por defecto en Mocoa, negocio y domiciliario).
 *
 * Los productos se crean por la API REAL (POST /product/create + /:id/image),
 * así las fotos quedan alojadas en apiprod.somosmandalo.com y no dependen de
 * un host externo. Los negocios y usuarios sí van por SQL (no hay endpoint
 * público para crearlos).
 *
 * TODO lo que crea queda marcado para poder borrarlo de un tirón:
 *   - NIT de los negocios:  900900XX-N   (LIKE '900900%')
 *   - correo de los dueños: *@demo.mandalo.com
 *   - cuentas demo:         demo.*@somosmandalo.com
 * Ver `cleanup-appstore.js` para el borrado.
 *
 * Es IDEMPOTENTE: si el negocio (por NIT) o el usuario (por correo) ya existe,
 * lo reutiliza; y no vuelve a crear productos si el negocio ya tiene.
 *
 *   node seed-appstore.js --dry    (solo imprime el plan)
 *   node seed-appstore.js
 */
const fs = require('fs');
const BACK = 'C:/Trabajo/mandalo/backend-mandalo';
const { Client } = require(`${BACK}/node_modules/pg`);
const bcrypt = require(`${BACK}/node_modules/bcryptjs`);

const DRY = process.argv.includes('--dry');

const env = {};
for (const l of fs.readFileSync(`${BACK}/.env.production`, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const API = env.APP_BASE_URL;
const CLIENT_KEY = env.APP_CLIENT_API_KEY;
const TERMS_VERSION = '2026-07-21';

/** Contraseña única de todas las cuentas demo (la que se le da a Apple). */
const DEMO_PASSWORD = 'MandaloDemo2026';

/** Centros de los dos municipios. Todo se siembra alrededor de estos puntos. */
const MUNI = {
  Mocoa: { lat: 1.1489, lng: -76.6483, id: 1074 },
  Villagarzon: { lat: 1.0287, lng: -76.6172, id: 1086 },
};
const DEPT_ID = 27; // Putumayo

// Dispersión de ±0.012° ≈ ±1,3 km: todos caen MUY dentro del radio de 10 km
// que aplica el feed desde la dirección del cliente.
const spread = (base, i, k) => base + ((((i * 37 + k * 53) % 25) - 12) / 1000);

/** [nombre, precio, descuento%, categoryCode, keywordDeLaFoto] */
const BUSINESSES = [
  {
    muni: 'Mocoa',
    legalName: 'INVERSIONES SABOR ANDINO S.A.S.',
    tradeName: 'Sabor Andino',
    line: 'Preparado al momento en Sabor Andino.',
    desc: 'Comida típica de la región y almuerzos del día.',
    tags: ['RES'],
    logo: 'restaurant',
    products: [
      ['Bandeja paisa', 24000, 0, 'ALMUERZOS', 'colombian-food'],
      ['Sancocho de gallina', 18000, 10, 'ALMUERZOS', 'soup'],
      ['Churrasco con papa criolla', 28000, 0, 'PARRILLA', 'steak'],
      ['Arroz con pollo', 16000, 0, 'ARROCES', 'rice-chicken'],
      ['Empanadas de carne x3', 6000, 15, 'EMPANADAS', 'empanadas'],
      ['Jugo natural de mora', 5000, 0, 'BEBIDAS', 'juice'],
      ['Gaseosa personal', 3500, 0, 'GASEOSAS', 'soda'],
    ],
  },
  {
    muni: 'Mocoa',
    legalName: 'COMIDAS RAPIDAS EL RINCON S.A.S.',
    tradeName: 'El Rincón Rápido',
    line: 'Recién hecho en El Rincón Rápido.',
    desc: 'Hamburguesas, perros calientes y salchipapas.',
    tags: ['COMIDAS_RAPIDAS'],
    logo: 'burger-shop',
    products: [
      ['Hamburguesa sencilla', 13000, 0, 'HAMBURGUESAS', 'hamburger'],
      ['Hamburguesa doble carne', 19000, 10, 'HAMBURGUESAS', 'cheeseburger'],
      ['Perro caliente especial', 10000, 0, 'HOT_DOGS', 'hotdog'],
      ['Salchipapa personal', 11000, 0, 'SALCHIPAPAS', 'french-fries'],
      ['Salchipapa familiar', 22000, 15, 'SALCHIPAPAS', 'fries'],
      ['Malteada de vainilla', 9000, 0, 'BEBIDAS', 'milkshake'],
      ['Gaseosa 1.5L', 6000, 0, 'GASEOSAS', 'cola'],
    ],
  },
  {
    muni: 'Mocoa',
    legalName: 'PIZZAS Y PASTAS NAPOLI LTDA',
    tradeName: 'Pizzería Napoli',
    line: 'Al horno de leña en Pizzería Napoli.',
    desc: 'Pizzas artesanales al horno de leña y pastas.',
    tags: ['RES'],
    logo: 'pizzeria',
    products: [
      ['Pizza personal margarita', 17000, 0, 'PIZZA', 'margherita-pizza'],
      ['Pizza mediana pepperoni', 33000, 0, 'PIZZA', 'pepperoni-pizza'],
      ['Pizza grande hawaiana', 46000, 10, 'PIZZA', 'pizza'],
      ['Lasaña de carne', 25000, 0, 'PASTAS', 'lasagna'],
      ['Espaguetis a la boloñesa', 21000, 0, 'PASTAS', 'spaghetti'],
      ['Pan de ajo', 8000, 0, 'PAN', 'garlic-bread'],
      ['Limonada de coco', 7000, 0, 'BEBIDAS', 'lemonade'],
    ],
  },
  {
    muni: 'Mocoa',
    legalName: 'DROGUERIA SALUD TOTAL S.A.S.',
    tradeName: 'Droguería Salud Total',
    line: 'Disponible en Droguería Salud Total, entrega a domicilio.',
    desc: 'Medicamentos, cuidado personal y productos de aseo.',
    tags: ['FARM'],
    logo: 'pharmacy',
    products: [
      ['Acetaminofén 500mg x20', 6000, 0, 'ANALGESICOS', 'pills'],
      ['Ibuprofeno 400mg x10', 8000, 0, 'ANALGESICOS', 'medicine'],
      ['Suero oral 500ml', 4500, 0, 'BEBIDAS', 'bottle'],
      ['Alcohol antiséptico 350ml', 7000, 0, 'ASEO', 'antiseptic'],
      ['Gel antibacterial 250ml', 9000, 5, 'ASEO', 'hand-sanitizer'],
      ['Vitamina C x30', 22000, 10, 'SUPLEMENTOS', 'vitamins'],
      ['Curas adhesivas x20', 5500, 0, 'ANALGESICOS', 'bandage'],
    ],
  },
  {
    muni: 'Mocoa',
    legalName: 'SUPERMERCADO LA ECONOMIA S.A.S.',
    tradeName: 'Supermercado La Economía',
    line: 'Disponible en Supermercado La Economía, entrega a domicilio.',
    desc: 'Mercado, víveres y aseo al mejor precio.',
    tags: ['SUPERMERCADO', 'MERCADO'],
    logo: 'supermarket',
    products: [
      ['Arroz 500g', 3200, 0, 'CANASTA_FAMILIAR', 'rice'],
      ['Aceite de girasol 1L', 12000, 5, 'CANASTA_FAMILIAR', 'cooking-oil'],
      ['Panela x 1kg', 6500, 0, 'CANASTA_FAMILIAR', 'sugar'],
      ['Huevos AA x30', 19000, 0, 'CANASTA_FAMILIAR', 'eggs'],
      ['Leche entera 1L', 4200, 0, 'CANASTA_FAMILIAR', 'milk'],
      ['Jabón en polvo 1kg', 14000, 0, 'ASEO', 'detergent'],
      ['Papel higiénico x4', 8500, 0, 'ASEO', 'toilet-paper'],
      ['Banano x libra', 2500, 0, 'FRUTAS', 'bananas'],
    ],
  },
  {
    muni: 'Mocoa',
    legalName: 'PANADERIA TRIGO DE ORO LTDA',
    tradeName: 'Panadería Trigo de Oro',
    line: 'Horneado el mismo día en Panadería Trigo de Oro.',
    desc: 'Pan fresco todos los días, tortas y café.',
    tags: ['PANADERIA', 'CAFETERIA'],
    logo: 'bakery',
    products: [
      ['Pan campesino', 3500, 0, 'PAN', 'bread'],
      ['Pan de bono x3', 5500, 0, 'PAN', 'cheese-bread'],
      ['Croissant', 4000, 0, 'PAN', 'croissant'],
      ['Buñuelos x3', 5000, 0, 'MECATOS', 'fritters'],
      ['Porción torta de chocolate', 6500, 0, 'PASTELES', 'chocolate-cake'],
      ['Café con leche', 4500, 0, 'BEBIDAS', 'coffee'],
    ],
  },
  {
    muni: 'Villagarzon',
    legalName: 'ASADERO EL BUEN POLLO S.A.S.',
    tradeName: 'Asadero El Buen Pollo',
    line: 'A la brasa en Asadero El Buen Pollo.',
    desc: 'Pollo asado a la brasa, broaster y asados.',
    tags: ['RES'],
    logo: 'roast-chicken',
    products: [
      ['Pollo asado entero', 45000, 0, 'POLLO', 'roast-chicken'],
      ['Medio pollo con papa', 25000, 5, 'POLLO', 'grilled-chicken'],
      ['Cuarto de pollo broaster', 14000, 0, 'POLLO', 'fried-chicken'],
      ['Mazorcada personal', 16000, 0, 'MAZORCADAS', 'corn'],
      ['Costillas BBQ', 29000, 10, 'PARRILLA', 'ribs'],
      ['Gaseosa 1.5L', 6000, 0, 'GASEOSAS', 'soda-bottle'],
    ],
  },
  {
    muni: 'Villagarzon',
    legalName: 'LICORES LA ESTRELLA S.A.S.',
    tradeName: 'Licores La Estrella',
    line: 'Disponible en Licores La Estrella, entrega a domicilio.',
    desc: 'Cervezas, licores y pasabocas a domicilio.',
    tags: ['ESTANCO'],
    logo: 'liquor-store',
    products: [
      ['Cerveza six pack', 17000, 0, 'CERVEZAS', 'beer'],
      ['Aguardiente 750ml', 42000, 5, 'LICORES', 'liquor-bottle'],
      ['Ron media botella', 28000, 0, 'LICORES', 'rum'],
      ['Vino tinto', 35000, 0, 'LICORES', 'red-wine'],
      ['Papas fritas familiar', 9000, 0, 'MECATOS', 'potato-chips'],
      ['Maní salado', 4000, 0, 'MECATOS', 'peanuts'],
    ],
  },
  {
    muni: 'Villagarzon',
    legalName: 'MERCADO DOÑA ROSA S.A.S.',
    tradeName: 'Mercado Doña Rosa',
    line: 'Fresco del día en Mercado Doña Rosa.',
    desc: 'Frutas, verduras y la tienda del barrio.',
    tags: ['TIENDA_BARRIO', 'MERCADO'],
    logo: 'grocery-store',
    products: [
      ['Tomate x libra', 3000, 0, 'FRUTAS', 'tomatoes'],
      ['Cebolla larga x manojo', 2500, 0, 'FRUTAS', 'onions'],
      ['Papa pastusa x libra', 2800, 0, 'CANASTA_FAMILIAR', 'potatoes'],
      ['Naranja x libra', 3200, 0, 'FRUTAS', 'oranges'],
      ['Piña', 5000, 10, 'FRUTAS', 'pineapple'],
      ['Aguacate', 4500, 0, 'FRUTAS', 'avocado'],
    ],
  },
  {
    muni: 'Villagarzon',
    legalName: 'HELADERIA FRUTOS DEL VALLE LTDA',
    tradeName: 'Heladería Frutos del Valle',
    line: 'Artesanal de Heladería Frutos del Valle.',
    desc: 'Helados artesanales, malteadas y postres.',
    tags: ['CAFETERIA'],
    logo: 'ice-cream-shop',
    products: [
      ['Copa de helado 2 bolas', 8000, 0, 'HELADOS', 'ice-cream'],
      ['Banana split', 14000, 10, 'HELADOS', 'banana-split'],
      ['Malteada de fresa', 10000, 0, 'BEBIDAS', 'strawberry-milkshake'],
      ['Ensalada de frutas', 12000, 0, 'FRUTAS', 'fruit-salad'],
      ['Brownie con helado', 11000, 0, 'PASTELES', 'brownie'],
      ['Jugo de maracuyá', 6000, 0, 'BEBIDAS', 'passion-fruit-juice'],
    ],
  },
];

/** Cuentas que se le entregan a Apple en la información de revisión. */
const DEMO_ACCOUNTS = {
  client: {
    email: 'demo.cliente@somosmandalo.com',
    fullName: 'Cuenta Demo Cliente',
    username: 'demo_cliente',
    role: 'USER',
    phone: '+57 320 000 0001',
  },
  delivery: {
    email: 'demo.repartidor@somosmandalo.com',
    fullName: 'Cuenta Demo Domiciliario',
    username: 'demo_repartidor',
    role: 'DELI',
    phone: '+57 320 000 0002',
  },
};

const pic = (kw, lock) =>
  `https://loremflickr.com/600/600/${encodeURIComponent(kw)}?lock=${lock}`;

const log = (...a) => console.log(...a);

async function api(path, { method = 'GET', token, body, form } = {}) {
  const headers = { 'X-Client-Key': CLIENT_KEY };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

async function main() {
  const c = new Client({
    host: env.DB_HOST,
    port: +env.DB_PORT,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    ssl: false,
  });
  await c.connect();

  const roles = Object.fromEntries(
    (await c.query(`SELECT id, code FROM "roleType"`)).rows.map((r) => [r.code, r.id]),
  );
  const cats = Object.fromEntries(
    (await c.query(`SELECT id, code FROM "categoryType"`)).rows.map((r) => [r.code, r.id]),
  );
  const tags = Object.fromEntries(
    (await c.query(`SELECT id, code FROM tag`)).rows.map((r) => [r.code, r.id]),
  );
  const nitTypeId = (
    await c.query(`SELECT id FROM "identificationType" WHERE code = 'NIT'`)
  ).rows[0].id;

  // Validación temprana: un code que no exista arruina la siembra a medias.
  for (const b of BUSINESSES) {
    for (const [, , , cat] of b.products)
      if (!cats[cat]) throw new Error(`categoryType.code inexistente: ${cat}`);
    for (const t of b.tags)
      if (!tags[t]) throw new Error(`tag.code inexistente: ${t}`);
  }

  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

  /** Crea el usuario si no existe (busca por correo). Devuelve su id. */
  async function ensureUser({ email, fullName, username, role, phone, muni, extra = {} }) {
    const found = await c.query(`SELECT id FROM "user" WHERE email = $1`, [email]);
    if (found.rowCount) return { id: found.rows[0].id, created: false };
    if (DRY) return { id: '(dry)', created: true };
    const cols = {
      fullName,
      username,
      email,
      password: hash,
      roleTypeId: roles[role],
      phone,
      departmentId: DEPT_ID,
      municipalityId: muni ? MUNI[muni].id : MUNI.Mocoa.id,
      isActive: true,
      isEmailVerified: true,
      isBanned: false,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
      ...extra,
    };
    const keys = Object.keys(cols);
    const res = await c.query(
      `INSERT INTO "user" (${keys.map((k) => `"${k}"`).join(',')})
       VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
      keys.map((k) => cols[k]),
    );
    return { id: res.rows[0].id, created: true };
  }

  log(`\n${DRY ? '[DRY RUN] ' : ''}Sembrando ${BUSINESSES.length} negocios en ${API}\n`);

  let totalProducts = 0;

  for (let i = 0; i < BUSINESSES.length; i++) {
    const b = BUSINESSES[i];
    const nit = `900900${String(i + 1).padStart(2, '0')}-${(i % 9) + 1}`;
    const base = MUNI[b.muni];
    const lat = spread(base.lat, i, 1);
    const lng = spread(base.lng, i, 2);

    // El primer negocio de la lista es el que se le entrega a Apple como
    // cuenta de NEGOCIO, así el revisor entra a un panel con productos reales.
    const ownerEmail =
      i === 0 ? 'demo.negocio@somosmandalo.com' : `demo.negocio${i + 1}@demo.mandalo.com`;

    const owner = await ensureUser({
      email: ownerEmail,
      fullName: `Dueño ${b.tradeName}`,
      username: `demo_negocio${i + 1}`,
      role: 'NEGO',
      phone: `+57 320 100 00${String(i).padStart(2, '0')}`,
      muni: b.muni,
    });

    let orgRow = await c.query(
      `SELECT id FROM organizational WHERE "identificationNumber" = $1`,
      [nit],
    );
    let orgId = orgRow.rowCount ? orgRow.rows[0].id : null;

    if (!orgId) {
      if (DRY) {
        log(`+ ${b.tradeName} (${b.muni})  ${lat.toFixed(5)}, ${lng.toFixed(5)} — ${b.products.length} productos`);
        totalProducts += b.products.length;
        continue;
      }
      const res = await c.query(
        `INSERT INTO organizational
          ("legalName","tradeName","identificationNumber","identificationTypeId",
           description,"logoUrl",phone,address,latitude,longitude,
           "municipalityId","departmentId","legalPersonId","isActive",
           "openTime","closeTime","temporarilyClosed","commissionOrderRate",
           "termsAcceptedAt","termsVersion")
         -- Horario en NULL A PROPÓSITO: isBusinessOpen() lo lee como "siempre
         -- abierto". Con un horario real (07:00–22:00 hora de Colombia) el
         -- revisor de Apple, que mira desde otra zona horaria y a cualquier
         -- hora, se topa con "negocio cerrado" y store/[id].tsx le bloquea
         -- el carrito — rechazo seguro por no poder completar un pedido.
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,
                 NULL,NULL,false,5,now(),$14)
         RETURNING id`,
        [
          b.legalName,
          b.tradeName,
          nit,
          nitTypeId,
          b.desc,
          pic(b.logo, 900 + i),
          `+57 320 100 00${String(i).padStart(2, '0')}`,
          `Calle ${10 + i} # ${5 + i}-${20 + i}, ${b.muni}`,
          lat,
          lng,
          base.id,
          DEPT_ID,
          owner.id,
          TERMS_VERSION,
        ],
      );
      orgId = res.rows[0].id;
      for (const t of b.tags) {
        await c.query(
          `INSERT INTO "organizationalTag" ("organizationalId","tagId")
           VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [orgId, tags[t]],
        );
      }
      log(`✓ negocio #${orgId} ${b.tradeName} (${b.muni})`);
    } else {
      log(`· negocio #${orgId} ${b.tradeName} ya existía`);
    }

    if (DRY) continue;

    const have = await c.query(
      `SELECT count(*)::int n FROM product WHERE "organizationalId" = $1`,
      [orgId],
    );
    if (have.rows[0].n > 0) {
      log(`  · ya tiene ${have.rows[0].n} productos, no toco nada`);
      continue;
    }

    // Productos por la API, como los crearía el propio negocio.
    const login = await api('/auth/sign-in', {
      method: 'POST',
      body: { email: ownerEmail, password: DEMO_PASSWORD },
    });
    const token = login.data.tokens.accessToken;

    for (let k = 0; k < b.products.length; k++) {
      const [name, priceSale, discount, cat, kw] = b.products[k];
      const created = await api('/product/create', {
        method: 'POST',
        token,
        body: {
          name,
          priceSale,
          discount,
          categoryTypeId: cats[cat],
          description: `${name}. ${b.line}`,
          isActive: true,
        },
      });
      const productId = created.data.rowId;

      try {
        const img = await fetch(pic(kw, i * 100 + k), { redirect: 'follow' });
        if (!img.ok) throw new Error(`imagen HTTP ${img.status}`);
        const buf = Buffer.from(await img.arrayBuffer());
        const form = new FormData();
        form.append('file', new Blob([buf], { type: 'image/jpeg' }), `${kw}.jpg`);
        await api(`/product/${productId}/image`, { method: 'POST', token, form });
      } catch (e) {
        log(`  ⚠ ${name}: sin foto (${e.message})`);
      }
      totalProducts++;
      log(`  + ${name}  $${priceSale.toLocaleString('es-CO')}`);
    }
  }

  // ---- cuentas demo para Apple ----
  const client = await ensureUser({
    ...DEMO_ACCOUNTS.client,
    muni: 'Mocoa',
    extra: {
      address: 'Calle 8 # 5-42, Mocoa, Putumayo',
      latitude: MUNI.Mocoa.lat,
      longitude: MUNI.Mocoa.lng,
    },
  });
  log(`\n${client.created ? '✓' : '·'} cliente demo ${DEMO_ACCOUNTS.client.email}`);

  if (!DRY) {
    const hasAddr = await c.query(
      `SELECT count(*)::int n FROM "userAddress" WHERE "userId" = $1`,
      [client.id],
    );
    if (!hasAddr.rows[0].n) {
      await c.query(
        `INSERT INTO "userAddress" ("userId",label,address,details,latitude,longitude,"isDefault")
         VALUES ($1,'Casa','Calle 8 # 5-42, Mocoa, Putumayo','Casa blanca, segundo piso',$2,$3,true)`,
        [client.id, MUNI.Mocoa.lat, MUNI.Mocoa.lng],
      );
      log('  + dirección por defecto en Mocoa (centro)');
    }
  }

  const deli = await ensureUser({
    ...DEMO_ACCOUNTS.delivery,
    muni: 'Mocoa',
    extra: {
      address: 'Carrera 7 # 12-30, Mocoa, Putumayo',
      latitude: MUNI.Mocoa.lat,
      longitude: MUNI.Mocoa.lng,
      vehiclePlate: 'ABC12D',
      identificationNumber: '1122334455',
      identificationTypeId: 1,
      observations: 'Cuenta demo para la revisión de la App Store.',
    },
  });
  log(`${deli.created ? '✓' : '·'} domiciliario demo ${DEMO_ACCOUNTS.delivery.email}`);

  // ---- negocio de prueba del usuario: fuera del feed ----
  if (!DRY) {
    const off = await c.query(
      `UPDATE organizational SET "isActive" = false
       WHERE id = 23 AND "tradeName" = 'Test Villa' RETURNING id`,
    );
    if (off.rowCount) log('\n✓ "Test Villa" (#23) desactivado — sale del feed, sus 2 pedidos históricos quedan intactos');
  }

  log(`\nListo. Productos creados en esta corrida: ${totalProducts}`);
  log(`Contraseña de las 3 cuentas demo: ${DEMO_PASSWORD}`);
  await c.end();
}

main().catch((e) => {
  console.error('\n✖ FALLÓ:', e.message);
  process.exit(1);
});
