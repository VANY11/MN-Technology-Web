// Panel /monitor.html: pregunta a /api/monitor cada 15 segundos (solo con la pestaña visible) y arma el tablero:
// indicadores, tráfico (última hora, 24 horas, 7 días), servicios con su latencia, audiencia, inventario y cambios.

const INTERVALO_MS = 15000;
const HISTORIAL = 40;
const ETIQUETA = { ok: 'En línea', lento: 'Lento', caido: 'Caído', config: 'Sin configurar' };
const CLAVE_KEY = 'mn-monitor-clave';
const RANGO_KEY = 'mn-monitor-rango';
const SVG = 'http://www.w3.org/2000/svg';

const $ = (id) => document.getElementById(id);
const historial = new Map();
const ultimoEstado = new Map();
const eventos = [];
let timer = null;
let pausado = false;
let primera = true;
let inicioSesion = null;
let ultimo = null;
// Revisiones de esta sesión y cuántas tuvieron todos los servicios arriba (para la disponibilidad).
const sesion = { total: 0, sanas: 0 };

const leer = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const guardar = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };
let clave = leer(CLAVE_KEY);
let rango = leer(RANGO_KEY) || 'hora';

// ---------- formato ----------
const num = (n) => Number(n || 0).toLocaleString('es-VE');
const plural = (n, uno, varios) => `${num(n)} ${Number(n) === 1 ? uno : varios}`;
const horaCorta = (d) => new Date(d).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
const horaLarga = (d) => new Date(d).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const diaCorto = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric' });
const segundos = (ms) => `${(ms / 1000).toLocaleString('es-VE', { maximumFractionDigits: 1 })} s`;
const usd = (n) => `$${Number(n || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
const nombresPais = (() => { try { return new Intl.DisplayNames(['es'], { type: 'region' }); } catch { return null; } })();
const bandera = (cc) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌐');
const pais = (cc) => { try { return nombresPais?.of(cc) || cc; } catch { return cc; } };
const EQUIPOS = { mobile: 'Teléfono', desktop: 'Computadora', tablet: 'Tableta', otro: 'Otro' };

function el(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') e.className = v;
    // Variables CSS por CSSOM: la política de seguridad no deja usar el atributo style.
    else if (k.startsWith('--')) e.style.setProperty(k, v);
    else e.setAttribute(k, v);
  }
  for (const h of hijos) if (h != null && h !== false) e.append(h);
  return e;
}
function svg(tag, attrs = {}) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// Curva suave que no se pasa de los valores (monótona), para que un pico no invente valles negativos.
function curva(pts, piso = Infinity) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  const n = pts.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  let p = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = (x1 - x0) / 3;
    // Los puntos de control no bajan del cero del eje: la curva nunca dibuja valores negativos.
    const c1 = Math.min(piso, y0 + m[i] * h), c2 = Math.min(piso, y1 - m[i + 1] * h);
    p += ` C${(x0 + h).toFixed(1)},${c1.toFixed(1)} ${(x1 - h).toFixed(1)},${c2.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return p;
}
// Paso «redondo» (1, 2, 5 × 10ⁿ) para que el eje tenga 4 líneas con números enteros.
const pasoEje = (max) => { const crudo = Math.max(1, max / 4), p = 10 ** Math.floor(Math.log10(crudo)); return [1, 2, 5, 10].map((m) => m * p).find((x) => x >= crudo); };

