// Decoración navideña: una capa aparte que no toca el inicio ni el catálogo. Solo se carga navidad.css cuando está
// encendida, así que fuera de temporada no cuesta nada. Para quitarla del todo basta con borrar este archivo, navidad.css
// y su <script> en index.html. Las fechas y el estilo se cambian en config.js (STORE.navidad).
// Nieve y luces son adorno: aria-hidden, sin clics, en pausa con la pestaña oculta y quietas con «reducir movimiento».

import { STORE } from './config.js';

export const ESTILOS = ['nieve', 'luces', 'completa'];

const mesDia = (s) => {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
};

// ¿Cae la fecha dentro de la temporada? «desde» y «hasta» son mes-día e incluyen ambos días; si «hasta» es menor
// que «desde» la temporada cruza el año (p. ej. 11-01 → 01-06).
export function enTemporada(cfg, fecha = new Date()) {
  const desde = mesDia(cfg?.desde);
  const hasta = mesDia(cfg?.hasta);
  if (desde === null || hasta === null) return false;
  const hoy = (fecha.getMonth() + 1) * 100 + fecha.getDate();
  return desde <= hasta ? hoy >= desde && hoy <= hasta : hoy >= desde || hoy <= hasta;
}

// Estilo que toca mostrar: el de la dirección (?navidad=…) manda para poder probar; si no, el de config.js en temporada.
export function estiloActivo(cfg, busqueda = '', fecha = new Date()) {
  const pedido = new URLSearchParams(busqueda).get('navidad');
  if (pedido !== null) return ESTILOS.includes(pedido) ? pedido : null;
  if (!ESTILOS.includes(cfg?.estilo)) return null;
  return enTemporada(cfg, fecha) ? cfg.estilo : null;
}

const quieto = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: true };

/* ---------- Monograma MN con gorro y luces ---------- */

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

// Cambia la «M» genérica del cuadrito (cabecera y pie) por el monograma MN de circuito del logo, con un gorro de
// Santa en la esquina y una tira de luces por encima. El texto «MN Technology» de al lado no cambia.
function logos() {
  for (const mark of document.querySelectorAll('.brand .mark')) {
    const caja = document.createElement('span');
    caja.className = 'nv-logo';
    caja.setAttribute('aria-hidden', 'true');
    const img = document.createElement('img');
    img.src = '/navidad-mn.png';
    img.alt = '';
    img.width = 70; img.height = 45;
    const gorro = document.createElement('span');
    gorro.className = 'nv-gorro';
    caja.append(img, gorro, lucesLogo());
    mark.replaceWith(caja);
  }
}

function lucesLogo() {
  const s = svg('svg', { class: 'nv-logo-luces', viewBox: '0 0 70 14' });
  s.append(svg('path', { d: 'M2 3 Q 18 11 35 3 Q 52 11 68 3', fill: 'none', stroke: '#4c4466', 'stroke-width': '1' }));
  // Puntos repartidos sobre las dos curvas (cálculo de la cuadrática, sin depender del DOM).
  const q = (p0, p1, p2, t) => (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2;
  let i = 0;
  for (const [x0, y0, x1, y1, x2, y2] of [[2, 3, 18, 11, 35, 3], [35, 3, 52, 11, 68, 3]]) {
    for (const t of [0.2, 0.5, 0.8]) {
      const c = COLORES[i % COLORES.length];
      const b = svg('ellipse', { cx: q(x0, x1, x2, t).toFixed(1), cy: (q(y0, y1, y2, t) + 2.6).toFixed(1), rx: '2.5', ry: '3.3', fill: c, class: 'nv-b' });
      b.style.setProperty('--c', c);
      b.style.animationDelay = `${((i * 0.41) % 1.6).toFixed(2)}s`;
      s.append(b);
      i++;
    }
  }
  return s;
}

/* ---------- Guirnalda de luces bajo la cabecera ---------- */

const COLORES = ['#ef4444', '#fbbf24', '#a78bfa', '#22c55e', '#60a5fa', '#f472b6'];

function luces() {
  const top = document.querySelector('.top');
  if (!top) return;
  const tira = document.createElement('div');
  tira.className = 'nv-luces';
  tira.setAttribute('aria-hidden', 'true');
  top.append(tira);
  const llenar = () => {
    const n = Math.max(8, Math.round(top.clientWidth / 46));
    if (tira.childElementCount === n) return;
    tira.replaceChildren(...Array.from({ length: n }, (_, i) => {
      const b = document.createElement('i');
      b.style.setProperty('--c', COLORES[i % COLORES.length]);
      b.style.animationDelay = `${((i * 0.37) % 1.6).toFixed(2)}s`;
      return b;
    }));
  };
  llenar();
  let espera = 0;
  addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(llenar, 200); });
}

