const $ = (id) => document.getElementById(id);
const cop = (n) => '$' + Number(n || 0).toLocaleString('es-CO');
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-CO') : '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// --- Unary -----------------------------------------------------------------
$('f-unary').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const id = $('pedido').value;
  $('resumen').textContent = 'consultando…';
  const r = await fetch(`/sd/api/pedidos/${id}`).then((x) => x.json());
  if (!r.ok) {
    $('resumen').innerHTML = `<span class="err">${esc(r.error)}</span> <span class="mut">(${r.ms} ms)</span>`;
    return;
  }
  const p = r.pedido;
  $('resumen').innerHTML = `<dl>
    <dt>Pedido</dt><dd>#${p.id}</dd>
    <dt>Estado</dt><dd><span class="st ${esc(p.estadoCodigo)}">${esc(p.estadoCodigo)}</span> ${esc(p.estadoNombre)}</dd>
    <dt>Negocio</dt><dd>${esc(p.negocio)}</dd>
    <dt>Municipio</dt><dd>${esc(p.municipio)}</dd>
    <dt>Subtotal</dt><dd>${cop(p.subtotal)}</dd>
    <dt>Domicilio</dt><dd>${cop(p.domicilio)}</dd>
    <dt>Total</dt><dd><b>${cop(p.total)}</b></dd>
    <dt>Pago</dt><dd>${esc(p.metodoPago)}</dd>
    <dt>Repartidor</dt><dd>${p.tieneRepartidor ? 'asignado' : 'sin asignar'}</dd>
    <dt>Creado</dt><dd>${hora(p.creadoEn)}</dd>
  </dl><p class="mut">Respuesta gRPC en ${r.ms} ms</p>`;
});

// --- Server-streaming --------------------------------------------------------
let es = null;
function seguir(id) {
  es?.close();
  $('estado').textContent = `conectando a SeguirPedido(${id || 'todos'})…`;
  es = new EventSource(`/sd/api/seguir/${id}`);
  es.onopen = () => ($('estado').textContent = `🟢 stream abierto: SeguirPedido(${id || 'todos'})`);
  es.onerror = () => ($('estado').textContent = '🔴 stream cortado, reintentando…');
  es.addEventListener('error-grpc', (m) => ($('estado').innerHTML = `<span class="err">gRPC: ${esc(JSON.parse(m.data).error)}</span>`));
  es.onmessage = (m) => {
    const e = JSON.parse(m.data);
    const li = document.createElement('li');
    const origen = e.particion >= 0
      ? `<span class="p${e.particion}">partición ${e.particion}</span> · offset ${esc(e.offset)}`
      : 'snapshot (DB)';
    li.innerHTML = `<span class="st ${esc(e.estadoCodigo)}">${esc(e.estadoCodigo)}</span>
      <span><b>#${e.pedidoId}</b> ${esc(e.tipo)}<br><span class="mut">${esc(e.negocio)} · ${cop(e.total)}</span></span>
      <span class="meta">${hora(e.ocurridoEn)}<br>${origen}</span>`;
    $('eventos').prepend(li);
  };
}
$('f-stream').addEventListener('submit', (ev) => { ev.preventDefault(); seguir(parseInt($('seguir').value || '0', 10)); });
$('limpiar').addEventListener('click', () => ($('eventos').innerHTML = ''));
seguir(0);
