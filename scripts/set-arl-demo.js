// Asigna ARL individual al repartidor demo y verifica.
// Se conecta con las mismas credenciales que .env.development
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// parsear .env.development (simple)
const envFile = path.join(__dirname, '..', '.env.development');
const env = {};
for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const client = new Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  await client.connect();

  // Ver estado actual del repartidor
  const before = await client.query(
    `SELECT email, "arlIndividualNumber", "isActive", "roleTypeId" FROM "user" WHERE email = 'repartidor1@demo.mandalo.com'`
  );
  console.log('ANTES:', JSON.stringify(before.rows[0] ?? null));

  // Asignar ARL individual (número ficticio demo)
  const upd = await client.query(
    `UPDATE "user" SET "arlIndividualNumber" = 'ARL-DEMO-2026-001' WHERE email = 'repartidor1@demo.mandalo.com' RETURNING email, "arlIndividualNumber"`
  );
  console.log('UPDATE:', JSON.stringify(upd.rows[0] ?? null));

  // Verificar
  const after = await client.query(
    `SELECT email, "arlIndividualNumber", "isActive" FROM "user" WHERE email = 'repartidor1@demo.mandalo.com'`
  );
  console.log('DESPUES:', JSON.stringify(after.rows[0] ?? null));

  await client.end();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
