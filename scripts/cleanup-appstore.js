/**
 * Borra TODO lo que sembró `seed-appstore.js` en la base de producción.
 * Correr cuando Apple ya haya aprobado la app y el catálogo demo sobre.
 *
 *   node cleanup-appstore.js --dry   (muestra qué borraría, no borra)
 *   node cleanup-appstore.js
 *
 * Se guía por las marcas de la siembra y NO toca nada más:
 *   - organizational."identificationNumber" LIKE '900900%'
 *   - "user".email LIKE '%@demo.mandalo.com' o 'demo.%@somosmandalo.com'
 *
 * Aborta si alguno de esos negocios tiene pedidos reales asociados (no debería
 * pasar, pero mejor parar que romper el histórico de facturación).
 * Deja "Test Villa" (#23) desactivado: reactivarlo es decisión del usuario.
 */
const fs = require('fs');
const BACK = 'C:/Trabajo/mandalo/backend-mandalo';
const { Client } = require(`${BACK}/node_modules/pg`);

const DRY = process.argv.includes('--dry');
const env = {};
for (const l of fs.readFileSync(`${BACK}/.env.production`, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const EMAILS = `("user".email LIKE '%@demo.mandalo.com'
   OR "user".email LIKE 'demo.%@somosmandalo.com')`;

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

  const orgs = await c.query(
    `SELECT id, "tradeName" FROM organizational WHERE "identificationNumber" LIKE '900900%' ORDER BY id`,
  );
  const users = await c.query(
    `SELECT id, email FROM "user" WHERE ${EMAILS} ORDER BY email`,
  );
  const orgIds = orgs.rows.map((r) => r.id);
  const userIds = users.rows.map((r) => r.id);

  console.log(`Negocios demo: ${orgs.rowCount}`);
  orgs.rows.forEach((r) => console.log(`  #${r.id} ${r.tradeName}`));
  console.log(`Usuarios demo: ${users.rowCount}`);
  users.rows.forEach((r) => console.log(`  ${r.email}`));

  if (!orgIds.length && !userIds.length) {
    console.log('\nNada que borrar.');
    await c.end();
    return;
  }

  const prods = await c.query(
    `SELECT count(*)::int n FROM product WHERE "organizationalId" = ANY($1)`,
    [orgIds.length ? orgIds : [0]],
  );
  const inv = await c.query(
    `SELECT count(*)::int n FROM invoice
      WHERE "organizationalId" = ANY($1) OR "userId" = ANY($2)`,
    [orgIds.length ? orgIds : [0], userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']],
  );
  console.log(`\nProductos a borrar: ${prods.rows[0].n}`);
  console.log(`Pedidos asociados:  ${inv.rows[0].n}`);

  if (DRY) {
    console.log('\n[DRY RUN] no se borró nada.');
    await c.end();
    return;
  }

  if (inv.rows[0].n > 0) {
    console.log(
      '\n⚠ Hay pedidos asociados a estos datos demo. Borrarlos rompería el histórico:\n' +
        '  revisa a mano antes de continuar. No se borró nada.',
    );
    await c.end();
    return;
  }

  await c.query(`DELETE FROM product WHERE "organizationalId" = ANY($1)`, [orgIds]);
  await c.query(`DELETE FROM "organizationalTag" WHERE "organizationalId" = ANY($1)`, [orgIds]);
  await c.query(`DELETE FROM organizational WHERE id = ANY($1)`, [orgIds]);
  await c.query(`DELETE FROM "userAddress" WHERE "userId" = ANY($1)`, [userIds]);
  await c.query(`DELETE FROM "userPushToken" WHERE "userId" = ANY($1)`, [userIds]);
  await c.query(`DELETE FROM "accessSessions" WHERE "userId" = ANY($1)`, [userIds]);
  await c.query(`DELETE FROM "user" WHERE id = ANY($1)`, [userIds]);

  console.log('\n✓ Datos demo eliminados.');
  await c.end();
})().catch((e) => {
  console.error('✖ FALLÓ:', e.message);
  process.exit(1);
});
