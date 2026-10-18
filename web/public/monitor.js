// Panel /monitor.html: pregunta a /api/monitor cada 15 segundos (solo con la pestaña visible) y muestra el
// estado de cada servicio, su historial de esta sesión, las visitas de Web Analytics y los cambios de estado.

const INTERVALO_MS = 15000;
const HISTORIAL = 40;
const ETIQUETA = { ok: 'En línea', lento: 'Lento', caido: 'Caído', config: 'Sin configurar' };
const CLAVE_KEY = 'mn-monitor-clave';

const $ = (id) => document.getElementById(id);
const historial = new Map();
const ultimoEstado = new Map();
const eventos = [];
let timer = null;
let pausado = false;
let primera = true;

const guardar = (v) => { try { v ? localStorage.setItem(CLAVE_KEY, v) : localStorage.removeItem(CLAVE_KEY); } catch {} };
const leerClave = () => { try { return localStorage.getItem(CLAVE_KEY) || ''; } catch { return ''; } };
let clave = leerClave();

const horaCorta = (d) => new Date(d).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const num = (n) => Number(n || 0).toLocaleString('es-VE');

function el(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    // Variables CSS por CSSOM: la política de seguridad no deja usar el atributo style.
    else if (k.startsWith('--')) e.style.setProperty(k, v);
    else e.setAttribute(k, v);
  }
  for (const h of hijos) if (h != null) e.append(h);
  return e;
}

function mostrarLogin(error = '') {
  $('panel').hidden = true;
  $('login').hidden = false;
  $('login-error').textContent = error;
  $('resumen').textContent = 'Escribe la clave para ver el estado.';
  $('clave').focus();
}

function pintarServicios(revisiones) {
  const grid = $('servicios');
  grid.replaceChildren();
  for (const r of revisiones) {
    const h = historial.get(r.id) || [];
    h.push(r.estado);
    if (h.length > HISTORIAL) h.shift();
    historial.set(r.id, h);
    const enLinea = h.filter((e) => e === 'ok' || e === 'lento').length;
    const barras = el('div', { class: 'm-barras', 'aria-label': `Historial: ${enLinea} de ${h.length} revisiones en línea` },
      ...h.map((e) => el('span', { class: `b-${e}` })));
    grid.append(el('article', { class: `m-card s-${r.estado}` },
      el('div', { class: 'm-card-top' },
        el('h3', {}, r.nombre),
        el('span', { class: 'm-chip' }, ETIQUETA[r.estado] || r.estado)),
      el('p', { class: 'm-detalle' }, r.detalle || ''),
      el('p', { class: 'm-ms' }, r.ms ? `${num(r.ms)} ms` : ' '),
      barras));
  }
}

function registrarCambios(revisiones, hora) {
  for (const r of revisiones) {
    const antes = ultimoEstado.get(r.id);
    ultimoEstado.set(r.id, r.estado);
    if (antes && antes !== r.estado) eventos.unshift({ hora, nombre: r.nombre, antes, ahora: r.estado, detalle: r.detalle });
  }
  if (eventos.length > 50) eventos.length = 50;
  if (!eventos.length) return;
  $('eventos').replaceChildren(...eventos.map((ev) =>
    el('li', { class: `s-${ev.ahora}` },
      el('time', {}, horaCorta(ev.hora)), ' ',
      el('strong', {}, ev.nombre), `: ${ETIQUETA[ev.antes]} → ${ETIQUETA[ev.ahora]}`,
      ev.detalle ? el('span', { class: 'm-detalle' }, ` · ${ev.detalle}`) : null)));
}

function lista(titulo, items) {
  const max = Math.max(1, ...items.map((i) => i.paginas));
  return el('div', { class: 'm-card m-lista' },
    el('h3', {}, titulo),
    items.length
      ? el('ul', {}, ...items.map((i) => el('li', {},
          el('span', {}, i.nombre),
          el('span', { class: 'm-num' }, num(i.paginas)),
          el('i', { '--p': `${Math.round((i.paginas / max) * 100)}%` }))))
      : el('p', { class: 'm-vacio' }, 'Sin datos todavía'));
}

