import { icon, iconFor } from './icons.js';
import { STORE } from './config.js';

const LOW_STOCK = 3;
const PAGE = 48;
const OTHERS = 'Otros';
const FORMATS = {
  precio: new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }),
  precio_ves: new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }),
  precio_cop: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }),
};
const CURRENCY_CODES = { precio: 'USD', precio_ves: 'VES', precio_cop: 'COP' };
const CURRENCY_NAMES = { precio: 'Dólares (USD)', precio_ves: 'Bolívares (Bs.)', precio_cop: 'Pesos (COP)' };
const number = new Intl.NumberFormat('es-VE');
const CONTACT = STORE.contacto;

const $ = (id) => document.getElementById(id);
const app = $('app');
const q = $('q');
const currency = $('currency');
const detail = $('detail');

let items = [];
let loadError = false;
let pedidosOnline = false; // la web guarda el pedido en el sistema MN Tech (GET /api/pedido)
// Estado que no va en la dirección: filtros por especificación, orden y cuántos se ven.
let specFilters = new Map();
let sortBy = 'nombre';
let limit = PAGE;
// Carrito: código → cantidad. Vive solo en este navegador; el pedido se envía por WhatsApp.
const order = new Map();
const PEDIDOS = STORE.pedidos || {};

$('year').textContent = new Date().getFullYear();
try {
  const saved = localStorage.getItem('moneda');
  if (saved && FORMATS[saved]) currency.value = saved;
} catch {}
try {
  const saved = JSON.parse(localStorage.getItem('carrito') || '[]');
  if (Array.isArray(saved)) {
    for (const [code, n] of saved) if (typeof code === 'string' && Number.isInteger(n) && n > 0) order.set(code, n);
  }
} catch {}

/* ---------- Utilidades ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function link(href, className, text) {
  const a = el('a', className, text);
  a.href = href;
  return a;
}

function withIcon(node, key, after = false) {
  const svg = icon(key, 'ico');
  if (after) node.append(svg);
  else node.prepend(svg);
  return node;
}

const normalize = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const categoryOf = (item) => item.categoria || OTHERS;
const specList = (item) => (Array.isArray(item.especificaciones) ? item.especificaciones : []);
const safePhoto = (url) =>
  typeof url === 'string' && (url.startsWith('https://') || url.startsWith('/api/foto/')) ? url : null;
const priceText = (item, key = currency.value) => {
  const value = item[key];
  return value === null || value === undefined ? null : FORMATS[key].format(value);
};
const plural = (n, one, many) => `${number.format(n)} ${n === 1 ? one : many}`;
const waLink = (text) => `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`;
// Permite cortar «Cámaras/Videovigilancia» después de la barra.
const breakable = (s) => s.replace(/\//g, '/​');

// Marca: se agrupan las escrituras distintas («SAMSUNG», «Samsung») y se muestra la más usada.
const GENERIC = new Set(['generico', 'generica', 'sin marca', 'n/a', 'na', 'otro', 'otros']);
const brandKey = (item) => {
  const k = normalize(item.marca).trim();
  return k && !GENERIC.has(k) ? k : null;
};
let brandNames = new Map();

function buildBrandNames() {
  const spellings = new Map();
  for (const it of items) {
    const k = brandKey(it);
    if (!k) continue;
    const name = it.marca.trim();
    if (!spellings.has(k)) spellings.set(k, new Map());
    const m = spellings.get(k);
    m.set(name, (m.get(name) || 0) + 1);
  }
  brandNames = new Map(
    [...spellings].map(([k, m]) => {
      let best = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
      if (best === best.toUpperCase() && best.length > 3) best = best[0] + best.slice(1).toLowerCase();
      return [k, best];
    }),
  );
}
const brandName = (key) => brandNames.get(key) || key;

function countBy(list, keyFn) {
  const counts = new Map();
  for (const it of list) {
    const k = keyFn(it);
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

const byCountDesc = (counts) =>
  [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || String(a).localeCompare(String(b), 'es'));
const alphabetical = (names) =>
  [...names].sort((a, b) => (a === OTHERS ? 1 : b === OTHERS ? -1 : a.localeCompare(b, 'es', { sensitivity: 'base' })));

function stockBadge(n) {
  if (n <= LOW_STOCK) return [n === 1 ? 'Última unidad' : `Últimas ${n}`, 'low'];
  return [`${number.format(n)} disponibles`, 'ok'];
}

function photoInto(box, item) {
  const fallback = () => box.replaceChildren(icon(iconFor(item.categoria), 'placeholder'));
  const src = safePhoto(item.foto);
  if (!src) return fallback();
  const img = el('img');
  img.src = src;
  img.alt = item.nombre;
  img.loading = 'lazy';
  img.decoding = 'async';
  // Si la foto no carga (p. ej. el archivo ya no está en el servidor), se ve el ícono de su categoría.
  img.addEventListener('error', fallback, { once: true });
  box.replaceChildren(img);
}

/* ---------- Carrito ---------- */

const cartCount = () => [...order.values()].reduce((s, n) => s + n, 0);

function saveCart() {
  try { localStorage.setItem('carrito', JSON.stringify([...order.entries()])); } catch {}
  const n = cartCount();
  const badge = $('cart-count');
  badge.hidden = !n;
  badge.textContent = n > 99 ? '99+' : String(n);
  $('cart-btn').setAttribute('aria-label', n ? `Carrito, ${plural(n, 'producto', 'productos')}` : 'Carrito');
}

// Fija la cantidad de un producto sin pasar de lo disponible. Devuelve la cantidad que quedó.
function setQty(item, n) {
  const v = Math.max(0, Math.min(item.disponible, Number.isFinite(n) ? Math.floor(n) : 0));
  if (v) order.set(item.codigo, v);
  else order.delete(item.codigo);
  saveCart();
  return v;
}

// Al llegar el catálogo: fuera lo que ya no está y ninguna cantidad por encima de lo disponible.
function syncCart() {
  const byCode = new Map(items.map((it) => [it.codigo, it]));
  for (const [code, n] of order) {
    const it = byCode.get(code);
    if (!it) order.delete(code);
    else if (n > it.disponible) order.set(code, it.disponible);
  }
  saveCart();
}

let toastTimer = 0;
function toast(text, action) {
  const box = $('toast');
  box.replaceChildren(withIcon(el('span', null, text), 'check'));
  if (action) box.append(link(action[1], 'toast-link', action[0]));
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 3200);
}

function addToCart(item) {
  const before = order.get(item.codigo) || 0;
  const now = setQty(item, before + 1);
  if (now === before) toast(`Ya tienes todas las unidades disponibles (${number.format(item.disponible)})`, ['Ver carrito', '#/carrito']);
  else toast(`Agregado: ${item.nombre}`, ['Ver carrito', '#/carrito']);
  if (parseRoute().page === 'precios') render();
}

function addButton(item, className = 'btn add-btn') {
  const btn = el('button', className);
  btn.type = 'button';
  btn.setAttribute('aria-label', `Agregar ${item.nombre} al carrito`);
  btn.title = 'Agregar al carrito';
  btn.append(icon('cart', 'ico'));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    addToCart(item);
  });
  return btn;
}

/* ---------- Dirección (#/página?param=valor) ---------- */

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { page: path || 'inicio', params: new URLSearchParams(query) };
}

function hashFor(page, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return `#/${page === 'inicio' ? '' : page}${qs ? `?${qs}` : ''}`;
}

function go(page, params) {
  const hash = hashFor(page, params);
  if (location.hash === hash) render();
  else location.hash = hash;
}

const productsHref = (params) => hashFor('productos', params);

/* ---------- Tarjetas ---------- */

