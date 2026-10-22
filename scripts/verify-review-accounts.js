/**
 * Verifica contra la API de PRODUCCIÓN las cuentas que usan los revisores de
 * las tiendas (Apple y Huawei). Correrlo antes de enviar CUALQUIER versión.
 *
 * Comprueba: login de cada cuenta, que el feed desde la dirección guardada
 * (Villagarzón) tenga negocios y que "Comidas Rapidas 24 H" (#34, donde se le
 * pide al revisor que haga los pedidos) aparezca ABIERTO.
 *
 * Si una cuenta da 401 es que ya no existe (el revisor pudo usar "Eliminar mi
 * cuenta"): recrearla con dirección por defecto en Villagarzón (ver §106).
 * Hace 5 logins: si sale 429, esperar unos minutos y repetir.
 *
 *   node verify-review-accounts.js
 */
const fs = require('fs');
const BACK = 'C:/Trabajo/mandalo/backend-mandalo';
const env = {};
for (const l of fs.readFileSync(`${BACK}/.env.production`, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const API = env.APP_BASE_URL;

const APPLE = 'MandaloDemo2026';
const HUAWEI = 'MandaloHuawei2026';
const ACCOUNTS = [
  ['Apple  principal', 'demo.cliente@somosmandalo.com', APPLE, true],
  ['Apple  eliminar ', 'demo.eliminar@somosmandalo.com', APPLE, false],
  ['Apple  repartid.', 'demo.repartidor@somosmandalo.com', APPLE, false],
  ['Huawei principal', 'revisor.huawei@somosmandalo.com', HUAWEI, true],
  ['Huawei eliminar ', 'revisor.huawei.eliminar@somosmandalo.com', HUAWEI, false],
];
// Dirección guardada de las cuentas cliente (junto a Comidas Rapidas 24 H).
const HOME = { lat: 1.0314752286378037, lng: -76.6190195175513 };
const TEST_STORE = 'Comidas Rapidas 24 H';

(async () => {
  console.log(`API: ${API}\n`);
  let ok = true;
  for (const [label, email, pass, checkFeed] of ACCOUNTS) {
    const r = await fetch(`${API}/auth/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      ok = false;
      console.log(`✖ ${label} ${email} → ${r.status} ${body.message ?? ''}`);
      continue;
    }
    const role = body.data.user.roleType?.code ?? body.data.user.role?.code ?? '';
    let extra = '';
    if (checkFeed) {
      const f = await fetch(
        `${API}/explore/organizationals?lat=${HOME.lat}&lng=${HOME.lng}&page=1&perPage=50`,
        {
          headers: {
            'X-Client-Key': env.APP_CLIENT_API_KEY,
            Authorization: `Bearer ${body.data.tokens.accessToken}`,
          },
        },
      );
      const items = (await f.json()).data ?? [];
      const store = items.find((o) => o.tradeName === TEST_STORE);
      if (!items.length || !store?.isOpen) ok = false;
      extra = `  feed=${items.length} negocios, "${TEST_STORE}" ${
        store ? (store.isOpen ? 'ABIERTO' : 'CERRADO ✖') : 'NO APARECE ✖'
      }`;
    }
    console.log(`✓ ${label} ${email} ${role}${extra}`);
  }
  console.log(ok ? '\nTodo OK.' : '\n✖ Hay problemas: revisar antes de enviar a revisión.');
  process.exit(ok ? 0 : 1);
})();
