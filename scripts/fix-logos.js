/**
 * Los negocios demo se crearon por SQL con el logo apuntando a loremflickr
 * (host externo). Esto los vuelve a subir por `POST /organizational/mine/logo`
 * para que queden alojados en apiprod.somosmandalo.com, igual que las fotos
 * de los productos.
 *
 *   node fix-logos.js
 */
const fs = require('fs');
const BACK = 'C:/Trabajo/mandalo/backend-mandalo';
const { Client } = require(`${BACK}/node_modules/pg`);

const env = {};
for (const l of fs.readFileSync(`${BACK}/.env.production`, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const API = env.APP_BASE_URL;
const KEY = env.APP_CLIENT_API_KEY;
const PASS = 'MandaloDemo2026';

(async () => {
  const c = new Client({
    host: env.DB_HOST,
    port: +env.DB_PORT,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    ssl: false,
  });
  await c.connect();

  const rows = (
    await c.query(
      `SELECT o.id, o."tradeName", o."logoUrl", u.email
         FROM organizational o JOIN "user" u ON u.id = o."legalPersonId"
        WHERE o."identificationNumber" LIKE '900900%'
        ORDER BY o.id`,
    )
  ).rows;

  for (const r of rows) {
    if (!r.logoUrl || r.logoUrl.startsWith(API)) {
      console.log(`· ${r.tradeName}: ya está en el servidor propio`);
      continue;
    }
    const login = await fetch(`${API}/auth/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: r.email, password: PASS }),
    });
    if (!login.ok) {
      console.log(`✖ ${r.tradeName}: no pude iniciar sesión (${login.status})`);
      continue;
    }
    const token = (await login.json()).data.tokens.accessToken;

    const img = await fetch(r.logoUrl, { redirect: 'follow' });
    if (!img.ok) {
      console.log(`✖ ${r.tradeName}: no bajó la imagen (${img.status})`);
      continue;
    }
    const buf = Buffer.from(await img.arrayBuffer());
    const form = new FormData();
    form.append('file', new Blob([buf], { type: 'image/jpeg' }), 'logo.jpg');

    const up = await fetch(`${API}/organizational/mine/logo`, {
      method: 'POST',
      headers: { 'X-Client-Key': KEY, Authorization: `Bearer ${token}` },
      body: form,
    });
    const txt = await up.text();
    if (!up.ok) {
      console.log(`✖ ${r.tradeName}: subida falló ${up.status} ${txt.slice(0, 160)}`);
      continue;
    }
    const nuevo = (
      await c.query(`SELECT "logoUrl" FROM organizational WHERE id = $1`, [r.id])
    ).rows[0].logoUrl;
    console.log(`✓ ${r.tradeName} → ${nuevo}`);
  }

  await c.end();
})().catch((e) => {
  console.error('✖ FALLÓ:', e.message);
  process.exit(1);
});