function productCard(item) {
  const li = el('li', 'card');
  const top = el('div', 'card-top');
  top.append(el('span', 'brand-tag', brandKey(item) ? brandName(brandKey(item)) : categoryOf(item)), shareButton(item));
  li.append(top);

  const photo = el('div', 'photo');
  photoInto(photo, item);
  li.append(photo);

  const body = el('div', 'body');
  body.append(el('h3', 'name', item.nombre));
  if (item.codigo) body.append(el('p', 'code-line', `Código: ${item.codigo}`));
  const specs = specList(item).slice(0, 2).map((s) => `${s.campo}: ${s.valor}`);
  if (specs.length) body.append(el('p', 'spec-line', specs.join(' · ')));
  const [label, kind] = stockBadge(item.disponible);
  body.append(withIcon(el('span', `badge ${kind}`, label), 'box'));
  const price = priceText(item);
  body.append(price ? el('p', 'price', price) : el('p', 'price none', 'Consultar precio'));
  const btn = withIcon(el('button', 'btn btn-outline', 'Ver detalles'), 'arrow', true);
  btn.type = 'button';
  btn.addEventListener('click', () => showDetail(item));
  const row = el('div', 'card-actions');
  row.append(btn, addButton(item));
  body.append(row);
  li.append(body);
  return li;
}

// Tarjeta horizontal compacta (carrusel de la portada).
function miniCard(item) {
  const li = el('li', 'mini');
  const btn = el('button', 'mini-btn');
  btn.type = 'button';
  btn.addEventListener('click', () => showDetail(item));
  const photo = el('div', 'mini-photo');
  photoInto(photo, item);
  const info = el('div', 'mini-info');
  info.append(el('span', 'mini-cat', categoryOf(item)), el('span', 'mini-name', item.nombre));
  if (item.codigo) info.append(el('span', 'mini-code', `Código: ${item.codigo}`));
  info.append(el('span', 'mini-price', priceText(item) || 'Consultar precio'));
  btn.append(photo, info);
  li.append(btn);
  return li;
}

/* ---------- Detalle ---------- */

function showDetail(item) {
  photoInto($('detail-photo'), item);
  $('detail-brand').textContent = [brandKey(item) && brandName(brandKey(item)), categoryOf(item)].filter(Boolean).join(' · ');
  $('detail-name').textContent = item.nombre;
  $('detail-meta').textContent = [item.modelo && `Modelo ${item.modelo}`, item.ram && `RAM ${item.ram}`, item.almacenamiento, item.color]
    .filter(Boolean)
    .join(' · ');
  $('detail-spec-list').replaceChildren(
    ...specList(item).map((s) => {
      const div = el('div');
      div.append(el('dt', null, s.campo), el('dd', null, s.valor));
      return div;
    }),
  );
  const keys = [currency.value, ...Object.keys(FORMATS).filter((k) => k !== currency.value)];
  const rows = keys
    .map((k) => [k, priceText(item, k)])
    .filter(([, t]) => t)
    .map(([k, t]) => {
      const div = el('div');
      div.append(el('dt', null, CURRENCY_NAMES[k]), el('dd', null, t));
      return div;
    });
  $('detail-prices').replaceChildren(...(rows.length ? rows : [el('p', 'muted', 'Consulta el precio con nosotros.')]));
  const [label, kind] = stockBadge(item.disponible);
  const stock = $('detail-stock');
  stock.className = `badge ${kind}`;
  stock.textContent = label;
  $('detail-code').textContent = item.codigo ? `Cód. ${item.codigo}` : '';
  const add = $('detail-add');
  const addLabel = () => {
    const n = order.get(item.codigo) || 0;
    add.textContent = n ? `En el carrito: ${number.format(n)} · Agregar otro` : 'Agregar al carrito';
    add.disabled = n >= item.disponible;
    if (add.disabled) add.textContent = `En el carrito: ${number.format(n)} (todo lo disponible)`;
  };
  addLabel();
  add.onclick = () => {
    setQty(item, (order.get(item.codigo) || 0) + 1);
    addLabel();
    if (parseRoute().page === 'precios' || parseRoute().page === 'carrito') render();
  };
  const wa = $('detail-whatsapp');
  wa.hidden = !CONTACT.whatsapp;
  if (CONTACT.whatsapp) wa.href = waLink(`Hola, me interesa: ${item.nombre}${item.codigo ? ` (${item.codigo})` : ''}`);
  const share = $('detail-share');
  share.hidden = !item.codigo;
  share.replaceChildren(withIcon(el('span', null, 'Compartir'), 'share'));
  share.onclick = () => shareProduct(item);
  if (typeof detail.showModal === 'function') detail.showModal();
}

detail.addEventListener('click', (e) => {
  if (e.target === detail || e.target.closest('[data-close]')) detail.close();
});

/* ---------- Compartir ---------- */

// Cada producto tiene su enlace (/p/<código>): abre la tienda con su ficha, y al compartirlo
// WhatsApp, Facebook, etc. muestran su nombre, precio y foto (la función functions/p/[code].js).
const productUrl = (item) => `${location.origin}/p/${encodeURIComponent(item.codigo)}`;
const shareDialog = $('share');

function shareText(item) {
  const price = priceText(item, 'precio');
  return `${item.nombre}${price ? ` · ${price}` : ''} en MN Technology`;
}

function shareButton(item) {
  const btn = el('button', 'icon-btn share-btn');
  btn.type = 'button';
  btn.title = 'Compartir';
  btn.setAttribute('aria-label', `Compartir ${item.nombre}`);
  btn.append(icon('share', 'ico'));
  btn.hidden = !item.codigo;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    shareProduct(item);
  });
  return btn;
}

// Siempre nuestro menú (funciona en todo navegador); «Más opciones» abre el menú del sistema si existe.
function shareProduct(item) {
  openShareMenu(item, productUrl(item), shareText(item));
}

function openShareMenu(item, url, text) {
  const enc = encodeURIComponent;
  const targets = [
    ['WhatsApp', 'chat', 'wa', `https://wa.me/?text=${enc(`${text}\n${url}`)}`],
    ['Facebook', 'facebook', 'fb', `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`],
    ['Telegram', 'send', 'tg', `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`],
    ['X', 'x', 'xx', `https://x.com/intent/post?url=${enc(url)}&text=${enc(text)}`],
  ];
  $('share-name').textContent = item.nombre;
  $('share-grid').replaceChildren(
    ...targets.map(([name, ico, cls, href]) => {
      const a = link(href, `share-opt share-${cls}`);
      a.target = '_blank';
      a.rel = 'noopener';
      a.append(icon(ico, 'ico'), el('span', null, name));
      return a;
    }),
  );
  const more = $('share-more');
  more.hidden = typeof navigator.share !== 'function';
  more.onclick = () => {
    navigator.share({ title: item.nombre, text, url }).catch(() => {});
  };
  const input = $('share-url');
  input.value = url;
  const copy = $('share-copy');
  copy.textContent = 'Copiar';
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      input.select();
      document.execCommand?.('copy');
    }
    copy.textContent = '¡Copiado!';
  };
  if (typeof shareDialog.showModal === 'function') shareDialog.showModal();
}

shareDialog.addEventListener('click', (e) => {
  if (e.target === shareDialog || e.target.closest('[data-close]')) shareDialog.close();
});