// ---------- tooltip ----------
const tip = $('tooltip');
function mostrarTip(x, y, ...contenido) {
  tip.replaceChildren(...contenido);
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2))}px`;
  tip.style.top = `${Math.max(8, y - h - 14)}px`;
}
const ocultarTip = () => { tip.hidden = true; };

// ---------- serie de tráfico según el rango ----------
function serieTrafico(v) {
  const ahora = Date.now();
  if (rango === 'semana') {
    if (!v.porDia) return null;
    // El último día es hoy y va por la mitad: se nombra «hoy» para que su caída no parezca una falla.
    return { puntos: v.porDia.map((d, i, a) => ({ etiqueta: i === a.length - 1 ? 'hoy (hasta ahora)' : diaCorto(d.t), paginas: d.paginas, visitas: d.visitas })), unidad: 'día' };
  }
  if (rango === 'dia') {
    if (!v.porHora) return null;
    const mapa = new Map(v.porHora.map((h) => [new Date(h.t).getTime(), h]));
    const base = Math.floor(ahora / 3600e3) * 3600e3;
    return {
      puntos: Array.from({ length: 24 }, (_, i) => {
        const t = base - (23 - i) * 3600e3, h = mapa.get(t);
        return { etiqueta: horaCorta(t), paginas: h?.paginas || 0, visitas: h?.visitas || 0 };
      }),
      unidad: 'hora',
    };
  }
  const mapa = new Map((v.porMinuto || []).map((m) => [new Date(m.t).getTime(), m]));
  const base = Math.floor(ahora / 60e3) * 60e3;
  return {
    puntos: Array.from({ length: 60 }, (_, i) => {
      const t = base - (59 - i) * 60e3, m = mapa.get(t);
      return { etiqueta: horaCorta(t), paginas: m?.paginas || 0, visitas: m?.visitas || 0 };
    }),
    unidad: 'minuto',
  };
}

// El dibujo usa el ancho real de la tarjeta, así en el teléfono los textos del eje no quedan diminutos.
function graficoArea(serie, ancho) {
  const W = Math.max(300, Math.round(ancho || 760)), H = W < 600 ? 220 : 300, L = 34, R = 8, T = 12, B = 26;
  const pts = serie.puntos;
  const max = pasoEje(Math.max(1, ...pts.map((p) => p.paginas), ...pts.map((p) => p.visitas))) * 4;
  const x = (i) => L + (pts.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (pts.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'm-area', role: 'img', 'aria-label': `Páginas vistas y visitas por ${serie.unidad}` });
  const defs = svg('defs');
  const grad = svg('linearGradient', { id: 'g-area', x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(svg('stop', { offset: '0%', class: 'g-ini' }), svg('stop', { offset: '100%', class: 'g-fin' }));
  defs.append(grad);
  s.append(defs);
  for (let k = 0; k <= 4; k++) {
    const v = (max * k) / 4, yy = y(v);
    s.append(svg('line', { x1: L, x2: W - R, y1: yy, y2: yy, class: k ? 'm-rejilla' : 'm-base' }));
    const t = svg('text', { x: L - 8, y: yy + 4, class: 'm-eje-y' });
    t.textContent = num(v);
    s.append(t);
  }
  const cuantas = W < 600 ? 3 : 5;
  const marcas = pts.length <= cuantas + 2 && W >= 600 ? pts.map((_, i) => i)
    : Array.from({ length: cuantas }, (_, k) => Math.round((k * (pts.length - 1)) / (cuantas - 1)));
  for (const i of marcas) {
    const t = svg('text', { x: x(i), y: H - 6, class: 'm-eje-x', 'text-anchor': i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle' });
    t.textContent = i === pts.length - 1 ? (serie.unidad === 'día' ? 'hoy' : 'ahora') : pts[i].etiqueta;
    s.append(t);
  }
  const pPag = pts.map((p, i) => [x(i), y(p.paginas)]);
  const pVis = pts.map((p, i) => [x(i), y(p.visitas)]);
  const lineaPag = curva(pPag, y(0));
  s.append(svg('path', { d: `${lineaPag} L${x(pts.length - 1)},${y(0)} L${x(0)},${y(0)} Z`, class: 'm-relleno' }));
  s.append(svg('path', { d: lineaPag, class: 'm-linea s1' }));
  s.append(svg('path', { d: curva(pVis, y(0)), class: 'm-linea s2' }));

  // Capa de lectura: línea vertical y puntos que siguen al mouse o al dedo.
  const guia = svg('line', { y1: T, y2: y(0), class: 'm-guia', visibility: 'hidden' });
  const d1 = svg('circle', { r: 4.5, class: 'm-punto s1', visibility: 'hidden' });
  const d2 = svg('circle', { r: 4.5, class: 'm-punto s2', visibility: 'hidden' });
  const zona = svg('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'm-zona' });
  s.append(guia, d1, d2, zona);
  const mover = (ev) => {
    const r = s.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((px - L) / (W - L - R)) * (pts.length - 1))));
    const p = pts[i];
    for (const [e, yy] of [[d1, y(p.paginas)], [d2, y(p.visitas)]]) { e.setAttribute('cx', x(i)); e.setAttribute('cy', yy); e.setAttribute('visibility', 'visible'); }
    guia.setAttribute('x1', x(i)); guia.setAttribute('x2', x(i)); guia.setAttribute('visibility', 'visible');
    mostrarTip(r.left + (x(i) / W) * r.width, r.top + (Math.min(y(p.paginas), y(p.visitas)) / H) * r.height,
      el('strong', {}, p.etiqueta),
      el('span', { class: 'm-tip-fila' }, el('i', { class: 'm-key s1' }), 'Páginas vistas', el('b', {}, num(p.paginas))),
      el('span', { class: 'm-tip-fila' }, el('i', { class: 'm-key s2' }), 'Visitas', el('b', {}, num(p.visitas))));
  };
  const salir = () => { [guia, d1, d2].forEach((e) => e.setAttribute('visibility', 'hidden')); ocultarTip(); };
  zona.addEventListener('pointermove', mover);
  zona.addEventListener('pointerdown', mover);
  zona.addEventListener('pointerleave', salir);
  return s;
}

function pintarTrafico(v) {
  const caja = $('trafico');
  if (!v?.configurado || v.error) {
    caja.replaceChildren(el('div', { class: 'm-aviso' },
      el('strong', {}, v?.error ? 'No se pudieron leer las visitas' : 'Visitas sin conectar'),
      el('p', {}, v?.error || 'Faltan CF_API_TOKEN y CF_ACCOUNT_ID en Cloudflare Pages.')));
    return;
  }
  const serie = serieTrafico(v);
  if (!serie) {
    caja.replaceChildren(el('div', { class: 'm-aviso' }, el('strong', {}, 'Este periodo no está disponible'), el('p', {}, v.avisos?.[0] || 'Cloudflare no devolvió datos por hora.')));
    return;
  }
  const totPag = serie.puntos.reduce((s, p) => s + p.paginas, 0);
  const totVis = serie.puntos.reduce((s, p) => s + p.visitas, 0);
  caja.replaceChildren(
    el('div', { class: 'm-leyenda' },
      el('span', {}, el('i', { class: 'm-key s1' }), 'Páginas vistas ', el('b', {}, num(totPag))),
      el('span', {}, el('i', { class: 'm-key s2' }), 'Visitas ', el('b', {}, num(totVis)))),
    graficoArea(serie, caja.clientWidth));
}

// ---------- indicadores ----------
function kpi({ titulo, valor, nota, cambio, vivo, estado }) {
  return el('article', { class: `m-kpi${estado ? ` k-${estado}` : ''}` },
    el('h3', {}, vivo ? el('span', { class: 'm-vivo', 'aria-hidden': 'true' }) : null, titulo),
    el('p', { class: 'm-kpi-valor' }, valor),
    el('p', { class: 'm-kpi-nota' },
      cambio ? el('span', { class: `m-cambio ${cambio.dir}` }, cambio.texto) : null,
      cambio ? ' ' : null, nota || ''));
}

function comparar(hoy, ayer) {
  if (ayer == null) return null;
  if (!ayer) return hoy ? { dir: 'sube', texto: 'nuevo' } : null;
  const pct = Math.round(((hoy - ayer) / ayer) * 100);
  return { dir: pct > 0 ? 'sube' : pct < 0 ? 'baja' : 'igual', texto: `${pct > 0 ? '▲' : pct < 0 ? '▼' : '='} ${Math.abs(pct)}%` };
}

function pintarKpis(data) {
  const v = data.visitas?.configurado && !data.visitas.error ? data.visitas : null;
  const svc = historial.get('servidor') || [];
  const conMs = svc.filter((h) => h.ms);
  const promedio = conMs.length ? Math.round(conMs.reduce((s, h) => s + h.ms, 0) / conMs.length) : null;
  const revisiones = sesion.total;
  const disp = revisiones ? Math.round((sesion.sanas / revisiones) * 1000) / 10 : null;
  const sin = '—';
  $('kpis').replaceChildren(
    kpi({ titulo: 'En línea ahora', vivo: true, valor: v ? num(v.ultimos5min.visitas) : sin,
      nota: v ? `${plural(v.ultimos5min.paginas, 'página vista', 'páginas vistas')} en 5 min` : 'Visitas sin conectar' }),
    kpi({ titulo: 'Visitas hoy', valor: v ? num(v.hoy.visitas) : sin,
      cambio: v ? comparar(v.hoy.visitas, v.ayerALaHora?.visitas) : null,
      nota: v?.ayerALaHora ? `vs. ayer a esta hora (${num(v.ayerALaHora.visitas)})` : 'Desde las 12:00 a. m.' }),
    kpi({ titulo: 'Páginas vistas hoy', valor: v ? num(v.hoy.paginas) : sin,
      nota: v && v.hoy.visitas ? `${(v.hoy.paginas / v.hoy.visitas).toLocaleString('es-VE', { maximumFractionDigits: 1 })} por visita` : '' }),
    kpi({ titulo: 'Carga de la página', valor: v?.carga?.p50 ? segundos(v.carga.p50) : sin,
      nota: v?.carga?.p90 ? `9 de cada 10 en menos de ${segundos(v.carga.p90)}` : 'Mediana de hoy, aún sin datos',
      estado: v?.carga?.p50 ? (v.carga.p50 > 4000 ? 'mal' : v.carga.p50 > 2500 ? 'medio' : 'bien') : null }),
    kpi({ titulo: 'Disponibilidad', valor: disp == null ? sin : `${disp.toLocaleString('es-VE')}%`,
      nota: revisiones ? `${plural(revisiones, 'revisión', 'revisiones')} desde las ${horaCorta(inicioSesion)}` : '',
      estado: disp == null ? null : disp >= 99 ? 'bien' : disp >= 90 ? 'medio' : 'mal' }),
    kpi({ titulo: 'Respuesta del servidor', valor: promedio == null ? sin : `${num(promedio)} ms`,
      nota: conMs.length ? `promedio · última ${num(conMs[conMs.length - 1].ms)} ms` : '',
      estado: promedio == null ? null : promedio < 500 ? 'bien' : promedio < 1500 ? 'medio' : 'mal' }),
  );
}

// ---------- servicios ----------
function sparkline(h) {
  const W = 96, H = 28;
  const vals = h.map((x) => x.ms || 0);
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'm-spark', 'aria-hidden': 'true' });
  if (vals.filter(Boolean).length < 2) return s;
  // Escala entre el mínimo y el máximo de la sesión: una línea plena de respuestas parejas queda al medio.
  const max = Math.max(...vals) * 1.15, min = Math.min(...vals) * 0.85, alto = Math.max(1, max - min);
  // Pegada a la derecha: lo más nuevo siempre al final; con pocas revisiones los puntos se separan más.
  const paso = W / Math.max(10, vals.length - 1);
  const pts = vals.map((v, i) => [W - (vals.length - 1 - i) * paso, H - 3 - ((v - min) / alto) * (H - 6)]);
  s.append(svg('path', { d: curva(pts), class: 'm-spark-linea' }));
  const [lx, ly] = pts[pts.length - 1];
  s.append(svg('circle', { cx: lx, cy: ly, r: 2.5, class: 'm-spark-fin' }));
  return s;
}

function pintarServicios(revisiones, hora) {
  const lista = $('servicios');
  lista.replaceChildren();
  let total = 0, buenas = 0;
  for (const r of revisiones) {
    const h = historial.get(r.id) || [];
    h.push({ estado: r.estado, ms: r.ms, t: hora });
    if (h.length > HISTORIAL) h.shift();
    historial.set(r.id, h);
    total += h.length;
    buenas += h.filter((x) => x.estado === 'ok' || x.estado === 'lento').length;
    lista.append(el('li', { class: `s-${r.estado}` },
      el('span', { class: 'm-dot', 'aria-hidden': 'true' }),
      el('div', { class: 'm-svc-txt' },
        el('strong', {}, r.nombre),
        el('span', {}, r.detalle || '')),
      el('div', { class: 'm-svc-der' },
        r.id === 'web' ? el('span', { class: 'm-chip' }, ETIQUETA[r.estado]) : sparkline(h),
        r.id === 'web' ? null : el('span', { class: 'm-svc-ms' }, r.estado === 'caido' ? ETIQUETA.caido : r.ms ? `${num(r.ms)} ms` : ETIQUETA[r.estado]))));
  }
  $('uptime').textContent = total ? `${Math.round((buenas / total) * 100)}% en línea en esta sesión` : '';
}

// ---------- audiencia ----------
function listaBarras(titulo, items, { etiqueta = (i) => i.nombre, valor = (i) => i.paginas, vacio = 'Sin datos todavía' } = {}) {
  const total = items.reduce((s, i) => s + valor(i), 0);
  const max = Math.max(1, ...items.map(valor));
  return el('section', { class: 'm-card m-lista' },
    el('div', { class: 'm-card-head' }, el('h2', {}, titulo)),
    items.length
      ? el('ul', {}, ...items.map((i) => el('li', {},
          el('span', { class: 'm-lista-nombre' }, etiqueta(i)),
          el('span', { class: 'm-lista-num' }, num(valor(i)), el('small', {}, ` ${Math.round((valor(i) / Math.max(1, total)) * 100)}%`)),
          el('span', { class: 'm-lista-barra', '--p': `${Math.max(2, Math.round((valor(i) / max) * 100))}%` }))))
      : el('p', { class: 'm-vacio' }, vacio));
}

function tarjetaEquipos(items) {
  const total = items.reduce((s, i) => s + i.paginas, 0);
  const card = el('section', { class: 'm-card m-equipos' }, el('div', { class: 'm-card-head' }, el('h2', {}, 'Equipos')));
  if (!total) return card.append(el('p', { class: 'm-vacio' }, 'Sin datos todavía')), card;
  const barra = el('div', { class: 'm-segmentos', role: 'img', 'aria-label': items.map((i) => `${EQUIPOS[i.nombre] || i.nombre} ${Math.round((i.paginas / total) * 100)}%`).join(', ') });
  items.forEach((i, k) => barra.append(el('span', { class: `c${k + 1}`, '--p': `${(i.paginas / total) * 100}%` })));
  const principal = items[0];
  card.append(
    el('p', { class: 'm-equipos-top' }, el('b', {}, `${Math.round((principal.paginas / total) * 100)}%`), ` desde ${(EQUIPOS[principal.nombre] || principal.nombre).toLowerCase()}`),
    barra,
    el('ul', { class: 'm-equipos-ley' }, ...items.map((i, k) => el('li', {},
      el('i', { class: `m-key c${k + 1}` }), EQUIPOS[i.nombre] || i.nombre,
      el('b', {}, `${Math.round((i.paginas / total) * 100)}%`), el('small', {}, num(i.paginas))))));
  return card;
}

function pintarAudiencia(v) {
  const caja = $('audiencia');
  if (!v?.configurado || v.error) { caja.replaceChildren(); caja.hidden = true; return; }
  caja.hidden = false;
  caja.replaceChildren(
    tarjetaEquipos(v.equipos || []),
    listaBarras('Países', v.paises || [], { etiqueta: (i) => el('span', {}, el('span', { class: 'm-bandera', 'aria-hidden': 'true' }, bandera(i.nombre)), pais(i.nombre)) }),
    listaBarras('De dónde llegan', v.origen || [], { etiqueta: (i) => (i.nombre === '(directo)' ? 'Directo o app' : i.nombre.replace(/^www\./, '')) }),
    listaBarras('Páginas más vistas', v.paginasTop || [], { etiqueta: (i) => (i.nombre === '/' ? 'Inicio y catálogo' : i.nombre.startsWith('/p/') ? `Producto ${i.nombre.slice(3)}` : i.nombre), vacio: v.paginasTop ? 'Sin datos todavía' : 'No disponible' }),
    listaBarras('Navegadores', v.navegadores || [], { vacio: v.navegadores ? 'Sin datos todavía' : 'No disponible' }),
  );
}

// ---------- inventario ----------
function pintarInventario(revisiones) {
  const inv = revisiones.find((r) => r.id === 'stock')?.inventario;
  const caja = $('inventario');
  if (!inv) { caja.replaceChildren(el('p', { class: 'm-vacio' }, 'Sin datos del stock en esta revisión.')); return; }
  const dato = (t, v, n) => el('div', { class: 'm-dato' }, el('span', {}, t), el('b', {}, v), n ? el('small', {}, n) : null);
  const max = Math.max(1, ...inv.porCategoria.map((c) => c.unidades));
  caja.replaceChildren(el('div', { class: 'm-inv' },
    el('div', { class: 'm-datos' },
      dato('Productos', num(inv.productos), `en ${plural(inv.categorias, 'categoría', 'categorías')}`),
      dato('Unidades', num(inv.unidades)),
      dato('Valor a precio de venta', usd(inv.valorUsd), 'USD'),
      dato('Por agotarse', num(inv.pocasUnidades), '1 o 2 unidades')),
    el('ul', { class: 'm-cats' }, ...inv.porCategoria.map((c) => el('li', {},
      el('span', { class: 'm-lista-nombre' }, c.nombre),
      el('span', { class: 'm-lista-num' }, plural(c.unidades, 'unidad', 'unidades')),
      el('span', { class: 'm-lista-barra', '--p': `${Math.max(2, Math.round((c.unidades / max) * 100))}%` }))))));
}

// ---------- eventos y resumen ----------
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
      el('time', {}, horaLarga(ev.hora)),
      el('span', {}, el('strong', {}, ev.nombre), ` pasó de ${ETIQUETA[ev.antes].toLowerCase()} a ${ETIQUETA[ev.ahora].toLowerCase()}`),
      ev.detalle ? el('small', {}, ev.detalle) : null)));
}

function pintarResumen(revisiones) {
  const caidos = revisiones.filter((r) => r.estado === 'caido');
  const lentos = revisiones.filter((r) => r.estado === 'lento');
  $('resumen').textContent = caidos.length
    ? `Con problemas: ${caidos.map((r) => r.nombre).join(', ')}`
    : lentos.length ? `Todo en línea · lento: ${lentos.map((r) => r.nombre).join(', ')}` : 'Todo en línea';
  document.body.dataset.estado = caidos.length ? 'caido' : lentos.length ? 'lento' : 'ok';
  document.title = `${caidos.length ? '⚠ ' : ''}Monitor · MN Technology`;
}

function mostrarLogin(error = '') {
  $('panel').hidden = true;
  $('login').hidden = false;
  $('login-error').textContent = error;
  $('resumen').textContent = 'Escribe la clave para ver el estado.';
  $('clave').focus();
}

async function revisar() {
  if (!clave) return mostrarLogin();
  document.body.classList.add('cargando');
  let res, data;
  try {
    res = await fetch('/api/monitor', { headers: { 'X-Monitor-Clave': clave }, cache: 'no-store' });
    data = await res.json().catch(() => null);
  } catch {
    res = null;
  }
  document.body.classList.remove('cargando');
  if (res?.status === 401) {
    clave = '';
    guardar(CLAVE_KEY, '');
    return mostrarLogin('Clave incorrecta');
  }
  if (!res || !res.ok || !data?.revisiones) {
    const msg = data?.error || 'No se pudo contactar la web (¿sin internet?)';
    $('resumen').textContent = msg;
    document.body.dataset.estado = 'caido';
    registrarCambios([{ id: 'web', nombre: 'Página web', estado: 'caido', detalle: msg }], new Date());
  } else {
    inicioSesion ??= data.hora;
    sesion.total++;
    if (!data.revisiones.some((r) => r.estado === 'caido')) sesion.sanas++;
    ultimo = data;
    $('login').hidden = true;
    $('panel').hidden = false;
    pintarServicios(data.revisiones, data.hora);
    if (!primera) registrarCambios(data.revisiones, data.hora);
    else data.revisiones.forEach((r) => ultimoEstado.set(r.id, r.estado));
    primera = false;
    pintarKpis(data);
    pintarTrafico(data.visitas);
    pintarAudiencia(data.visitas);
    pintarInventario(data.revisiones);
    pintarResumen(data.revisiones);
    $('hora').textContent = `Actualizado ${horaLarga(data.hora)}`;
  }
  programar();
}

function programar() {
  clearTimeout(timer);
  if (!pausado && !document.hidden && clave) timer = setTimeout(revisar, INTERVALO_MS);
}

function elegirRango(r) {
  rango = r;
  guardar(RANGO_KEY, r);
  document.querySelectorAll('[data-rango]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.rango === r)));
  if (ultimo) pintarTrafico(ultimo.visitas);
}
document.querySelectorAll('[data-rango]').forEach((b) => b.addEventListener('click', () => elegirRango(b.dataset.rango)));
elegirRango(['hora', 'dia', 'semana'].includes(rango) ? rango : 'hora');

$('login').addEventListener('submit', (e) => {
  e.preventDefault();
  clave = $('clave').value.trim();
  guardar(CLAVE_KEY, clave);
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
  guardar(CLAVE_KEY, '');
  clearTimeout(timer);
  mostrarLogin();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(timer);
  else if (!pausado && clave) revisar();
});
window.addEventListener('scroll', ocultarTip, { passive: true });
let redimension;
window.addEventListener('resize', () => { clearTimeout(redimension); redimension = setTimeout(() => ultimo && pintarTrafico(ultimo.visitas), 150); });

revisar();