/* ---------- Nieve suave ---------- */

function nieve() {
  if (quieto.matches) return;
  const lienzo = document.createElement('canvas');
  lienzo.className = 'nv-nieve';
  lienzo.setAttribute('aria-hidden', 'true');
  document.body.append(lienzo);
  const ctx = lienzo.getContext('2d');
  if (!ctx) return;
  let w = 0, h = 0, copos = [];
  const medir = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    lienzo.width = w * dpr; lienzo.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(60, Math.max(18, w / 28)));
    copos = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: 0.8 + Math.random() * 2.2,
      v: 0.25 + Math.random() * 0.6, fase: Math.random() * Math.PI * 2, a: 0.35 + Math.random() * 0.45,
    }));
  };
  medir();
  let espera = 0;
  addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(medir, 200); });

  let marco = 0;
  const pintar = (t) => {
    ctx.clearRect(0, 0, w, h);
    for (const c of copos) {
      c.y += c.v;
      c.x += Math.sin(t / 1800 + c.fase) * 0.3;
      if (c.y > h + 4) { c.y = -4; c.x = Math.random() * w; }
      ctx.globalAlpha = c.a;
      ctx.fillStyle = '#ede9fe';
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
    marco = requestAnimationFrame(pintar);
  };
  const seguir = () => {
    cancelAnimationFrame(marco);
    if (document.hidden || quieto.matches) { ctx.clearRect(0, 0, w, h); return; }
    marco = requestAnimationFrame(pintar);
  };
  document.addEventListener('visibilitychange', seguir);
  quieto.addEventListener?.('change', seguir);
  seguir();
}

/* ---------- Cinta «¡Feliz Navidad!» ---------- */

const ARBOL = '<svg viewBox="0 0 32 40"><path d="M16 2l3 5h-6z" fill="#fbbf24"/><path d="M16 6 5 20h6L3 30h26l-8-10h6z" fill="#16a34a"/><path d="M16 6 5 20h6L3 30h13z" fill="#15803d"/><rect x="13" y="30" width="6" height="7" rx="1" fill="#92400e"/><circle cx="12" cy="16" r="1.6" fill="#f472b6"/><circle cx="20" cy="22" r="1.6" fill="#60a5fa"/><circle cx="10" cy="26" r="1.6" fill="#fbbf24"/><circle cx="22" cy="27" r="1.6" fill="#a78bfa"/></svg>';
const REGALO = '<svg viewBox="0 0 36 36"><rect x="4" y="14" width="28" height="19" rx="2" fill="#7c3aed"/><rect x="2" y="9" width="32" height="7" rx="2" fill="#8b5cf6"/><rect x="16" y="9" width="4" height="24" fill="#fbbf24"/><path d="M18 9c-3-6-10-6-9-2s9 2 9 2zm0 0c3-6 10-6 9-2s-9 2-9 2z" fill="none" stroke="#fbbf24" stroke-width="2.4"/></svg>';

