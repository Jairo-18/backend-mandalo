import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../../typeorm.config';
import { User } from '../shared/entities/user.entity';
import { Organizational } from '../shared/entities/organizational.entity';
import { Product } from '../shared/entities/product.entity';
import { Invoice } from '../shared/entities/invoice.entity';
import { InvoiceDetail } from '../shared/entities/invoiceDetail.entity';
import { UserAddress } from '../shared/entities/userAddress.entity';
import { Tag } from '../shared/entities/tag.entity';

/**
 * Semilla de datos FICTICIOS para la DB de dev (§46). Crea negocios con su
 * dueño NEGO + productos, clientes con dirección, repartidores verificados y
 * pedidos en todos los estados. Es IDEMPOTENTE: los datos van marcados (correo
 * `@demo.mandalo.com`, usuario `demo_*`, NIT `9005*`, notas `[seed]`) y en cada
 * corrida se borran los pedidos seed y se recrean los productos seed, así que
 * se puede correr varias veces sin duplicar ni tocar datos reales.
 *
 *   cross-env NODE_ENV=development ts-node src/seeds/dev-seed.ts
 */

const PASSWORD = 'Demo@1234';
const TERMS_VERSION = '2026-07-21';
const pic = (s: string) => `https://picsum.photos/seed/${encodeURIComponent(s)}/500/500`;

const R = (min: number, max: number) => Math.random() * (max - min) + min;
const RI = (min: number, max: number) => Math.floor(R(min, max + 1));
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const code4 = () => String(RI(0, 9999)).padStart(4, '0');
const backDate = (maxDays: number) =>
  new Date(Date.now() - RI(0, maxDays) * 86_400_000 - RI(0, 86_400_000));