// Llegada por un enlace compartido: la tienda se ve en el catálogo y, al cargar, se abre la ficha.
const sharedCode = (() => {
  const m = location.pathname.match(/^\/p\/([^/]+)\/?$/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
})();
if (sharedCode) history.replaceState(null, '', `/${location.hash || '#/productos'}`);

/* ---------- Inicio ---------- */

function featureText(s) {
  const cats = countBy(items, (it) => it.categoria);
  return s.replace('{productos}', number.format(items.length)).replace('{categorias}', number.format(cats.size));
}

function pageHome() {
  const frag = document.createDocumentFragment();
  const catCounts = countBy(items, (it) => it.categoria);
  const topCats = byCountDesc(catCounts);

  // Portada: las dos categorías con más productos.
  const hero = el('section', 'banners');
  const pair = topCats.slice(0, 2);
  (pair.length ? pair : ['Catálogo']).forEach((name, i) => {
    const a = link(pair.length ? productsHref({ categoria: name }) : '#/productos', `banner banner-${i + 1}`);
    const art = el('div', 'banner-art');
    art.append(icon(iconFor(name), 'banner-icon'));
    const text = el('div', 'banner-text');
    text.append(el('h2', null, breakable(name)));
    if (pair.length) text.append(el('p', null, plural(catCounts.get(name), 'producto disponible', 'productos disponibles')));
    text.append(withIcon(el('span', 'btn btn-light', 'Ver catálogo'), 'arrow', true));
    a.append(art, text);
    hero.append(a);
  });
  frag.append(hero);

  const features = el('section', 'features wrap');
  for (const f of STORE.ventajas) {
    const div = el('div', 'feature');
    const ic = el('span', 'feature-icon');
    ic.append(icon(f.icono));
    const txt = el('div');
    txt.append(el('strong', null, featureText(f.titulo)), el('span', null, featureText(f.texto)));
    div.append(ic, txt);
    features.append(div);
  }
  frag.append(features);

  // Marcas en movimiento (la lista va dos veces para que el desplazamiento no tenga cortes).
  const brands = byCountDesc(countBy(items, brandKey)).slice(0, 24);
  if (brands.length) {
    const strip = el('section', 'brands');
    strip.setAttribute('aria-label', 'Marcas');
    const track = el('div', 'brands-track');
    for (const copy of [0, 1]) {
      for (const k of brands) {
        const a = link(productsHref({ marca: k }), 'brand-pill', brandName(k));
        if (copy) {
          a.setAttribute('aria-hidden', 'true');
          a.tabIndex = -1;
        }
        track.append(a);
      }
    }
    strip.append(track);
    frag.append(strip);
  }

  const catSec = el('section', 'section wrap');
  const head = el('div', 'section-head');
  head.append(el('h2', null, 'Explora por categoría'), link('#/productos', 'link-more', 'Ver todo el catálogo'));
  catSec.append(head);
  const tiles = el('ul', 'tiles');
  for (const name of topCats.slice(0, 12)) {
    const li = el('li');
    const a = link(productsHref({ categoria: name }), 'tile');
    const ic = el('span', 'tile-icon');
    ic.append(icon(iconFor(name)));
    a.append(ic, el('span', 'tile-name', breakable(name)), el('span', 'tile-count', plural(catCounts.get(name), 'producto', 'productos')));
    li.append(a);
    tiles.append(li);
  }
  catSec.append(tiles);
  frag.append(catSec);

  // Destacados: con foto primero, luego los de más existencias.
  const featured = [...items]
    .sort((a, b) => (safePhoto(b.foto) ? 1 : 0) - (safePhoto(a.foto) ? 1 : 0) || b.disponible - a.disponible)
    .slice(0, 16);
  if (featured.length) {
    const sec = el('section', 'section wrap');
    const h = el('div', 'section-head');
    const arrows = el('div', 'arrows');
    const row = el('ul', 'carousel');
    for (const [key, dir, label] of [['left', -1, 'Anteriores'], ['right', 1, 'Siguientes']]) {
      const b = el('button', 'arrow-btn');
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.append(icon(key));
      b.addEventListener('click', () => row.scrollBy({ left: dir * row.clientWidth * 0.9, behavior: 'smooth' }));
      arrows.append(b);
    }
    h.append(el('h2', null, 'Destacados'), arrows);
    row.append(...featured.map(miniCard));
    sec.append(h, row);
    frag.append(sec);
  }

  const cta = el('section', 'cta-band wrap');
  const inner = el('div', 'cta-inner');
  const txt = el('div');
  txt.append(
    el('h2', null, '¿Compras para tu negocio o varios equipos?'),
    el('p', null, 'Arma tu pedido en la lista de precios y envíanoslo para cotizar.'),
  );
  const btns = el('div', 'cta-btns');
  btns.append(withIcon(link('#/precios', 'btn btn-light', 'Lista de precios'), 'list'), link('#/contacto', 'btn btn-ghost-light', 'Contáctanos'));
  inner.append(txt, btns);
  cta.append(inner);
  frag.append(cta);
  return frag;
}

/* ---------- Productos ---------- */

const matchesTerms = (it, terms) => {
  if (!terms.length) return true;
  const text = normalize(
    [it.nombre, it.marca, it.modelo, it.codigo, it.categoria, ...specList(it).map((x) => x.valor)].filter(Boolean).join(' '),
  );
  return terms.every((t) => text.includes(t));
};

const matchesSpecs = (item) => {
  for (const [campo, valores] of specFilters) {
    if (!valores.size) continue;
    const spec = specList(item).find((s) => s.campo === campo);
    if (!spec || !valores.has(spec.valor)) return false;
  }
  return true;
};

const SORTS = {
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
  'precio-asc': (a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity),
  'precio-desc': (a, b) => (b.precio ?? -Infinity) - (a.precio ?? -Infinity),
  stock: (a, b) => b.disponible - a.disponible,
};

let lastProductsKey = '';

function filterGroup(titleText, entries, isOn, onPick, max = Infinity) {
  const g = el('div', 'fgroup');
  g.append(el('h3', null, titleText));
  const list = el('ul', 'flist');
  entries.forEach(([value, label, n, ic], i) => {
    const li = el('li');
    if (i >= max) li.className = 'extra';
    const b = el('button', 'fitem');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(isOn(value)));
    b.append(el('span', 'fcheck'));
    if (ic) b.append(icon(ic, 'ico'));
    b.append(el('span', 'flabel', label), el('span', 'fcount', number.format(n)));
    b.addEventListener('click', () => onPick(value));
    li.append(b);
    list.append(li);
  });
  g.append(list);
  if (entries.length > max) {
    const more = el('button', 'link-more', `Ver ${entries.length - max} más`);
    more.type = 'button';
    more.addEventListener('click', () => {
      const open = list.classList.toggle('show-all');
      more.textContent = open ? 'Ver menos' : `Ver ${entries.length - max} más`;
    });
    g.append(more);
  }
  return g;
}