function cinta() {
  const top = document.querySelector('.top');
  if (!top) return;
  const c = document.createElement('div');
  c.className = 'nv-cinta';
  c.setAttribute('role', 'note');
  c.innerHTML = `<span class="nv-ico" aria-hidden="true">${ARBOL}</span>
    <p><strong>¡Feliz Navidad!</strong> <span>y próspero Año Nuevo <em>te desea ${STORE.nombre || 'MN Technology'}</em></span></p>
    <span class="nv-ico" aria-hidden="true">${REGALO}</span>`;
  top.before(c);
}

/* ---------- Bambalinas: escarcha y esferas colgando a los lados de la cabecera ---------- */

const ESFERAS = [
  { x: 18, largo: 34, color: '#dc2626' },
  { x: 58, largo: 62, color: '#7c3aed' },
  { x: 100, largo: 22, color: '#fbbf24' },
  { x: 136, largo: 46, color: '#3b82f6' },
];

function bambalina(lado) {
  const s = svg('svg', { class: `nv-bambalina nv-${lado}`, viewBox: '0 0 160 130', 'aria-hidden': 'true' });
  const defs = svg('defs');
  for (const [i, e] of ESFERAS.entries()) {
    const g = svg('radialGradient', { id: `nv-g-${lado}-${i}`, cx: '35%', cy: '35%', r: '70%' });
    g.append(svg('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '.85' }));
    g.append(svg('stop', { offset: '.25', 'stop-color': e.color }));
    g.append(svg('stop', { offset: '1', 'stop-color': e.color, 'stop-opacity': '.75' }));
    defs.append(g);
  }
  s.append(defs);
  // Escarcha: dos trazos punteados (dorado y lila) dan el efecto de flecos brillantes.
  const curva = 'M0 2 Q 40 30 80 6 Q 120 30 160 2';
  s.append(svg('path', { d: curva, fill: 'none', stroke: '#fbbf24', 'stroke-width': '7', 'stroke-dasharray': '1.2 1.6', class: 'nv-escarcha' }));
  s.append(svg('path', { d: curva, fill: 'none', stroke: '#c4b5fd', 'stroke-width': '5', 'stroke-dasharray': '1 2.2', 'stroke-dashoffset': '1.4' }));
  for (const [i, e] of ESFERAS.entries()) {
    const g = svg('g', { class: 'nv-esfera' });
    g.style.transformOrigin = `${e.x}px 0px`;
    g.style.animationDelay = `${(i * -0.7).toFixed(1)}s`;
    g.append(svg('line', { x1: e.x, y1: 0, x2: e.x, y2: e.largo, stroke: '#a8a29e', 'stroke-width': '1' }));
    g.append(svg('rect', { x: e.x - 3, y: e.largo, width: 6, height: 4, rx: 1, fill: '#d4a017' }));
    g.append(svg('circle', { cx: e.x, cy: e.largo + 14, r: 11, fill: `url(#nv-g-${lado}-${i})` }));
    s.append(g);
  }
  return s;
}

function bambalinas() {
  const top = document.querySelector('.top');
  if (!top) return;
  top.append(bambalina('izq'), bambalina('der'));
  // Solo arriba del todo: al bajar se recogen para no tapar productos.
  const ver = () => document.documentElement.classList.toggle('nv-abajo', scrollY > 120);
  addEventListener('scroll', ver, { passive: true });
  ver();
}

export function iniciarNavidad(cfg = STORE.navidad, busqueda = location.search) {
  const estilo = estiloActivo(cfg, busqueda);
  if (!estilo) return null;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/navidad.css';
  document.head.append(css);
  document.documentElement.classList.add('navidad', `navidad-${estilo}`);
  logos();
  if (estilo === 'luces' || estilo === 'completa') luces();
  if (estilo === 'nieve' || estilo === 'completa') nieve();
  if (estilo === 'completa') { cinta(); bambalinas(); }
  return estilo;
}

if (typeof document !== 'undefined') iniciarNavidad();