function haversineKm(la1: number, lo1: number, la2: number, lo2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLa = toRad(la2 - la1);
  const dLo = toRad(lo2 - lo1);
  const a =
    Math.sin(dLa / 2) ** 2 +
    Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Coords aproximadas de municipios de Putumayo. */
const MUNI: Record<string, { lat: number; lng: number }> = {
  Mocoa: { lat: 1.1489, lng: -76.6483 },
  Villagarzon: { lat: 1.0287, lng: -76.6172 },
  'Puerto Asis': { lat: 0.5047, lng: -76.4966 },
  Orito: { lat: 0.6667, lng: -76.8667 },
  Sibundoy: { lat: 1.2019, lng: -76.9219 },
};
const jitter = (base: number) => base + R(-0.025, 0.025);

type BizDef = {
  legalName: string;
  tradeName: string;
  muni: keyof typeof MUNI;
  tags: string[];
  category: string;
  desc: string;
  products: [string, number, number][]; // [nombre, precio, descuento%]
};

const BUSINESSES: BizDef[] = [
  {
    legalName: 'INVERSIONES SABOR ANDINO S.A.S.',
    tradeName: 'Sabor Andino',
    muni: 'Mocoa',
    tags: ['RES'],
    category: 'COMIDA',
    desc: 'Comida típica y del día, a la leña.',
    products: [
      ['Bandeja paisa', 22000, 0],
      ['Sancocho de gallina', 18000, 10],
      ['Churrasco con papa', 26000, 0],
      ['Arepa rellena', 9000, 0],
      ['Jugo natural de mora', 5000, 0],
      ['Gaseosa personal', 3500, 0],
      ['Empanadas x3', 6000, 15],
    ],
  },
  {
    legalName: 'PIZZAS Y PASTAS NAPOLI LTDA',
    tradeName: 'Pizzería Napoli',
    muni: 'Villagarzon',
    tags: ['RES'],
    category: 'COMIDA',
    desc: 'Pizzas artesanales y pastas al horno.',
    products: [
      ['Pizza mediana pepperoni', 32000, 0],
      ['Pizza grande hawaiana', 45000, 10],
      ['Pizza personal margarita', 16000, 0],
      ['Lasaña de carne', 24000, 0],
      ['Pan de ajo', 8000, 0],
      ['Limonada de coco', 7000, 0],
    ],
  },
  {
    legalName: 'FERRETERIA EL TORNILLO S.A.S.',
    tradeName: 'Ferretería El Tornillo',
    muni: 'Mocoa',
    tags: ['FERRE'],
    category: 'FERR',
    desc: 'Todo para tu obra y hogar.',
    products: [
      ['Martillo de uña 16oz', 28000, 0],
      ['Caja de tornillos x100', 12000, 0],
      ['Pintura vinilo galón blanco', 65000, 5],
      ['Cinta métrica 5m', 15000, 0],
      ['Brocha 3 pulgadas', 9000, 0],
      ['Foco LED 9W', 8000, 0],
      ['Candado 40mm', 18000, 0],
    ],
  },
  {
    legalName: 'SUPERMERCADO LA ECONOMIA S.A.S.',
    tradeName: 'Supermercado La Economía',
    muni: 'Villagarzon',
    tags: ['SUPER', 'TIEN'],
    category: 'ASEO',
    desc: 'Mercado, aseo y víveres al mejor precio.',
    products: [
      ['Arroz 500g', 3200, 0],
      ['Aceite 1L', 12000, 5],
      ['Panela x1kg', 6500, 0],
      ['Jabón en polvo 1kg', 14000, 0],
      ['Papel higiénico x4', 8500, 0],
      ['Huevos AA x30', 18000, 0],
      ['Leche entera 1L', 4200, 0],
    ],
  },
  {
    legalName: 'DROGUERIA SALUD TOTAL S.A.S.',
    tradeName: 'Farmacia Salud Total',
    muni: 'Puerto Asis',
    tags: ['FARM'],
    category: 'MEDIC',
    desc: 'Medicamentos y cuidado personal.',
    products: [
      ['Acetaminofén x20', 6000, 0],
      ['Ibuprofeno 400mg x10', 8000, 0],
      ['Suero oral', 4500, 0],
      ['Alcohol antiséptico 350ml', 7000, 0],
      ['Curas x20', 5500, 0],
      ['Vitamina C x30', 22000, 10],
    ],
  },
  {
    legalName: 'LICORES LA ESTRELLA S.A.S.',
    tradeName: 'Licores La Estrella',
    muni: 'Mocoa',
    tags: ['TIEN'],
    category: 'LICORES',
    desc: 'Cervezas, licores y pasabocas.',
    products: [
      ['Cerveza six pack', 16000, 0],
      ['Aguardiente 750ml', 42000, 5],
      ['Ron media', 28000, 0],
      ['Vino tinto', 35000, 0],
      ['Papas fritas familiar', 9000, 0],
      ['Maní salado', 4000, 0],
    ],
  },
  {
    legalName: 'PANADERIA TRIGO DE ORO LTDA',
    tradeName: 'Panadería Trigo de Oro',
    muni: 'Sibundoy',
    tags: ['TIEN'],
    category: 'COMIDA',
    desc: 'Pan fresco, tortas y café.',
    products: [
      ['Pan campesino', 3500, 0],
      ['Torta de chocolate porción', 6000, 0],
      ['Croissant', 4000, 0],
      ['Café con leche', 4500, 0],
      ['Buñuelos x3', 5000, 0],
      ['Pan de bono x3', 5500, 0],
    ],
  },
  {
    legalName: 'COMIDAS RAPIDAS EL RINCON S.A.S.',
    tradeName: 'El Rincón Rápido',
    muni: 'Villagarzon',
    tags: ['RES'],
    category: 'COMIDA',
    desc: 'Hamburguesas, perros y salchipapas.',
    products: [
      ['Hamburguesa sencilla', 12000, 0],
      ['Hamburguesa doble', 18000, 10],
      ['Perro caliente', 9000, 0],
      ['Salchipapa personal', 11000, 0],
      ['Salchipapa familiar', 22000, 15],
      ['Gaseosa 1.5L', 6000, 0],
    ],
  },
];

const FIRST = ['Juan', 'María', 'Carlos', 'Laura', 'Andrés', 'Diana', 'Jorge', 'Camila', 'Luis', 'Paola', 'Santiago', 'Valentina', 'Fernando', 'Daniela', 'Ricardo', 'Natalia'];
const LAST = ['Pérez', 'Gómez', 'Rodríguez', 'Martínez', 'López', 'Chindoy', 'Jacanamejoy', 'Muñoz', 'Ramírez', 'Torres', 'Vargas', 'Ortiz'];
const fullName = (i: number) => `${FIRST[i % FIRST.length]} ${pick(LAST)}`;

async function main() {
  await AppDataSource.initialize();
  const ds = AppDataSource;
  const password = await bcrypt.hash(PASSWORD, 12);

  // ---- catálogos (por code, no por id fijo) ----
  const byCode = async (table: string) =>
    Object.fromEntries(
      (await ds.query(`SELECT id, code FROM "${table}"`)).map((r: any) => [
        r.code,
        r.id,
      ]),
    ) as Record<string, string | number>;

  const roles = await byCode('roleType');
  const states = await byCode('stateType');
  const paids = await byCode('paidType');
  const cats = await byCode('categoryType');
  const idTypes = await byCode('identificationType');

  const dept = (await ds.query(`SELECT id FROM department WHERE code = '86'`))[0]
    .id as number;
  const muniRows: any[] = await ds.query(
    `SELECT id, name FROM municipality WHERE "departmentId" = $1`,
    [dept],
  );
  const muniId = (name: string) => {
    const found = muniRows.find(
      (m) => m.name.toLowerCase() === name.toLowerCase(),
    );
    if (!found) throw new Error(`Municipio no encontrado: ${name}`);
    return found.id as number;
  };

  const tagRepo = ds.getRepository(Tag);
  const allTags = await tagRepo.find();
  const tagByCode: Record<string, Tag> = Object.fromEntries(
    allTags.map((t) => [t.code, t] as [string, Tag]),
  );

  const userRepo = ds.getRepository(User);
  const orgRepo = ds.getRepository(Organizational);
  const productRepo = ds.getRepository(Product);
  const addrRepo = ds.getRepository(UserAddress);
  const invoiceRepo = ds.getRepository(Invoice);
  const detailRepo = ds.getRepository(InvoiceDetail);

  async function ensureUser(data: Partial<User>): Promise<User> {
    const existing = await userRepo.findOne({ where: { email: data.email } });
    if (existing) return existing;
    return userRepo.save(userRepo.create(data));
  }

  // ---- limpieza de pedidos seed anteriores (idempotencia) ----
  const oldInvoices: any[] = await ds.query(
    `SELECT id FROM invoice WHERE notes LIKE '%[seed]%'`,
  );
  if (oldInvoices.length) {
    const ids = oldInvoices.map((r) => r.id);
    await ds.query(`DELETE FROM "invoiceDetail" WHERE "invoiceId" = ANY($1)`, [ids]);
    await ds.query(`DELETE FROM invoice WHERE id = ANY($1)`, [ids]);
    console.log(`🧹 Borrados ${ids.length} pedidos seed anteriores.`);
  }

  // ---- negocios + dueños + productos ----
  const orgs: { org: Organizational; products: Product[]; coords: { lat: number; lng: number } }[] = [];

  for (let i = 0; i < BUSINESSES.length; i++) {
    const b = BUSINESSES[i];
    const base = MUNI[b.muni];
    const coords = { lat: jitter(base.lat), lng: jitter(base.lng) };
    const nit = `900500${String(i + 1).padStart(2, '0')}-${i + 1}`;

    const owner = await ensureUser({
      fullName: `Dueño ${b.tradeName}`,
      username: `demo_negocio${i + 1}`,
      email: `negocio${i + 1}@demo.mandalo.com`,
      password,
      roleTypeId: roles['NEGO'] as string,
      phone: `+57 320 55${String(i).padStart(2, '0')} 0000`,
      departmentId: dept,
      municipalityId: muniId(b.muni),
      isActive: true,
      isEmailVerified: true,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
    });

    let org = await orgRepo.findOne({ where: { identificationNumber: nit } });
    if (!org) {
      org = orgRepo.create({
        legalName: b.legalName,
        tradeName: b.tradeName,
        identificationNumber: nit,
        identificationTypeId: idTypes['NIT'] as number,
        description: b.desc,
        logoUrl: pic(`logo-${b.tradeName}`),
        phone: `+57 32${i}5 000 000${i}`,
        address: `Calle ${RI(1, 30)} # ${RI(1, 20)}-${RI(1, 90)}, ${b.muni}`,
        latitude: coords.lat,
        longitude: coords.lng,
        departmentId: dept,
        municipalityId: muniId(b.muni),
        legalPersonId: owner.id,
        isActive: true,
        commissionOrderRate: 5,
        openTime: '08:00',
        closeTime: '21:00',
        openDays: null,
        temporarilyClosed: false,
        paymentHolderName: `Dueño ${b.tradeName}`,
        nequiNumber: `30${RI(10, 99)}${RI(100000, 999999)}`,
        bancolombiaAccount: `${RI(100, 999)}-${RI(100000, 999999)}-01`,
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
        tags: b.tags.map((c) => tagByCode[c]).filter(Boolean),
      });
      org = await orgRepo.save(org);
    }

    // Productos frescos (borra los del org seed y recrea).
    await productRepo.delete({ organizationalId: org.id });
    const products: Product[] = [];
    for (const [name, price, disc] of b.products) {
      const p = await productRepo.save(
        productRepo.create({
          name,
          description: `${name} de ${b.tradeName}.`,
          priceSale: price,
          discount: disc,
          categoryTypeId: cats[b.category] as number,
          images: [pic(`prod-${b.tradeName}-${name}`)],
          isActive: true,
          organizationalId: org.id,
        }),
      );
      products.push(p);
    }

    orgs.push({ org, products, coords });
    console.log(`🏬 ${b.tradeName} (${products.length} productos)`);
  }

  // ---- repartidores (verificados/activos) ----
  const deliveries: User[] = [];
  for (let i = 0; i < 6; i++) {
    const d = await ensureUser({
      fullName: fullName(i + 3),
      username: `demo_repartidor${i + 1}`,
      email: `repartidor${i + 1}@demo.mandalo.com`,
      password,
      roleTypeId: roles['DELI'] as string,
      phone: `+57 311 22${String(i).padStart(2, '0')} 0000`,
      departmentId: dept,
      municipalityId: muniId(pick(['Mocoa', 'Villagarzon', 'Puerto Asis'])),
      address: `Barrio Centro, ${b_muni(i)}`,
      latitude: jitter(MUNI.Mocoa.lat),
      longitude: jitter(MUNI.Mocoa.lng),
      isActive: true,
      isEmailVerified: true,
      identificationNumber: `10${RI(10000000, 99999999)}`,
      identificationTypeId: idTypes['CC'] as number,
      vehiclePlate: `${pick(['ABC', 'XYZ', 'JKL', 'MNP'])}${RI(10, 99)}${pick(['D', 'E', 'F'])}`,
      avatarUrl: pic(`deli-${i}`),
      identificationFrontUrl: pic(`idf-${i}`),
      identificationBackUrl: pic(`idb-${i}`),
      licenseFrontUrl: pic(`licf-${i}`),
      licenseBackUrl: pic(`licb-${i}`),
      soatUrl: pic(`soat-${i}`),
      technicalInspectionUrl: pic(`tec-${i}`),
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
    });
    deliveries.push(d);
  }
  console.log(`🛵 ${deliveries.length} repartidores`);

  // ---- clientes + dirección principal ----
  const clients: { user: User; addr: UserAddress }[] = [];
  for (let i = 0; i < 12; i++) {
    const muniName = pick(Object.keys(MUNI)) as keyof typeof MUNI;
    const base = MUNI[muniName];
    const lat = jitter(base.lat);
    const lng = jitter(base.lng);
    const address = `Cra ${RI(1, 25)} # ${RI(1, 40)}-${RI(1, 90)}, ${muniName}`;

    const user = await ensureUser({
      fullName: fullName(i),
      username: `demo_cliente${i + 1}`,
      email: `cliente${i + 1}@demo.mandalo.com`,
      password,
      roleTypeId: roles['USER'] as string,
      phone: `+57 300 10${String(i).padStart(2, '0')} 0000`,
      departmentId: dept,
      municipalityId: muniId(muniName),
      address,
      latitude: lat,
      longitude: lng,
      isActive: true,
      isEmailVerified: true,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
    });

    let addr = await addrRepo.findOne({
      where: { userId: user.id, isDefault: true },
    });
    if (!addr) {
      addr = await addrRepo.save(
        addrRepo.create({
          userId: user.id,
          label: 'Casa',
          address,
          details: `Casa ${RI(1, 3)}, ${pick(['portón café', 'reja negra', 'segundo piso'])}`,
          latitude: lat,
          longitude: lng,
          isDefault: true,
        }),
      );
    }
    clients.push({ user, addr });
  }
  console.log(`🙋 ${clients.length} clientes`);

  // ---- pedidos en todos los estados ----
  const STATE_BAG: string[] = [
    ...Array(6).fill('PEND'),
    ...Array(4).fill('ACEP'),
    ...Array(4).fill('PREP'),
    ...Array(3).fill('RUTA'),
    ...Array(10).fill('ENTR'),
    ...Array(3).fill('CANC'),
  ];

  let created = 0;
  for (const stateCode of STATE_BAG) {
    const { user: client, addr } = pick(clients);
    const shop = pick(orgs);
    const chosen = [...shop.products]
      .sort(() => Math.random() - 0.5)
      .slice(0, RI(1, 3));

    let subtotal = 0;
    const details: InvoiceDetail[] = [];
    for (const p of chosen) {
      const qty = RI(1, 3);
      const finalUnit = round2(p.priceSale * (1 - (p.discount ?? 0) / 100));
      const lineTotal = round2(finalUnit * qty);
      subtotal = round2(subtotal + lineTotal);
      details.push(
        detailRepo.create({
          productId: p.id,
          productName: p.name,
          unitPrice: p.priceSale,
          discount: p.discount ?? 0,
          quantity: qty,
          lineTotal,
        }),
      );
    }

    const dist = haversineKm(
      shop.coords.lat,
      shop.coords.lng,
      addr.latitude ?? shop.coords.lat,
      addr.longitude ?? shop.coords.lng,
    );
    const deliveryFee = Math.min(Math.max(round2(2500 + 1200 * dist), 2500), 12000);
    const total = round2(subtotal + deliveryFee);

    const paidCode = pick(['EFEC', 'NEQUI', 'TRAN', 'EFEC']);
    const nonCash = paidCode !== 'EFEC';
    const reached = (s: string) =>
      ['ACEP', 'PREP', 'RUTA', 'ENTR'].indexOf(stateCode) >=
      ['ACEP', 'PREP', 'RUTA', 'ENTR'].indexOf(s);

    const withDelivery = ['RUTA', 'ENTR'].includes(stateCode);
    const deli = withDelivery ? pick(deliveries) : null;

    const createdAt = backDate(30);
    const t = (offsetMin: number) =>
      new Date(createdAt.getTime() + offsetMin * 60_000);

    const invoice = invoiceRepo.create({
      userId: client.id,
      organizationalId: shop.org.id,
      deliveryUserId: deli?.id ?? null,
      stateTypeId: states[stateCode] as number,
      paidTypeId: paids[paidCode] as number,
      deliveryAddress: addr.address,
      deliveryDetails: addr.details ?? undefined,
      deliveryLatitude: addr.latitude ?? undefined,
      deliveryLongitude: addr.longitude ?? undefined,
      subtotal,
      deliveryFee,
      total,
      notes: pick([
        'Sin cebolla por favor. [seed]',
        'Timbre dañado, llamar al llegar. [seed]',
        'Dejar en portería. [seed]',
        '[seed]',
      ]),
      cancellationReason:
        stateCode === 'CANC'
          ? pick(['Sin stock del producto.', 'El cliente no contestó.'])
          : undefined,
      paymentProofUrl:
        nonCash && reached('ACEP') && Math.random() > 0.3
          ? pic(`proof-${created}`)
          : null,
      pickupCode: code4(),
      deliveryCode: code4(),
      prepEstimatedMinutes: reached('ACEP') ? pick([15, 20, 25, 30]) : null,
      deliveryEstimatedMinutes: reached('RUTA')
        ? Math.min(Math.max(Math.round((dist * 1.3) / 25 * 60) + 5, 10), 90)
        : null,
      acceptedAt: reached('ACEP') ? t(RI(2, 10)) : null,
      preparingAt: reached('PREP') ? t(RI(11, 20)) : null,
      takenAt: reached('RUTA') ? t(RI(21, 30)) : null,
      onRouteAt: reached('RUTA') ? t(RI(31, 35)) : null,
      deliveredAt: stateCode === 'ENTR' ? t(RI(40, 70)) : null,
      cancelledAt: stateCode === 'CANC' ? t(RI(5, 30)) : null,
    });

    const saved = await invoiceRepo.save(invoice);
    for (const d of details) d.invoiceId = saved.id;
    await detailRepo.save(details);
    // Backdate del createdAt (CreateDateColumn lo pone en "now" al insertar).
    await ds.query(`UPDATE invoice SET "createdAt" = $1 WHERE id = $2`, [
      createdAt,
      saved.id,
    ]);
    created++;
  }
  console.log(`🧾 ${created} pedidos en varios estados`);

  const counts = (
    await ds.query(
      `SELECT
        (SELECT count(*) FROM "user") users,
        (SELECT count(*) FROM organizational) orgs,
        (SELECT count(*) FROM product) products,
        (SELECT count(*) FROM invoice) invoices`,
    )
  )[0];
  console.log('\n✅ Seed completo. Totales en la DB:', counts);
  console.log(`\n🔑 Acceso a todas las cuentas demo: contraseña "${PASSWORD}"`);
  console.log('   Negocios: negocio1..8@demo.mandalo.com');
  console.log('   Clientes: cliente1..12@demo.mandalo.com');
  console.log('   Repartidores: repartidor1..6@demo.mandalo.com');

  await ds.destroy();
}

/** Municipio de referencia para el texto de dirección del repartidor. */
function b_muni(i: number) {
  return ['Mocoa', 'Villagarzon', 'Puerto Asis'][i % 3];
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
