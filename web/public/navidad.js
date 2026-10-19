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

/* ---------- Gorrito en el logo ---------- */

function gorritos() {
  for (const mark of document.querySelectorAll('.brand .mark')) mark.classList.add('nv-gorro');
}

/* ---------- Guirnalda de luces bajo la cabecera ---------- */

const COLORES = ['#a78bfa', '#fbbf24', '#60a5fa', '#f472b6'];

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

/* ---------- Cinta «Felices fiestas» ---------- */

function cinta() {
  const top = document.querySelector('.top');
  if (!top) return;
  const c = document.createElement('p');
  c.className = 'nv-cinta';
  c.textContent = `¡Felices fiestas de parte de ${STORE.nombre || 'MN Technology'}!`;
  top.before(c);
}

export function iniciarNavidad(cfg = STORE.navidad, busqueda = location.search) {
  const estilo = estiloActivo(cfg, busqueda);
  if (!estilo) return null;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/navidad.css';
  document.head.append(css);
  document.documentElement.classList.add('navidad', `navidad-${estilo}`);
  gorritos();
  if (estilo === 'luces' || estilo === 'completa') luces();
  if (estilo === 'nieve' || estilo === 'completa') nieve();
  if (estilo === 'completa') cinta();
  return estilo;
}

if (typeof document !== 'undefined') iniciarNavidad();