function grafico(porMinuto) {
  // Una barra por minuto de la última hora, con ceros donde no hubo visitas.
  const ahora = Date.now();
  const cuenta = new Map(porMinuto.map((m) => [new Date(m.minuto).getTime(), m.paginas]));
  const base = Math.floor(ahora / 60000) * 60000;
  const valores = Array.from({ length: 60 }, (_, i) => cuenta.get(base - (59 - i) * 60000) || 0);
  const max = Math.max(1, ...valores);
  const w = 600, h = 120, bw = w / 60;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('class', 'm-grafico');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Páginas vistas por minuto en la última hora, máximo ${max}`);
  valores.forEach((v, i) => {
    const alto = v ? Math.max(3, (v / max) * (h - 16)) : 1;
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', (i * bw + 1).toFixed(1));
    r.setAttribute('y', (h - alto).toFixed(1));
    r.setAttribute('width', (bw - 2).toFixed(1));
    r.setAttribute('height', alto.toFixed(1));
    r.setAttribute('rx', '1.5');
    const t = document.createElementNS(ns, 'title');
    t.textContent = `${horaCorta(base - (59 - i) * 60000).slice(0, 5)}: ${v} páginas`;
    r.append(t);
    svg.append(r);
  });
  return el('div', { class: 'm-card m-ancho' },
    el('h3', {}, 'Páginas vistas por minuto (última hora)'),
    svg,
    el('div', { class: 'm-eje' }, el('span', {}, 'hace 60 min'), el('span', {}, 'ahora')));
}

function pintarVisitas(v) {
  const caja = $('visitas');
  if (!v?.configurado) {
    caja.replaceChildren(el('div', { class: 'm-card m-aviso' },
      el('h3', {}, 'Visitas sin conectar'),
      el('p', {}, 'Faltan las variables CF_API_TOKEN y CF_ACCOUNT_ID en Cloudflare Pages para leer Web Analytics.')));
    return;
  }
  if (v.error) {
    caja.replaceChildren(el('div', { class: 'm-card m-aviso' }, el('h3', {}, 'No se pudieron leer las visitas'), el('p', {}, v.error)));
    return;
  }
  const kpi = (titulo, valor, nota) => el('div', { class: 'm-card m-kpi' }, el('h3', {}, titulo), el('p', { class: 'm-grande' }, num(valor)), el('p', { class: 'm-detalle' }, nota));
  caja.replaceChildren(
    el('div', { class: 'm-grid' },
      kpi('Últimos 5 minutos', v.ultimos5min.visitas, `${num(v.ultimos5min.paginas)} páginas vistas`),
      kpi('Visitas hoy', v.hoy.visitas, `${num(v.hoy.paginas)} páginas vistas`)),
    grafico(v.porMinuto || []),
    el('div', { class: 'm-grid' },
      lista('Países (hoy)', v.paises || []),
      lista('Equipos (hoy)', v.equipos || []),
      lista('De dónde llegan (hoy)', v.origen || [])));
}

function pintarResumen(revisiones) {
  const caidos = revisiones.filter((r) => r.estado === 'caido');
  const lentos = revisiones.filter((r) => r.estado === 'lento');
  const texto = caidos.length
    ? `Con problemas: ${caidos.map((r) => r.nombre).join(', ')}`
    : lentos.length ? `Todo en línea, lento: ${lentos.map((r) => r.nombre).join(', ')}` : 'Todo en línea';
  $('resumen').textContent = texto;
  document.body.dataset.estado = caidos.length ? 'caido' : lentos.length ? 'lento' : 'ok';
  document.title = `${caidos.length ? '⚠ ' : ''}Monitor · MN Technology`;
}

async function revisar() {
  if (!clave) return mostrarLogin();
  $('pulso').classList.add('activo');
  let res, data;
  try {
    res = await fetch('/api/monitor', { headers: { 'X-Monitor-Clave': clave }, cache: 'no-store' });
    data = await res.json().catch(() => null);
  } catch {
    res = null;
  }
  $('pulso').classList.remove('activo');
  if (res?.status === 401) {
    clave = '';
    guardar('');
    return mostrarLogin('Clave incorrecta');
  }
  if (!res || !res.ok || !data?.revisiones) {
    const msg = data?.error || 'No se pudo contactar la web (¿sin internet?)';
    $('resumen').textContent = msg;
    document.body.dataset.estado = 'caido';
    registrarCambios([{ id: 'web', nombre: 'Página web', estado: 'caido', detalle: msg }], new Date());
  } else {
    $('login').hidden = true;
    $('panel').hidden = false;
    pintarServicios(data.revisiones);
    if (!primera) registrarCambios(data.revisiones, data.hora);
    else data.revisiones.forEach((r) => ultimoEstado.set(r.id, r.estado));
    primera = false;
    pintarVisitas(data.visitas);
    pintarResumen(data.revisiones);
    $('hora').textContent = `Actualizado ${horaCorta(data.hora)}`;
  }
  programar();
}

function programar() {
  clearTimeout(timer);
  if (!pausado && !document.hidden && clave) timer = setTimeout(revisar, INTERVALO_MS);
}

$('login').addEventListener('submit', (e) => {
  e.preventDefault();
  clave = $('clave').value.trim();
  guardar(clave);
  $('clave').value = '';
  revisar();
});
$('pausa').addEventListener('click', () => {
  pausado = !pausado;
  $('pausa').textContent = pausado ? 'Reanudar' : 'Pausar';
  pausado ? clearTimeout(timer) : revisar();
});
$('salir').addEventListener('click', () => {
  clave = '';
  guardar('');
  clearTimeout(timer);
  mostrarLogin();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(timer);
  else if (!pausado && clave) revisar();
});

revisar();