function pageProducts(params) {
  const category = params.get('categoria') || '';
  const brand = params.get('marca') || '';
  const term = params.get('q') || '';
  // Al cambiar de categoría o marca se reinician los filtros finos y la paginación.
  const key = `${category}|${brand}|${term}`;
  if (key !== lastProductsKey) {
    specFilters = new Map();
    limit = PAGE;
    lastProductsKey = key;
  }
  if (q.value !== term && document.activeElement !== q) q.value = term;

  const wrap = el('div', 'shop wrap');
  const side = el('aside', 'filters-side');
  const main = el('section', 'shop-main');
  wrap.append(side, main);

  const head = el('div', 'shop-head');
  const titles = el('div');
  const count = el('p', 'muted');
  titles.append(el('h1', null, category || (brand ? brandName(brand) : 'Productos')), count);
  const tools = el('div', 'shop-tools');
  const filterBtn = withIcon(el('button', 'btn btn-outline filters-toggle', 'Filtros'), 'filter');
  filterBtn.type = 'button';
  filterBtn.addEventListener('click', () => side.classList.toggle('open'));
  const sort = el('select');
  sort.setAttribute('aria-label', 'Ordenar');
  for (const [v, t] of [['nombre', 'Nombre (A–Z)'], ['precio-asc', 'Precio: menor a mayor'], ['precio-desc', 'Precio: mayor a menor'], ['stock', 'Más disponibles']]) {
    const o = el('option', null, t);
    o.value = v;
    sort.append(o);
  }
  sort.value = sortBy;
  sort.addEventListener('change', () => { sortBy = sort.value; limit = PAGE; draw(); });
  tools.append(filterBtn, sort);
  head.append(titles, tools);

  const grid = el('ul', 'grid');
  const status = el('p', 'status');
  const more = el('button', 'btn btn-outline');
  more.type = 'button';
  more.addEventListener('click', () => { limit += PAGE; draw(); });
  const moreWrap = el('div', 'more-wrap');
  moreWrap.append(more);
  main.append(head, status, grid, moreWrap);

  function draw() {
    const terms = normalize(term).split(/\s+/).filter(Boolean);
    const searched = items.filter((it) => matchesTerms(it, terms));
    const inCategory = category ? searched.filter((it) => categoryOf(it) === category) : searched;
    const inBrand = brand ? inCategory.filter((it) => brandKey(it) === brand) : inCategory;
    const shown = inBrand.filter(matchesSpecs).sort(SORTS[sortBy]);

    const sideHead = el('div', 'fhead');
    sideHead.append(withIcon(el('strong', null, 'Filtros'), 'filter'));
    if (category || brand || [...specFilters.values()].some((v) => v.size)) {
      const clear = el('button', 'link-more', 'Limpiar');
      clear.type = 'button';
      clear.addEventListener('click', () => { specFilters = new Map(); go('productos', { q: term }); });
      sideHead.append(clear);
    }
    const catCounts = countBy(searched, categoryOf);
    const catEntries = [
      ['', 'Todas', searched.length, 'grid'],
      ...alphabetical(catCounts.keys()).map((c) => [c, c, catCounts.get(c), c === OTHERS ? 'box' : iconFor(c)]),
    ];
    const groups = [sideHead, filterGroup('Categorías', catEntries, (v) => v === category, (v) => go('productos', { categoria: v, q: term }), 12)];
    const brandCounts = countBy(inCategory, brandKey);
    if (brandCounts.size) {
      const entries = byCountDesc(brandCounts).map((k) => [k, brandName(k), brandCounts.get(k)]);
      groups.push(
        filterGroup('Marca', entries, (v) => v === brand, (v) => go('productos', { categoria: category, marca: v === brand ? '' : v, q: term }), 10),
      );
    }
    // Filtros por especificación: los campos de la categoría con al menos dos valores distintos.
    if (category) {
      const fields = new Map();
      for (const it of inBrand) {
        for (const { campo, valor } of specList(it)) {
          if (!fields.has(campo)) fields.set(campo, new Map());
          fields.get(campo).set(valor, (fields.get(campo).get(valor) || 0) + 1);
        }
      }
      for (const [campo, values] of fields) {
        if (values.size < 2) continue;
        const chosen = specFilters.get(campo) || new Set();
        const entries = [...values.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es', { numeric: true }))
          .map(([v, n]) => [v, v, n]);
        groups.push(
          filterGroup(campo, entries, (v) => chosen.has(v), (v) => {
            const set = specFilters.get(campo) || new Set();
            if (set.has(v)) set.delete(v);
            else set.add(v);
            specFilters.set(campo, set);
            limit = PAGE;
            draw();
          }, 8),
        );
      }
    }
    side.replaceChildren(...groups);

    count.textContent = `${plural(shown.length, 'producto', 'productos')}${term ? ` para «${term}»` : ''}`;
    grid.replaceChildren(...shown.slice(0, limit).map(productCard));
    more.hidden = shown.length <= limit;
    more.textContent = `Ver más productos (${number.format(shown.length - limit)})`;
    if (loadError) status.textContent = 'No pudimos cargar el catálogo en este momento. Intenta de nuevo en unos minutos.';
    else if (!items.length) status.textContent = 'Cargando catálogo…';
    else if (!shown.length) status.textContent = 'No encontramos productos con esos filtros.';
    else status.textContent = '';
  }

  draw();
  return wrap;
}

/* ---------- Lista de precios ---------- */

let priceCategory = '';
let priceBrand = '';
let priceTerm = '';

function orderLines() {
  const byCode = new Map(items.map((it) => [it.codigo, it]));
  return [...order.entries()].map(([code, n]) => [byCode.get(code), n]).filter(([it, n]) => it && n > 0);
}

function orderTotal(lines, cur) {
  return lines.reduce((s, [it, n]) => s + (it[cur] ?? 0) * n, 0);
}

const hasPrice = (it, cur) => it[cur] !== null && it[cur] !== undefined;

// Texto del pedido tal como llega por WhatsApp. `datos` = lo que el cliente llenó al confirmar.
function orderText(datos) {
  const lines = orderLines();
  const cur = currency.value;
  const rows = lines.map(([it, n]) => {
    const price = hasPrice(it, cur) ? ` — ${FORMATS[cur].format(it[cur])} c/u` : ' — precio por confirmar';
    return `• ${n} x ${it.nombre}${it.codigo ? ` (${it.codigo})` : ''}${price}`;
  });
  const out = [datos ? `Hola, quiero hacer este pedido (${datos.numero}):` : 'Hola, quiero cotizar:', ...rows, ''];
  out.push(`Total aproximado: ${FORMATS[cur].format(orderTotal(lines, cur))}`);
  if (lines.some(([it]) => !hasPrice(it, cur))) out.push('(sin contar los productos con precio por confirmar)');
  if (datos) {
    out.push('', `Nombre: ${datos.nombre}`);
    if (datos.cedula) out.push(`Cédula: ${datos.cedula}`);
    out.push(`Teléfono: ${datos.telefono}`);
    if (datos.entrega) out.push(`Entrega: ${datos.entrega}`);
    if (datos.direccion) out.push(`Dirección: ${datos.direccion}`);
    if (datos.pago) out.push(`Pago: ${datos.pago}`);
    if (datos.notas) out.push(`Notas: ${datos.notas}`);
  }
  return out.join('\n');
}

async function copyText(btn, text, label) {
  const span = btn.lastChild;
  try {
    await navigator.clipboard.writeText(text);
    span.textContent = '¡Copiado!';
    setTimeout(() => { span.textContent = label; }, 1800);
  } catch {
    window.prompt('Copia tu pedido:', text);
  }
}

function stepper(it, onChange) {
  const box = el('div', 'stepper');
  const minus = el('button');
  minus.type = 'button';
  minus.setAttribute('aria-label', `Quitar uno de ${it.nombre}`);
  minus.append(icon('minus'));
  const input = el('input');
  input.type = 'number';
  input.min = '0';
  input.max = String(it.disponible);
  input.inputMode = 'numeric';
  input.setAttribute('aria-label', `Cantidad de ${it.nombre}`);
  input.value = String(order.get(it.codigo) || 0);
  const plus = el('button');
  plus.type = 'button';
  plus.setAttribute('aria-label', `Agregar uno de ${it.nombre}`);
  plus.append(icon('plus'));
  const set = (n) => {
    // No se puede pedir más de lo que hay.
    const v = setQty(it, n);
    input.value = String(v);
    box.classList.toggle('active', v > 0);
    onChange();
  };
  box.classList.toggle('active', Number(input.value) > 0);
  minus.addEventListener('click', () => set(Number(input.value) - 1));
  plus.addEventListener('click', () => set(Number(input.value) + 1));
  input.addEventListener('change', () => set(Number(input.value)));
  box.append(minus, input, plus);
  return box;
}

function pagePrices() {
  const wrap = el('div', 'prices-page wrap');
  const head = el('div', 'prices-head');
  head.append(
    el('h1', null, 'Lista de precios'),
    el('p', 'muted', 'Marca la cantidad de cada producto y revisa tu pedido en el carrito.'),
  );
  const tabs = el('div', 'tabs');
  const search = el('input', 'input');
  search.type = 'search';
  search.placeholder = 'Buscar nombre, modelo o código…';
  search.setAttribute('aria-label', 'Buscar en la lista de precios');
  search.value = priceTerm;
  const tabsRow = el('div', 'tabs-row');
  tabsRow.append(tabs, search);
  const brandsRow = el('div', 'chips-row');
  const list = el('div', 'accordion');
  wrap.append(head, tabsRow, brandsRow, list);

  const bar = el('div', 'order-bar');
  const barInner = el('div', 'order-inner wrap');
  const summary = el('div', 'order-summary');
  const cartLink = withIcon(link('#/carrito', 'btn', 'Ir al carrito'), 'arrow', true);
  const actions = el('div', 'order-actions');
  actions.append(cartLink);
  barInner.append(summary, actions);
  bar.append(barInner);
  wrap.append(bar);

  function updateBar() {
    const lines = orderLines();
    const qty = lines.reduce((s, [, n]) => s + n, 0);
    const cur = currency.value;
    summary.replaceChildren(el('span', null, `Cantidad: ${number.format(qty)}`), el('strong', null, `Total: ${FORMATS[cur].format(orderTotal(lines, cur))}`));
    cartLink.classList.toggle('disabled', !qty);
  }

  function draw() {
    const catCounts = countBy(items, categoryOf);
    const cats = byCountDesc(catCounts);
    tabs.replaceChildren(
      ...['', ...cats.slice(0, 4)].map((c) => {
        const b = el('button', 'tab', c || 'Todas');
        b.type = 'button';
        b.setAttribute('aria-pressed', String(c === priceCategory));
        b.addEventListener('click', () => { priceCategory = c; priceBrand = ''; draw(); });
        return b;
      }),
    );
    if (cats.length > 4) {
      const sel = el('select', 'tab-select');
      sel.setAttribute('aria-label', 'Más categorías');
      const first = el('option', null, 'Más categorías…');
      first.value = '';
      sel.append(first, ...cats.slice(4).map((c) => { const o = el('option', null, c); o.value = c; return o; }));
      if (cats.slice(4).includes(priceCategory)) {
        sel.value = priceCategory;
        sel.classList.add('on');
      }
      sel.addEventListener('change', () => { priceCategory = sel.value; priceBrand = ''; draw(); });
      tabs.append(sel);
    }

    const terms = normalize(priceTerm).split(/\s+/).filter(Boolean);
    const pool = items.filter((it) => (!priceCategory || categoryOf(it) === priceCategory) && matchesTerms(it, terms));
    const brandOrder = byCountDesc(countBy(pool, brandKey));
    brandsRow.replaceChildren(
      ...['', ...brandOrder].map((k) => {
        const b = el('button', 'chip', k ? brandName(k) : 'Todas las marcas');
        b.type = 'button';
        b.setAttribute('aria-pressed', String(k === priceBrand));
        b.addEventListener('click', () => { priceBrand = k; draw(); });
        return b;
      }),
    );

    const groups = new Map();
    for (const it of pool) {
      const k = brandKey(it) || '~';
      if (priceBrand && k !== priceBrand) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    }
    const keys = [...groups.keys()].sort((a, b) => (a === '~' ? 1 : b === '~' ? -1 : brandName(a).localeCompare(brandName(b), 'es')));
    list.replaceChildren(
      ...keys.map((k, i) => {
        const det = el('details', 'acc');
        if (i === 0 || priceBrand || terms.length) det.open = true;
        const sum = el('summary');
        sum.append(el('span', 'acc-name', k === '~' ? 'Otras marcas' : brandName(k)), el('span', 'acc-count', number.format(groups.get(k).length)), icon('down', 'acc-chevron'));
        const rows = el('ul', 'acc-rows');
        for (const it of groups.get(k).sort(SORTS.nombre)) {
          const li = el('li', 'prow');
          const info = el('div', 'prow-info');
          const name = el('button', 'prow-name', it.nombre);
          name.type = 'button';
          name.addEventListener('click', () => showDetail(it));
          const head = el('div', 'prow-head');
          head.append(name, shareButton(it));
          info.append(head, el('span', 'prow-code', [it.codigo, categoryOf(it)].filter(Boolean).join(' · ')));
          const [label, kind] = stockBadge(it.disponible);
          li.append(info, el('span', `badge ${kind}`, label), el('span', 'prow-price', priceText(it) || 'Consultar'), stepper(it, updateBar));
          rows.append(li);
        }
        det.append(sum, rows);
        return det;
      }),
    );
    if (!keys.length) list.append(el('p', 'status', items.length ? 'No hay productos con esa búsqueda.' : 'Cargando catálogo…'));
    updateBar();
  }

  search.addEventListener('input', () => { priceTerm = search.value; draw(); });
  draw();
  return wrap;
}

/* ---------- Carrito ---------- */

const pad = (n) => String(n).padStart(2, '0');
function orderNumber() {
  const d = new Date();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
  return `MN-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${rand}`;
}

function readClient() {
  try {
    const c = JSON.parse(localStorage.getItem('cliente') || '{}');
    return c && typeof c === 'object' ? c : {};
  } catch {
    return {};
  }
}

function pageCart() {
  const wrap = el('div', 'cart-page wrap');
  wrap.append(el('h1', null, 'Tu carrito'));
  const lines = orderLines();

  if (!lines.length) {
    if (order.size && !items.length && !loadError) {
      wrap.append(el('p', 'status', 'Cargando tu carrito…'));
      return wrap;
    }
    const empty = el('div', 'cart-empty');
    const ic = el('span', 'cart-empty-icon');
    ic.append(icon('cart'));
    const btns = el('div', 'cta-btns');
    btns.append(withIcon(link('#/productos', 'btn', 'Ver productos'), 'arrow', true), withIcon(link('#/precios', 'btn btn-outline', 'Lista de precios'), 'list'));
    empty.append(ic, el('h2', null, 'Tu carrito está vacío'), el('p', 'muted', 'Agrega productos desde el catálogo o la lista de precios.'), btns);
    wrap.append(empty);
    return wrap;
  }

  const grid = el('div', 'cart-grid');
  const list = el('ul', 'cart-list');
  const side = el('aside', 'cart-side');
  grid.append(list, side);
  wrap.append(grid);

  const cur = currency.value;
  const totals = el('dl', 'cart-totals');
  const subtotals = new Map();
  function updateTotals() {
    const now = orderLines();
    if (now.length !== lines.length) return render();
    for (const [it, n] of now) {
      const sub = subtotals.get(it.codigo);
      if (sub) sub.textContent = hasPrice(it, cur) ? FORMATS[cur].format(it[cur] * n) : 'Por confirmar';
    }
    const qty = now.reduce((s, [, n]) => s + n, 0);
    const rows = [
      ['Productos', number.format(qty)],
      ['Total aproximado', FORMATS[cur].format(orderTotal(now, cur))],
    ];
    totals.replaceChildren(
      ...rows.map(([k, v]) => {
        const div = el('div');
        div.append(el('dt', null, k), el('dd', null, v));
        return div;
      }),
    );
  }

  for (const [it] of lines) {
    const li = el('li', 'cart-line');
    const photo = el('button', 'cart-photo');
    photo.type = 'button';
    photo.setAttribute('aria-label', `Ver ${it.nombre}`);
    photoInto(photo, it);
    photo.addEventListener('click', () => showDetail(it));
    const info = el('div', 'cart-info');
    info.append(
      el('span', 'cart-name', it.nombre),
      el('span', 'prow-code', [it.codigo, categoryOf(it)].filter(Boolean).join(' · ')),
      el('span', 'cart-unit', hasPrice(it, cur) ? `${FORMATS[cur].format(it[cur])} c/u` : 'Precio por confirmar'),
    );
    const sub = el('strong', 'cart-sub');
    subtotals.set(it.codigo, sub);
    const remove = el('button', 'icon-btn');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Quitar ${it.nombre} del carrito`);
    remove.title = 'Quitar';
    remove.append(icon('trash'));
    remove.addEventListener('click', () => { setQty(it, 0); render(); });
    li.append(photo, info, stepper(it, updateTotals), sub, remove);
    list.append(li);
  }

  const card = el('div', 'cart-card');
  card.append(el('h2', null, 'Resumen'), totals);
  if (cur !== 'precio') card.append(el('p', 'small muted', 'Montos calculados con la tasa del día de cada producto.'));
  const clear = el('button', 'link-more', 'Vaciar carrito');
  clear.type = 'button';
  clear.addEventListener('click', () => {
    order.clear();
    saveCart();
    render();
  });
  card.append(clear);
  side.append(card, checkoutForm());
  updateTotals();
  return wrap;
}

function checkoutForm() {
  const box = el('div', 'cart-card');
  const form = el('form', 'contact-form');
  const client = readClient();
  const field = (label, control) => {
    const l = el('label', 'field');
    l.append(el('span', null, label), control);
    return l;
  };
  const input = (props) => Object.assign(el('input', 'input'), props);
  const nombre = input({ required: true, placeholder: 'Nombre y apellido', autocomplete: 'name', maxLength: 80, value: client.nombre || '' });
  const telefono = input({ required: true, type: 'tel', placeholder: 'Ej. 0412 123 4567', autocomplete: 'tel', maxLength: 30, value: client.telefono || '' });
  const cedula = input({ required: true, placeholder: 'Ej. V12345678', autocomplete: 'off', maxLength: 20, value: client.cedula || '' });
  const pair = el('div', 'two');
  pair.append(field('Cédula *', cedula), field('Teléfono *', telefono));
  form.append(field('Nombre *', nombre), pair);

  let entrega = '';
  const direccion = el('textarea', 'input');
  direccion.rows = 2;
  direccion.maxLength = 200;
  direccion.placeholder = 'Ciudad, sector, calle y punto de referencia';
  const dirField = field('Dirección de envío *', direccion);
  const needsAddress = (v) => /env[ií]o|domicilio|delivery/i.test(v);
  if (Array.isArray(PEDIDOS.entrega) && PEDIDOS.entrega.length) {
    const group = el('fieldset', 'choice');
    group.append(el('legend', null, 'Entrega'));
    PEDIDOS.entrega.forEach((opt, i) => {
      const l = el('label', 'choice-opt');
      const r = input({ type: 'radio', name: 'entrega', value: opt, checked: i === 0, className: '' });
      r.addEventListener('change', () => {
        entrega = opt;
        dirField.hidden = !needsAddress(opt);
        direccion.required = !dirField.hidden;
      });
      l.append(r, el('span', null, opt));
      group.append(l);
    });
    entrega = PEDIDOS.entrega[0];
    form.append(group);
  }
  dirField.hidden = !needsAddress(entrega);
  direccion.required = !dirField.hidden;
  form.append(dirField);

  let pago = null;
  if (Array.isArray(PEDIDOS.pago) && PEDIDOS.pago.length) {
    pago = el('select');
    const first = el('option', null, 'Elegir…');
    first.value = '';
    pago.append(first, ...PEDIDOS.pago.map((p) => { const o = el('option', null, p); o.value = p; return o; }));
    form.append(field('Forma de pago', pago));
  }
  const notas = el('textarea', 'input');
  notas.rows = 2;
  notas.maxLength = 300;
  notas.placeholder = 'Color, modelo, hora para retirar…';
  form.append(field('Notas', notas));

  // Campo trampa para robots: oculto para las personas y fuera del orden del teclado.
  const trap = input({ name: 'sitio', tabIndex: -1, autocomplete: 'off' });
  const trapBox = el('div', 'trap');
  trapBox.setAttribute('aria-hidden', 'true');
  trapBox.append(trap);
  form.append(trapBox);

  const online = pedidosOnline;
  const label = online ? 'Enviar pedido' : CONTACT.whatsapp ? 'Enviar pedido por WhatsApp' : 'Copiar pedido';
  const submit = withIcon(el('button', `btn btn-block${!online && CONTACT.whatsapp ? ' btn-wa' : ''}`, label), online || CONTACT.whatsapp ? 'send' : 'copy');
  submit.type = 'submit';
  const errorBox = el('div', 'form-error');
  errorBox.setAttribute('role', 'alert');
  errorBox.hidden = true;
  form.append(errorBox, submit);
  if (PEDIDOS.aviso) form.append(el('p', 'small muted', PEDIDOS.aviso));
  if (!online && !CONTACT.whatsapp) form.append(el('p', 'small muted', 'Copia tu pedido y envíanoslo por nuestros canales de contacto.'));

  box.append(el('h2', null, 'Datos para tu pedido'), form);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const datos = {
      numero: orderNumber(),
      nombre: nombre.value.trim(),
      telefono: telefono.value.trim(),
      cedula: cedula.value.trim(),
      entrega,
      direccion: dirField.hidden ? '' : direccion.value.trim(),
      pago: pago ? pago.value : '',
      notas: notas.value.trim(),
    };
    try { localStorage.setItem('cliente', JSON.stringify({ nombre: datos.nombre, telefono: datos.telefono, cedula: datos.cedula })); } catch {}
    if (online) return sendOrder(datos);
    const text = orderText(datos);
    if (CONTACT.whatsapp) window.open(waLink(text), '_blank', 'noopener');
    else copyText(submit, text, label);
    box.replaceChildren(sentPanel(datos, text));
  });

  // Pedido en línea: queda guardado en el sistema MN Tech (pantalla «Pedidos web»).
  async function sendOrder(datos) {
    const lines = orderLines();
    const cur = currency.value;
    const span = submit.lastChild;
    submit.disabled = true;
    span.textContent = 'Enviando…';
    errorBox.hidden = true;
    let res = null;
    let data = null;
    try {
      res = await fetch('/api/pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          nombre: datos.nombre, telefono: datos.telefono, cedula: datos.cedula, entrega: datos.entrega, direccion: datos.direccion,
          pago: datos.pago, notas: datos.notas, moneda: CURRENCY_CODES[cur], sitio: trap.value,
          items: lines.map(([it, n]) => ({ codigo: it.codigo, cantidad: n })),
        }),
      });
      data = await res.json().catch(() => null);
    } catch {}
    if (res?.status === 201 && data?.numero) {
      order.clear();
      saveCart();
      $('toast').hidden = true;
      app.replaceChildren(receivedView({ ...datos, numero: data.numero }, lines, cur));
      requestAnimationFrame(() => window.scrollTo(0, 0));
      return;
    }
    submit.disabled = false;
    span.textContent = label;
    const known = res && [400, 409, 429].includes(res.status) && data?.error;
    errorBox.replaceChildren(el('p', null, known ? data.error : 'No pudimos enviar tu pedido en este momento. Intenta de nuevo en unos minutos.'));
    if (res?.status === 409) errorBox.append(el('p', 'small', 'Ajusta las cantidades en tu carrito y vuelve a enviarlo.'));
    if (!known && CONTACT.whatsapp) {
      datos.numero = orderNumber();
      const wa = withIcon(link(waLink(orderText(datos)), 'btn btn-wa btn-block', 'Enviarlo por WhatsApp'), 'chat');
      wa.target = '_blank';
      wa.rel = 'noopener';
      errorBox.append(wa);
    }
    errorBox.hidden = false;
  }
  return box;
}

// Pedido guardado en el servidor: número, resumen y qué sigue. El carrito ya quedó vacío.
function receivedView(datos, lines, cur) {
  const wrap = el('div', 'cart-page wrap');
  const card = el('div', 'cart-empty received');
  const ic = el('span', 'cart-empty-icon');
  ic.append(icon('check'));
  card.append(
    ic,
    el('h1', null, '¡Pedido recibido!'),
    el('p', 'received-number', datos.numero),
    el('p', 'muted', `Te contactaremos al ${datos.telefono} para confirmar disponibilidad, precio y entrega. Guarda tu número de pedido.`),
  );
  const list = el('ul', 'received-list');
  for (const [it, n] of lines) {
    const li = el('li');
    li.append(el('span', null, `${n} × ${it.nombre}`), el('strong', null, hasPrice(it, cur) ? FORMATS[cur].format(it[cur] * n) : 'Por confirmar'));
    list.append(li);
  }
  const total = el('li', 'received-total');
  total.append(el('span', null, 'Total aproximado'), el('strong', null, FORMATS[cur].format(orderTotal(lines, cur))));
  list.append(total);
  card.append(list);
  const btns = el('div', 'cta-btns');
  btns.append(withIcon(link('#/productos', 'btn', 'Seguir comprando'), 'arrow', true));
  if (CONTACT.whatsapp) {
    const wa = withIcon(link(waLink(`Hola, hice el pedido ${datos.numero} en la web.`), 'btn btn-outline', 'Escríbenos por WhatsApp'), 'chat');
    wa.target = '_blank';
    wa.rel = 'noopener';
    btns.append(wa);
  }
  card.append(btns);
  wrap.append(card);
  return wrap;
}

// Después de enviar: el pedido sigue en el carrito hasta que el cliente lo vacíe, por si WhatsApp no abrió.
function sentPanel(datos, text) {
  const div = el('div', 'cart-sent');
  const ic = el('span', 'cart-empty-icon');
  ic.append(icon('check'));
  div.append(
    ic,
    el('h2', null, `Pedido ${datos.numero}`),
    el('p', 'muted', CONTACT.whatsapp
      ? 'Se abrió WhatsApp con tu pedido. Envía el mensaje y te confirmamos disponibilidad y precio.'
      : 'Tu pedido quedó copiado. Envíanoslo y te confirmamos disponibilidad y precio.'),
  );
  const btns = el('div', 'sent-btns');
  if (CONTACT.whatsapp) {
    const again = withIcon(link(waLink(text), 'btn btn-wa btn-block', 'Abrir WhatsApp de nuevo'), 'chat');
    again.target = '_blank';
    again.rel = 'noopener';
    btns.append(again);
  }
  const copy = withIcon(el('button', 'btn btn-outline btn-block', 'Copiar pedido'), 'copy');
  copy.type = 'button';
  copy.addEventListener('click', () => copyText(copy, text, 'Copiar pedido'));
  const done = el('button', 'btn btn-outline btn-block', 'Listo, vaciar carrito');
  done.type = 'button';
  done.addEventListener('click', () => {
    order.clear();
    saveCart();
    go('productos');
  });
  btns.append(copy, done);
  div.append(btns);
  return div;
}

/* ---------- Chat ---------- */

// Burbuja flotante: el cliente escribe aquí y la conversación sigue en WhatsApp.
function setupChat() {
  const box = $('chat');
  if (!CONTACT.whatsapp) return;
  const cfg = STORE.chat || {};
  const fab = el('button', 'chat-fab');
  fab.type = 'button';
  fab.setAttribute('aria-label', 'Abrir chat');
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-controls', 'chat-panel');
  fab.append(icon('chat'));
  const panel = el('section', 'chat-panel');
  panel.id = 'chat-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Chat con MN Technology');

  const head = el('div', 'chat-head');
  const mark = el('span', 'mark');
  mark.append(icon('chat'));
  const who = el('div');
  who.append(el('strong', null, STORE.nombre), el('span', null, 'Te respondemos por WhatsApp'));
  const close = el('button', 'chat-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar chat');
  close.append(icon('close'));
  head.append(mark, who, close);

  const body = el('div', 'chat-body');
  body.append(el('p', 'chat-bubble', cfg.saludo || '¡Hola! ¿En qué te podemos ayudar?'));
  const form = el('form', 'chat-form');
  const text = el('textarea', 'input');
  text.rows = 2;
  text.maxLength = 500;
  text.placeholder = 'Escribe tu mensaje…';
  text.setAttribute('aria-label', 'Mensaje');
  if (Array.isArray(cfg.sugerencias) && cfg.sugerencias.length) {
    const chips = el('div', 'chat-chips');
    for (const sug of cfg.sugerencias) {
      const c = el('button', 'chip', sug);
      c.type = 'button';
      c.addEventListener('click', () => { text.value = sug; text.focus(); });
      chips.append(c);
    }
    body.append(chips);
  }
  const send = el('button', 'chat-send');
  send.type = 'submit';
  send.setAttribute('aria-label', 'Enviar por WhatsApp');
  send.append(icon('send'));
  form.append(text, send);
  panel.append(head, body, form);
  box.append(panel, fab);
  box.hidden = false;

  const toggle = (open) => {
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    box.classList.toggle('open', open);
    if (open) text.focus();
  };
  fab.addEventListener('click', () => toggle(panel.hidden));
  close.addEventListener('click', () => { toggle(false); fab.focus(); });
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggle(false); fab.focus(); } });
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = text.value.trim();
    if (!msg) return text.focus();
    window.open(waLink(msg), '_blank', 'noopener');
    text.value = '';
    toggle(false);
  });
}

/* ---------- Nosotros ---------- */

function pageAbout() {
  const frag = document.createDocumentFragment();
  const n = STORE.nosotros;
  const hero = el('section', 'about-hero');
  const inner = el('div', 'about-inner wrap');
  const copy = el('div');
  const h1 = el('h1', null, `${n.titulo[0]} `);
  h1.append(el('span', 'grad', n.titulo[1]));
  const btns = el('div', 'cta-btns');
  btns.append(link('#/contacto', 'btn', 'Contáctanos'), link('#/productos', 'btn btn-ghost-light', 'Ver catálogo'));
  copy.append(el('p', 'eyebrow', n.etiqueta), h1, el('p', 'lead', n.texto), btns);

  // Ventana de «terminal» con los números reales del catálogo.
  const term = el('div', 'terminal');
  term.setAttribute('aria-hidden', 'true');
  const bar = el('div', 'term-bar');
  bar.append(el('i'), el('i'), el('i'), el('span', null, 'mntech-sync — inventario'));
  const body = el('div', 'term-body');
  const now = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  const lines = [
    ['cmd', '> sync --live'],
    ['ok', `Productos publicados: ${number.format(items.length)}`],
    ['ok', `Categorías: ${number.format(countBy(items, (it) => it.categoria).size)}`],
    ['ok', 'Precios USD · Bs. · COP'],
    ['ok', `Última sincronización: ${now}`],
  ];
  for (const [kind, text] of lines) {
    const p = el('p', kind === 'cmd' ? 'cmd' : null, text);
    if (kind === 'ok') p.append(el('b', null, ' OK'));
    body.append(p);
  }
  const wait = el('p', 'cmd', '> esperando tu pedido… ');
  wait.append(el('span', 'cursor'));
  body.append(wait);
  term.append(bar, body, el('div', 'term-bars'));
  inner.append(copy, term);
  hero.append(inner);
  frag.append(hero);

  const sec = el('section', 'section wrap center');
  sec.append(el('span', 'pill-label', 'Nuestra identidad'), el('h2', null, 'Lo que nos impulsa'));
  const cards = el('div', 'pillars');
  n.pilares.forEach((p, i) => {
    const c = el('div', 'pillar');
    c.append(el('span', 'pillar-tag', `${p.nombre.toUpperCase()}_0${i + 1}`), el('p', null, p.texto));
    cards.append(c);
  });
  sec.append(cards);
  frag.append(sec);
  return frag;
}

/* ---------- Contacto ---------- */

function contactRows() {
  return [
    CONTACT.whatsapp && ['chat', 'WhatsApp', `+${CONTACT.whatsapp}`, `https://wa.me/${CONTACT.whatsapp}`],
    CONTACT.correo && ['mail', 'Correo', CONTACT.correo, `mailto:${CONTACT.correo}`],
    CONTACT.instagram && ['insta', 'Instagram', `@${CONTACT.instagram}`, `https://instagram.com/${CONTACT.instagram}`],
    CONTACT.direccion && ['pin', 'Dirección', CONTACT.direccion],
    CONTACT.horario && ['clock', 'Horario', CONTACT.horario],
  ].filter(Boolean);
}

function contactLink(text, href) {
  const a = link(href, null, text);
  if (href.startsWith('http')) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return a;
}

function pageContact() {
  const wrap = el('div', 'contact-page');
  const left = el('section', 'contact-left');
  left.append(el('h1', null, 'Contacto'), el('p', 'muted', 'Escríbenos y te respondemos a la brevedad.'));
  const rows = contactRows();
  if (rows.length) {
    const ul = el('ul', 'contact-list');
    for (const [ic, label, text, href] of rows) {
      const li = el('li');
      const badge = el('span', 'feature-icon');
      badge.append(icon(ic));
      const t = el('div');
      t.append(el('span', 'small muted', label), href ? contactLink(text, href) : el('strong', null, text));
      li.append(badge, t);
      ul.append(li);
    }
    left.append(ul);
  }

  // El formulario arma el mensaje y lo abre en WhatsApp (o en el correo); la web no guarda nada.
  const form = el('form', 'contact-form');
  const field = (label, control) => {
    const l = el('label', 'field');
    l.append(el('span', null, label), control);
    return l;
  };
  const nombre = el('input', 'input');
  nombre.required = true;
  nombre.placeholder = 'Tu nombre';
  nombre.autocomplete = 'name';
  const empresa = el('input', 'input');
  empresa.placeholder = 'Opcional';
  const mensaje = el('textarea', 'input');
  mensaje.required = true;
  mensaje.rows = 5;
  mensaje.placeholder = 'Cuéntanos qué estás buscando…';
  const two = el('div', 'two');
  two.append(field('Nombre *', nombre), field('Empresa', empresa));
  const can = CONTACT.whatsapp || CONTACT.correo;
  const submit = withIcon(el('button', 'btn btn-block', CONTACT.whatsapp ? 'Enviar por WhatsApp' : 'Enviar mensaje'), 'send');
  submit.type = 'submit';
  submit.disabled = !can;
  form.append(two, field('Mensaje *', mensaje), submit);
  if (!can) form.append(el('p', 'small muted', 'Muy pronto publicaremos nuestros datos de contacto.'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const who = `${nombre.value.trim()}${empresa.value.trim() ? ` de ${empresa.value.trim()}` : ''}`;
    const text = `Hola, soy ${who}.\n${mensaje.value.trim()}`;
    if (CONTACT.whatsapp) window.open(waLink(text), '_blank', 'noopener');
    else if (CONTACT.correo) {
      location.href = `mailto:${CONTACT.correo}?subject=${encodeURIComponent('Consulta desde la web')}&body=${encodeURIComponent(text)}`;
    }
  });
  left.append(form);

  const right = el('div', 'contact-art');
  right.setAttribute('aria-hidden', 'true');
  wrap.append(left, right);
  return wrap;
}

/* ---------- Pie, navegación y arranque ---------- */

function fillFooter() {
  const counts = countBy(items, (it) => it.categoria);
  $('foot-cats').replaceChildren(
    ...byCountDesc(counts).slice(0, 6).map((c) => {
      const li = el('li');
      li.append(link(productsHref({ categoria: c }), null, c));
      return li;
    }),
  );
  const rows = contactRows();
  if (!rows.length) return;
  $('foot-contact-list').replaceChildren(
    ...rows.map(([, label, text, href]) => {
      const li = el('li');
      li.append(el('span', 'foot-label', label), href ? contactLink(text, href) : el('span', null, text));
      return li;
    }),
  );
  $('foot-contact').hidden = false;
}

const PAGES = { inicio: pageHome, productos: pageProducts, precios: pagePrices, carrito: pageCart, nosotros: pageAbout, contacto: pageContact };
const TITLES = { inicio: 'Tienda de tecnología', productos: 'Productos', precios: 'Lista de precios', carrito: 'Carrito', nosotros: 'Nosotros', contacto: 'Contacto' };
let lastPage = '';

function render() {
  const { page, params } = parseRoute();
  const name = PAGES[page] ? page : 'inicio';
  app.dataset.page = name;
  document.body.dataset.page = name;
  if (name === 'carrito') $('cart-btn').setAttribute('aria-current', 'page');
  else $('cart-btn').removeAttribute('aria-current');
  app.replaceChildren(PAGES[name](params));
  for (const a of document.querySelectorAll('.nav a')) {
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  document.title = `MN Technology · ${TITLES[name]}`;
  document.body.classList.remove('menu-open');
  $('menu-btn').setAttribute('aria-expanded', 'false');
  if (name !== lastPage) window.scrollTo(0, 0);
  lastPage = name;
}

window.addEventListener('hashchange', render);

$('menu-btn').addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  $('menu-btn').setAttribute('aria-expanded', String(open));
});

// Buscar desde la cabecera lleva al catálogo; estando en el catálogo filtra mientras se escribe.
$('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  q.blur();
  go('productos', { q: q.value.trim() });
});
q.addEventListener('input', () => {
  const { page, params } = parseRoute();
  if (page !== 'productos') return;
  history.replaceState(null, '', hashFor('productos', { categoria: params.get('categoria'), marca: params.get('marca'), q: q.value.trim() }));
  render();
});

currency.addEventListener('change', () => {
  try { localStorage.setItem('moneda', currency.value); } catch {}
  render();
});

async function load() {
  render();
  const estadoPedidos = fetch('/api/pedido', { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { pedidosOnline = d?.activo === true; })
    .catch(() => {});
  try {
    const res = await fetch('/api/stock', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    items = await res.json();
  } catch {
    loadError = true;
  }
  await estadoPedidos;
  buildBrandNames();
  if (!loadError) syncCart();
  fillFooter();
  render();
  if (sharedCode && !loadError) {
    const item = items.find((it) => it.codigo === sharedCode);
    if (item) showDetail(item);
    else toast('Ese producto ya no está disponible. Mira otros parecidos en el catálogo.');
  }
}

saveCart();
setupChat();
load();
