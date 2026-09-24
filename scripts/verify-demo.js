/**
 * Verifica, contra la API de PRODUCCIÓN y con la cuenta demo, exactamente lo
 * que va a ver el revisor de Apple: inicia sesión, pide el feed de negocios
 * desde la dirección guardada en Mocoa y comprueba que las fotos cargan.
 *
 *   node verify-demo.js
 */
const fs = require('fs');
const BACK = 'C:/Trabajo/mandalo/backend-mandalo';
const env = {};
for (const l of fs.readFileSync(`${BACK}/.env.production`, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const API = env.APP_BASE_URL;
const KEY = env.APP_CLIENT_API_KEY;

const ACCOUNTS = [
  ['cliente', 'demo.cliente@somosmandalo.com'],
  ['negocio', 'demo.negocio@somosmandalo.com'],
  ['domiciliario', 'demo.repartidor@somosmandalo.com'],
];
const PASS = 'MandaloDemo2026';
const HOME = { lat: 1.1489, lng: -76.6483 }; // dirección demo (Mocoa centro)

async function get(path, token) {
  const r = await fetch(`${API}${path}`, {
    headers: { 'X-Client-Key': KEY, Authorization: `Bearer ${token}` },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

(async () => {
  console.log(`API: ${API}\n`);

  let clientToken = null;
  for (const [label, email] of ACCOUNTS) {
    const r = await fetch(`${API}/auth/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASS }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.log(`✖ login ${label} (${email}) → ${r.status} ${JSON.stringify(body).slice(0, 160)}`);
      continue;
    }
    const u = body.data.user;
    console.log(`✓ login ${label.padEnd(12)} ${email}  rol=${u.roleType?.code ?? u.role?.code ?? '?'}`);
    if (label === 'cliente') clientToken = body.data.tokens.accessToken;
  }

  if (!clientToken) throw new Error('sin sesión de cliente, no puedo seguir');

  console.log(`\n--- Feed desde la dirección demo (${HOME.lat}, ${HOME.lng}) ---`);
  const feed = await get(
    `/explore/organizationals?lat=${HOME.lat}&lng=${HOME.lng}&page=1&perPage=50`,
    clientToken,
  );
  const rows = feed.data ?? feed.rows ?? feed.items ?? [];
  console.log(`Negocios visibles: ${Array.isArray(rows) ? rows.length : '?'}`);
  for (const o of rows) {
    console.log(`  · ${o.tradeName ?? o.legalName}  logo=${o.logoUrl ? 'sí' : 'NO'}`);
  }

  const prods = await get(
    `/explore/products?lat=${HOME.lat}&lng=${HOME.lng}&page=1&perPage=100`,
    clientToken,
  );
  const prows = prods.data ?? prods.rows ?? [];
  console.log(`\nProductos visibles: ${Array.isArray(prows) ? prows.length : '?'}`);

  const withImg = prows.filter((p) => p.images?.length);
  console.log(`Con foto: ${withImg.length} / ${prows.length}`);

  // ¿Las fotos subidas se sirven de verdad?
  const sample = withImg.slice(0, 3);
  for (const p of sample) {
    const url = p.images[0];
    const r = await fetch(url, { method: 'GET' });
    console.log(`  ${r.ok ? '✓' : '✖'} ${r.status} ${p.name} → ${url}`);
  }
})().catch((e) => {
  console.error('✖ FALLÓ:', e.message);
  process.exit(1);
});
