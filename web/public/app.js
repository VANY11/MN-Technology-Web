import { icon, iconFor } from './icons.js';
import { STORE } from './config.js';
import { revisarCliente, PREFIJOS_CELULAR } from './datos-cliente.js';
import { aplicarPromos, etiquetaPromo, enLugar } from './promos.js';
import { indice, puntaje } from './buscar.js';
import { iniciarEfectos, volarAlCarrito, celebrarEnFicha } from './efectos.js';

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
// Buscador del catálogo: va en la cabecera de Productos (pageProducts); en el inicio está el buscador grande. La
// cabecera de la página ya no lleva buscador (Yvan, 2026-10-19).
const searchForm = document.createElement('form');
searchForm.className = 'search shop-search';
searchForm.id = 'search-form';
searchForm.setAttribute('role', 'search');
searchForm.innerHTML = '<label class="sr-only" for="q">Buscar productos</label>'
  + '<svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
  + '<input id="q" type="search" placeholder="Busca en el catálogo: producto, marca o modelo…" autocomplete="off">';
const q = searchForm.querySelector('input');
const currency = $('currency');
const detail = $('detail');

let items = [];
let promos = [];
// Orden de las categorías que Yvan arma en MN Tech: nombre → { orden (fijada) | null, vendidas en 30 días }.
let ordenCats = new Map();
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
// Precio de antes (tachado) de un producto en oferta.
const wasText = (item, key = currency.value) => {
  const value = item.antes?.[key];
  return value === null || value === undefined ? null : FORMATS[key].format(value);
};
function promoBadge(box, item) {
  const tag = etiquetaPromo(item);
  if (tag) box.append(el('span', 'promo-badge', tag));
}
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

// «Mundos MN»: los cuatro de los íconos del logo. Cada uno junta las categorías cuyo nombre encaja.
const MUNDOS = [
  { id: 'telefonia', nombre: 'Telefonía', texto: 'Celulares, forros, vidrios y cargadores', icono: 'phone', re: /telefon|celular|iphone|smartphone|vidrio|forro|cargador/ },
  { id: 'gaming', nombre: 'Gaming', texto: 'Consolas, controles y accesorios', icono: 'gaming', re: /gam(er|ing)|consola|videojueg|control/ },
  { id: 'seguridad', nombre: 'Seguridad', texto: 'Cámaras y videovigilancia', icono: 'camera', re: /camara|videovigil|seguridad|dvr|nvr/ },
  { id: 'audio', nombre: 'Audio', texto: 'Audífonos, cornetas y más', icono: 'audio', re: /audio|audifono|auricular|corneta|parlante|bocina/ },
];
const mundoDe = (item) => MUNDOS.find((m) => m.re.test(normalize(item.categoria))) || null;

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
// Categorías en el orden de MN Tech: primero las fijadas por su número, después las que más se venden y, a igual
// venta (o sin datos del servidor), las que tienen más productos. «Otros» siempre al final.
const categoriasEnOrden = (counts) => {
  const info = (c) => ordenCats.get(c) || { orden: null, vendidas: 0 };
  return [...counts.keys()].sort((a, b) => {
    if (a === OTHERS || b === OTHERS) return a === OTHERS ? 1 : -1;
    const x = info(a), y = info(b);
    if ((x.orden === null) !== (y.orden === null)) return x.orden === null ? 1 : -1;
    return (x.orden ?? 0) - (y.orden ?? 0) || y.vendidas - x.vendidas || counts.get(b) - counts.get(a) || String(a).localeCompare(String(b), 'es');
  });
};

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

// Meta Pixel (pixel.js): eventos de la tienda para los anuncios. Solo productos y montos,
// nunca datos del cliente. Si el pixel no cargó (bloqueador de anuncios), no pasa nada.
function pixel(evento, lines, cur = currency.value) {
  if (typeof window.fbq !== 'function') return;
  const precio = hasPrice(lines[0][0], cur) ? cur : 'precio';
  try {
    window.fbq('track', evento, {
      content_ids: lines.map(([it]) => it.codigo),
      contents: lines.map(([it, n]) => ({ id: it.codigo, quantity: n })),
      content_type: 'product',
      num_items: lines.reduce((s, [, n]) => s + n, 0),
      value: Math.round(orderTotal(lines, precio) * 100) / 100,
      currency: CURRENCY_CODES[precio],
    });
  } catch {}
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

// from: el botón que se pulsó, para que la foto vuele de ahí al carrito.
function addToCart(item, from) {
  const before = order.get(item.codigo) || 0;
  const now = setQty(item, before + 1);
  if (now === before) toast(`Ya tienes todas las unidades disponibles (${number.format(item.disponible)})`, ['Ver carrito', '#/carrito']);
  else {
    pixel('AddToCart', [[item, 1]]);
    volarAlCarrito(from);
    toast(`Agregado: ${item.nombre}`, ['Ver carrito', '#/carrito']);
  }
}

function addButton(item, className = 'btn add-btn') {
  const btn = el('button', className);
  btn.type = 'button';
  btn.setAttribute('aria-label', `Agregar ${item.nombre} al carrito`);
  btn.title = 'Agregar al carrito';
  btn.append(icon('cart', 'ico'));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    addToCart(item, btn);
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
  promoBadge(photo, item);
  li.append(photo);

  const body = el('div', 'body');
  body.append(el('h3', 'name', item.nombre));
  if (item.codigo) body.append(el('p', 'code-line', `Código: ${item.codigo}`));
  const specs = specList(item).slice(0, 2).map((s) => `${s.campo}: ${s.valor}`);
  if (specs.length) body.append(el('p', 'spec-line', specs.join(' · ')));
  const [label, kind] = stockBadge(item.disponible);
  body.append(withIcon(el('span', `badge ${kind}`, label), 'box'));
  const price = priceText(item);
  const priceEl = price ? el('p', 'price', price) : el('p', 'price none', 'Consultar precio');
  if (price && wasText(item)) priceEl.append(el('s', 'was', wasText(item)));
  body.append(priceEl);
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
  promoBadge(photo, item);
  const info = el('div', 'mini-info');
  info.append(el('span', 'mini-cat', categoryOf(item)), el('span', 'mini-name', item.nombre));
  if (item.codigo) info.append(el('span', 'mini-code', `Código: ${item.codigo}`));
  const price = el('span', 'mini-price', priceText(item) || 'Consultar precio');
  if (wasText(item)) price.append(el('s', 'was', wasText(item)));
  info.append(price);
  btn.append(photo, info);
  li.append(btn);
  return li;
}

// Tarjeta de una promoción que no es un solo producto: una marca o categoría (lleva a sus productos)
// o un aviso / servicio (solo informa, con el logo de MN Tech).
function promoMiniCard(p) {
  const li = el('li', 'mini');
  const list = p.tipo === 'aviso' ? [] : promoItems(p);
  if (p.tipo !== 'aviso' && !list.length) return null;
  const muestra = list.find((x) => safePhoto(x.foto)) || list[0];
  const box = p.tipo === 'aviso'
    ? el('div', 'mini-btn mini-static')
    : link(p.tipo === 'marca' ? productsHref({ marca: brandKey(muestra) }) : productsHref({ categoria: [...new Set(list.map((x) => x.categoria))].length === 1 ? muestra.categoria : p.categoria }), 'mini-btn');
  const photo = el('div', 'mini-photo');
  if (muestra) photoInto(photo, muestra);
  else {
    const img = el('img', 'mini-logo');
    img.src = '/logo-mn.png';
    img.alt = '';
    photo.append(img);
  }
  if (p.etiqueta) photo.append(el('span', 'promo-badge', p.etiqueta));
  const info = el('div', 'mini-info');
  info.append(el('span', 'mini-cat', p.tipo === 'aviso' ? 'Servicio' : p.tipo === 'marca' ? 'Marca' : 'Categoría'), el('span', 'mini-name', p.titulo));
  if (p.texto) info.append(el('span', 'mini-text', p.texto));
  if (list.length) info.append(el('span', 'mini-price', plural(list.length, 'producto', 'productos')));
  box.append(photo, info);
  li.append(box);
  return li;
}

// Las tarjetas de una sección de la portada armada con promociones ('destacados' o 'nuevos'), en su orden.
function promoCards(lugar) {
  const out = [];
  const used = new Set();
  for (const p of promos.filter((x) => enLugar(x, lugar))) {
    if (p.tipo === 'producto') {
      const it = items.find((x) => x.codigo === p.producto && x.disponible > 0);
      if (it && !used.has(it)) { used.add(it); out.push(miniCard(it)); }
    } else if (lugar === 'nuevos' || p.tipo === 'aviso') {
      const card = promoMiniCard(p);
      if (card) out.push(card);
    } else {
      for (const it of promoItems(p)) {
        if (used.has(it)) continue;
        used.add(it);
        out.push(miniCard(it));
      }
    }
  }
  return { cards: out, used };
}

// Fila deslizable con flechas (Destacados, Nuevos).
function carouselSection(title, cards, subtitle) {
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
  const titles = el('div');
  titles.append(el('h2', null, title));
  if (subtitle) titles.append(el('p', 'muted section-sub', subtitle));
  h.append(titles, arrows);
  row.append(...cards);
  sec.append(h, row);
  return sec;
}

/* ---------- Detalle ---------- */

function showDetail(item) {
  pixel('ViewContent', [[item, 1]]);
  photoInto($('detail-photo'), item);
  promoBadge($('detail-photo'), item);
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
      const dd = el('dd', null, t);
      if (wasText(item, k)) dd.append(el('s', 'was', wasText(item, k)));
      div.append(el('dt', null, CURRENCY_NAMES[k]), dd);
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
    const before = order.get(item.codigo) || 0;
    if (setQty(item, before + 1) > before) celebrarEnFicha(add);
    addLabel();
    if (parseRoute().page === 'carrito') render();
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

/* ---------- Vitrina en vivo (portada) ---------- */

const SHOWCASE_SIZE = 8;
const SHOWCASE_MS = 6000;
let showcaseTimer = 0;

// Los equipos de la vitrina: con foto y precio; si hay pocos, se completa con los de más existencias.
// El orden cambia en cada visita para que la portada se vea viva.
function showcaseItems() {
  const priced = items.filter((it) => it.disponible > 0 && hasPrice(it, 'precio'));
  const withPhoto = priced.filter((it) => safePhoto(it.foto)).sort(() => Math.random() - 0.5);
  const rest = priced.filter((it) => !safePhoto(it.foto)).sort((a, b) => b.disponible - a.disponible);
  return [...withPhoto, ...rest].slice(0, SHOWCASE_SIZE);
}

// Lo que gira en la vitrina: primero las promociones de MN Tech (en su orden), después los equipos.
//   { it, promo? }           un producto (con su oferta si la tiene)
//   { promo, muestra, n, href } una marca o categoría en oferta, con la foto de uno de sus productos
//   { promo }                 un aviso informativo
function showcaseSlides() {
  const slides = [];
  const used = new Set();
  // «Destacados» ya no tiene sección propia (Yvan, 2026-10-19: ya están arriba): lo marcado así sale en la vitrina.
  for (const p of promos.filter((x) => enLugar(x, 'vitrina') || enLugar(x, 'destacados'))) {
    if (p.tipo === 'producto') {
      const it = items.find((x) => x.codigo === p.producto && x.disponible > 0);
      if (it && !used.has(it)) { used.add(it); slides.push({ it, promo: p }); }
    } else if (p.tipo === 'marca' || p.tipo === 'categoria') {
      const list = promoItems(p);
      if (!list.length) continue;
      const muestra = list.find((x) => safePhoto(x.foto)) || list[0];
      const cats = [...new Set(list.map((x) => x.categoria))];
      const href = p.tipo === 'marca' ? productsHref({ marca: brandKey(muestra) }) : productsHref({ categoria: cats.length === 1 ? cats[0] : p.categoria });
      slides.push({ promo: p, muestra, n: list.length, href });
    } else if (p.tipo === 'aviso') slides.push({ promo: p });
  }
  for (const it of showcaseItems()) {
    if (slides.length >= SHOWCASE_SIZE) break;
    if (!used.has(it)) slides.push({ it, promo: it.promo || null });
  }
  return slides;
}

// Los productos con existencias a los que aplica una promoción de marca o categoría.
const promoItems = (p) => items.filter((x) => x.disponible > 0 && x.promo === p);

function slidePhoto(box, slide) {
  if (slide.it || slide.muestra) {
    photoInto(box, slide.it || slide.muestra);
    if (slide.it) promoBadge(box, slide.it);
  } else {
    // Aviso: el logo de MN Tech en la vitrina.
    const img = el('img', 'sc-logo');
    img.src = '/logo-mn.png';
    img.alt = 'MN Technology';
    box.replaceChildren(img);
  }
}

function urgency(n) {
  if (n === 1) return ['¡Última unidad!', 'hot'];
  if (n <= LOW_STOCK) return [`¡Quedan ${n}!`, 'hot'];
  return [`${number.format(n)} disponibles`, 'ok'];
}

// Diapositiva de un producto: precio (y el de antes si está en oferta), cuántos quedan y botones.
function productSlide(it, promo) {
  const tags = el('div', 'sc-tags');
  tags.append(
    it.antes ? el('span', 'sc-live sc-offer', 'Oferta') : el('span', 'sc-live', 'En vitrina'),
    el('span', 'sc-cat', [brandKey(it) && brandName(brandKey(it)), categoryOf(it)].filter(Boolean).join(' · ')),
  );
  const out = [tags, el('h1', 'sc-name', it.nombre)];
  if (promo && (promo.tipo === 'producto' || promo.texto)) {
    const p = el('p', 'sc-promo', promo.tipo === 'producto' ? promo.titulo : promo.texto);
    if (promo.tipo === 'producto' && promo.texto) p.append(el('span', null, promo.texto));
    out.push(p);
  }
  const prices = el('div', 'sc-prices');
  const main = currency.value;
  const others = Object.keys(FORMATS).filter((k) => k !== main && hasPrice(it, k));
  const big = el('span', 'sc-price-row');
  big.append(el('span', 'sc-price', priceText(it, main) || priceText(it, 'precio')));
  const was = wasText(it, main) || wasText(it, 'precio');
  if (was) big.append(el('s', 'sc-was', was));
  prices.append(big);
  if (others.length) prices.append(el('span', 'sc-alt', others.map((k) => priceText(it, k)).join('  ·  ')));
  const [label, kind] = urgency(it.disponible);
  const stock = withIcon(el('span', `sc-stock ${kind}`, label), 'box');
  const actions = el('div', 'sc-actions');
  const see = withIcon(el('button', 'btn btn-light', 'Ver detalles'), 'arrow', true);
  see.type = 'button';
  see.addEventListener('click', () => showDetail(it));
  const add = withIcon(el('button', 'btn btn-ghost-light', 'Agregar'), 'cart');
  add.type = 'button';
  add.addEventListener('click', () => addToCart(it, add));
  const share = shareButton(it);
  share.classList.add('sc-share');
  actions.append(see, add, share);
  out.push(prices, stock, actions);
  return out;
}

// Diapositiva de una marca o categoría en oferta, o de un aviso.
function promoSlide({ promo, n, href }) {
  const tags = el('div', 'sc-tags');
  tags.append(el('span', `sc-live ${promo.tipo === 'aviso' ? 'sc-notice' : 'sc-offer'}`, promo.tipo === 'aviso' ? 'Aviso' : 'Promoción'));
  if (promo.etiqueta) tags.append(el('span', 'promo-chip', promo.etiqueta));
  else if (promo.porcentaje) tags.append(el('span', 'promo-chip', `-${promo.porcentaje}%`));
  const out = [tags, el('h1', 'sc-name', promo.titulo)];
  if (promo.texto) out.push(el('p', 'sc-text', promo.texto));
  if (href) {
    out.push(withIcon(el('span', 'sc-stock ok', `${plural(n, 'producto', 'productos')} en oferta`), 'tag'));
    const actions = el('div', 'sc-actions');
    actions.append(withIcon(link(href, 'btn btn-light', 'Ver productos'), 'arrow', true));
    out.push(actions);
  }
  return out;
}

function showcase() {
  clearInterval(showcaseTimer);
  const list = showcaseSlides();
  const sec = el('section', 'showcase');
  sec.setAttribute('aria-roledescription', 'carrusel');
  sec.setAttribute('aria-label', 'Vitrina');
  if (!list.length) {
    const inner = el('div', 'showcase-inner wrap showcase-empty');
    const txt = el('div', 'sc-info');
    txt.append(el('span', 'sc-live', 'En vitrina'), el('h1', 'sc-name', loadError ? 'MN Technology' : 'Cargando la vitrina…'));
    if (loadError) txt.append(withIcon(link('#/productos', 'btn btn-light', 'Ver catálogo'), 'arrow', true));
    inner.append(txt);
    sec.append(inner);
    return sec;
  }

  const inner = el('div', 'showcase-inner wrap');
  const stage = el('div', 'sc-stage');
  const photo = el('div', 'sc-photo');
  stage.append(photo);
  const info = el('div', 'sc-info');
  info.setAttribute('aria-live', 'polite');
  const thumbs = el('ul', 'sc-thumbs');
  const bar = el('div', 'sc-progress');
  const fill = el('span');
  bar.append(fill);
  let index = 0;

  const show = (i) => {
    index = (i + list.length) % list.length;
    const slide = list[index];
    photo.classList.remove('sc-in');
    void photo.offsetWidth; // reinicia la animación de entrada
    photo.classList.add('sc-in');
    slidePhoto(photo, slide);
    info.replaceChildren(...(slide.it ? productSlide(slide.it, slide.promo) : promoSlide(slide)));
    for (const [j, b] of [...thumbs.children].entries()) b.firstChild.setAttribute('aria-current', String(j === index));
    fill.style.animation = 'none';
    void fill.offsetWidth;
    fill.style.animation = '';
  };

  list.forEach((slide, j) => {
    const li = el('li');
    const b = el('button', 'sc-thumb');
    b.type = 'button';
    b.setAttribute('aria-label', slide.it ? slide.it.nombre : slide.promo.titulo);
    const ph = el('span', 'sc-thumb-photo');
    if (slide.it || slide.muestra) photoInto(ph, slide.it || slide.muestra);
    else ph.append(icon('tag', 'placeholder'));
    b.append(ph);
    b.addEventListener('click', () => { show(j); restart(); });
    li.append(b);
    thumbs.append(li);
  });

  const arrows = el('div', 'sc-arrows');
  for (const [key, dir, label] of [['left', -1, 'Anterior'], ['right', 1, 'Siguiente']]) {
    const b = el('button', 'sc-arrow');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.append(icon(key));
    b.addEventListener('click', () => { show(index + dir); restart(); });
    arrows.append(b);
  }

  // Rota sola; se detiene con el ratón encima, con el foco dentro o si la persona prefiere sin movimiento.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused = false;
  const tick = () => {
    if (!sec.isConnected) return clearInterval(showcaseTimer);
    if (!paused && !document.hidden && !detail.open) show(index + 1);
  };
  const restart = () => {
    clearInterval(showcaseTimer);
    if (!still && list.length > 1) showcaseTimer = setInterval(tick, SHOWCASE_MS);
  };
  const pause = (v) => { paused = v; sec.classList.toggle('paused', v); };
  sec.addEventListener('mouseenter', () => pause(true));
  sec.addEventListener('mouseleave', () => pause(false));
  sec.addEventListener('focusin', () => pause(true));
  sec.addEventListener('focusout', () => pause(false));
  if (still || list.length < 2) sec.classList.add('paused');
  sec.style.setProperty('--sc-ms', `${SHOWCASE_MS}ms`);

  const nav = el('div', 'sc-nav');
  nav.append(thumbs, arrows);
  inner.append(stage, info);
  sec.append(inner, el('div', 'wrap sc-bottom'));
  sec.lastChild.append(bar, nav);
  if (list.length < 2) sec.lastChild.hidden = true;
  show(0);
  restart();
  return sec;
}

/* ---------- Inicio ---------- */

// Buscador grande del inicio: busca mientras se escribe (con errores de ortografía incluidos), muestra las
// primeras coincidencias con foto y precio, sugiere categorías y lleva al catálogo completo.
function searchHero() {
  const sec = el('section', 'hero-search wrap');
  sec.setAttribute('aria-label', 'Buscar productos');
  const box = el('div', 'hs-box');
  box.append(el('h2', 'hs-title', '¿Qué estás buscando?'), el('p', 'hs-sub', 'Escribe el producto, la marca o el modelo. Te entendemos aunque lo escribas con errores.'));

  const form = el('form', 'hs-form');
  form.setAttribute('role', 'search');
  const field = el('div', 'hs-field');
  field.append(icon('search', 'hs-icon'));
  const input = el('input', 'hs-input');
  input.type = 'search';
  input.placeholder = 'Ej: audífonos bluetooth, forro A16, cargador tipo C…';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Buscar productos');
  input.setAttribute('aria-controls', 'hs-results');
  const go1 = withIcon(el('button', 'btn hs-go', 'Buscar'), 'arrow', true);
  go1.type = 'submit';
  field.append(input, go1);
  form.append(field);

  const results = el('ul', 'hs-results');
  results.id = 'hs-results';
  results.hidden = true;
  // Las categorías van justo debajo del buscador (pageHome): aquí solo el atajo al catálogo completo.
  const all = withIcon(link('#/productos', 'link-more hs-all', `Ver todo el catálogo (${number.format(items.length)} productos)`), 'arrow', true);

  const buscarAhora = () => {
    const t = input.value.trim();
    if (t.length < 2) { results.hidden = true; return; }
    const top = items
      .map((it) => [it, relevancia(it, t)])
      .filter(([, p]) => p > 0)
      .sort((a, b) => b[1] - a[1] || b[0].disponible - a[0].disponible)
      .slice(0, 6);
    const lis = top.map(([it]) => {
      const li = el('li');
      const b = el('button', 'hs-item');
      b.type = 'button';
      const ph = el('span', 'hs-photo');
      photoInto(ph, it);
      const info = el('span', 'hs-info');
      info.append(el('span', 'hs-name', it.nombre), el('span', 'hs-cat', categoryOf(it)));
      b.append(ph, info, el('span', 'hs-price', priceText(it) || 'Consultar'));
      b.addEventListener('click', () => showDetail(it));
      li.append(b);
      return li;
    });
    const total = items.filter((it) => relevancia(it, t) > 0).length;
    const ver = el('li', 'hs-more');
    ver.append(total
      ? withIcon(link(productsHref({ q: t }), 'link-more', `Ver los ${number.format(total)} resultados`), 'arrow', true)
      : el('span', 'muted', `No encontramos «${t}». Prueba con otra palabra o mira el catálogo completo.`));
    results.replaceChildren(...lis, ver);
    results.hidden = false;
  };
  let espera = 0;
  input.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(buscarAhora, 120); });
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) buscarAhora(); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    go('productos', { q: input.value.trim() });
  });
  document.addEventListener('click', (e) => { if (!sec.contains(e.target)) results.hidden = true; });

  box.append(form, results, all);
  sec.append(box);
  return sec;
}

function pageHome() {
  const frag = document.createDocumentFragment();
  const catCounts = countBy(items, (it) => it.categoria);
  const topCats = categoriasEnOrden(catCounts);

  // Portada: la vitrina en vivo.
  frag.append(showcase());

  frag.append(searchHero());

  // Categorías justo debajo del buscador, en el orden de MN Tech.
  const catSec = el('section', 'section wrap home-cats');
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

  // Nuevos: lo que Yvan marca en MN Tech como recién llegado o servicio nuevo.
  const nuevos = promoCards('nuevos').cards;
  if (nuevos.length) frag.append(carouselSection('Nuevo en MN Tech', nuevos, 'Recién llegados, reposiciones y servicios nuevos'));


  return frag;
}

/* ---------- Productos ---------- */

// Búsqueda tolerante a errores (buscar.js): el índice de cada producto se arma una vez.
const indices = new WeakMap();
const indiceDe = (it) => {
  if (!indices.has(it)) indices.set(it, indice([it.nombre, it.marca, it.modelo, it.codigo, it.categoria, ...specList(it).map((x) => x.valor)]));
  return indices.get(it);
};
const relevancia = (it, term) => puntaje(indiceDe(it), term);

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
  const mundo = category ? null : MUNDOS.find((m) => m.id === params.get('mundo')) || null;
  // Al cambiar de categoría o marca se reinician los filtros finos y la paginación.
  const key = `${category}|${brand}|${term}|${mundo?.id || ''}`;
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
  titles.append(el('h1', null, category || (brand ? brandName(brand) : mundo ? mundo.nombre : 'Productos')), count);
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
  head.append(titles, searchForm, tools);

  const grid = el('ul', 'grid');
  const status = el('p', 'status');
  const more = el('button', 'btn btn-outline');
  more.type = 'button';
  more.addEventListener('click', () => { limit += PAGE; draw(); });
  const moreWrap = el('div', 'more-wrap');
  moreWrap.append(more);
  main.append(head, status, grid, moreWrap);

  function draw() {
    const scores = new Map();
    const searched = items.filter((it) => {
      if (mundo && mundoDe(it) !== mundo) return false;
      if (!term.trim()) return true;
      const p = relevancia(it, term);
      if (p) scores.set(it, p);
      return p > 0;
    });
    const inCategory = category ? searched.filter((it) => categoryOf(it) === category) : searched;
    const inBrand = brand ? inCategory.filter((it) => brandKey(it) === brand) : inCategory;
    // Con una búsqueda y el orden por defecto, primero lo que mejor coincide.
    const byScore = term.trim() && sortBy === 'nombre' ? (a, b) => scores.get(b) - scores.get(a) || SORTS.nombre(a, b) : SORTS[sortBy];
    const shown = inBrand.filter(matchesSpecs).sort(byScore);

    const sideHead = el('div', 'fhead');
    sideHead.append(withIcon(el('strong', null, 'Filtros'), 'filter'));
    if (category || brand || mundo || [...specFilters.values()].some((v) => v.size)) {
      const clear = el('button', 'link-more', 'Limpiar');
      clear.type = 'button';
      clear.addEventListener('click', () => { specFilters = new Map(); go('productos', { q: term }); });
      sideHead.append(clear);
    }
    const catCounts = countBy(searched, categoryOf);
    const catEntries = [
      ['', 'Todas', searched.length, 'grid'],
      ...categoriasEnOrden(catCounts).map((c) => [c, c, catCounts.get(c), c === OTHERS ? 'box' : iconFor(c)]),
    ];
    const groups = [sideHead, filterGroup('Categorías', catEntries, (v) => v === category, (v) => go('productos', { categoria: v, q: term }))];
    // Marcas y demás filtros solo después de elegir una categoría (y según ella).
    const brandCounts = countBy(inCategory, brandKey);
    if ((category || brand) && brandCounts.size) {
      const entries = byCountDesc(brandCounts).map((k) => [k, brandName(k), brandCounts.get(k)]);
      groups.push(
        filterGroup('Marca', entries, (v) => v === brand, (v) => go('productos', { categoria: category, marca: v === brand ? '' : v, mundo: mundo?.id, q: term }), 10),
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

/* ---------- Pedido ---------- */

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
    out.push(`Cédula: ${datos.cedula}`);
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
    btns.append(withIcon(link('#/productos', 'btn', 'Ver productos'), 'arrow', true));
    empty.append(ic, el('h2', null, 'Tu carrito está vacío'), el('p', 'muted', 'Agrega productos desde el catálogo.'), btns);
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
  // Datos guardados antes del apellido aparte: «Ana Pérez» se reparte en los dos campos.
  let [savedNombre, savedApellido] = [client.nombre || '', client.apellido || ''];
  if (!client.apellido && savedNombre.includes(' ')) [savedNombre, savedApellido] = [savedNombre.slice(0, savedNombre.indexOf(' ')), savedNombre.slice(savedNombre.indexOf(' ') + 1)];
  const nombre = input({ required: true, placeholder: 'Ej. María', autocomplete: 'given-name', maxLength: 40, value: savedNombre });
  const apellido = input({ required: true, placeholder: 'Ej. González', autocomplete: 'family-name', maxLength: 40, value: savedApellido });
  const cedula = input({ required: true, placeholder: 'Ej. V12345678', autocomplete: 'off', maxLength: 20, value: client.cedula || '' });
  // Celular: prefijo en una lista y los 7 dígitos aparte.
  const [savedPrefijo, savedNumero] = /^(0\d{3})-?(\d{7})$/.test(client.telefono || '') ? [client.telefono.slice(0, 4), client.telefono.replace(/\D/g, '').slice(4)] : ['', ''];
  const prefijo = el('select', 'phone-prefix');
  prefijo.setAttribute('aria-label', 'Prefijo del celular');
  const sinPrefijo = el('option', null, 'Prefijo');
  sinPrefijo.value = '';
  sinPrefijo.disabled = true;
  prefijo.append(sinPrefijo, ...PREFIJOS_CELULAR.map((p) => { const o = el('option', null, p); o.value = p; return o; }));
  prefijo.value = PREFIJOS_CELULAR.includes(savedPrefijo) ? savedPrefijo : '';
  const telefono = input({ required: true, type: 'tel', inputMode: 'numeric', placeholder: '1234567', autocomplete: 'off', maxLength: 16, value: savedNumero });
  telefono.setAttribute('aria-label', 'Número del celular, 7 dígitos');
  // Si pegan el número completo (04141234567 o +58 414…), se reparte entre la lista y el campo.
  telefono.addEventListener('input', () => {
    let d = telefono.value.replace(/\D/g, '');
    if (d.startsWith('58') && d.length >= 12) d = `0${d.slice(2)}`;
    if (d.length >= 10 && !d.startsWith('0')) d = `0${d}`;
    if (d.length === 11 && PREFIJOS_CELULAR.includes(d.slice(0, 4))) {
      prefijo.value = d.slice(0, 4);
      telefono.value = d.slice(4);
    }
  });
  prefijo.addEventListener('change', () => telefono.dispatchEvent(new Event('input')));
  const controls = { nombre, apellido, cedula, telefono };
  const hints = {};
  const withHint = (label, k) => {
    let f;
    if (k === 'telefono') {
      // Dos controles: un <div> en vez de <label>, cada uno con su propio nombre accesible.
      f = el('div', 'field');
      const row = el('div', 'phone-row');
      row.append(prefijo, telefono);
      f.append(el('span', null, label), row);
    } else f = field(label, controls[k]);
    hints[k] = el('small', 'field-error');
    hints[k].hidden = true;
    hints[k].id = `pedido-${k}-error`;
    controls[k].setAttribute('aria-describedby', hints[k].id);
    f.append(hints[k]);
    return f;
  };
  const showErrors = (errores = {}) => {
    for (const [k, c] of Object.entries(controls)) {
      const msg = errores[k] || '';
      c.setCustomValidity(msg);
      c.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (k === 'telefono') prefijo.setAttribute('aria-invalid', msg && !prefijo.value ? 'true' : 'false');
      hints[k].textContent = msg;
      hints[k].hidden = !msg;
    }
  };
  // Al corregir un campo se quita su aviso.
  for (const [k, c] of Object.entries(controls)) {
    c.addEventListener('input', () => {
      c.setCustomValidity('');
      c.removeAttribute('aria-invalid');
      if (k === 'telefono') prefijo.removeAttribute('aria-invalid');
      hints[k].hidden = true;
    });
  }
  const pairName = el('div', 'two');
  pairName.append(withHint('Nombre *', 'nombre'), withHint('Apellido *', 'apellido'));
  form.append(pairName, withHint('Cédula *', 'cedula'), withHint('Celular *', 'telefono'), el('p', 'small muted form-note', 'Todos los datos son obligatorios.'));

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

  form.noValidate = true;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const revision = revisarCliente({ nombre: nombre.value, apellido: apellido.value, cedula: cedula.value, telefono: `${prefijo.value}${telefono.value}` });
    if (!prefijo.value) revision.errores = { ...revision.errores, telefono: 'Elige el prefijo de tu celular.' };
    showErrors(revision.errores);
    if (revision.errores) {
      const first = Object.keys(revision.errores)[0];
      (first === 'telefono' && !prefijo.value ? prefijo : controls[first]).focus();
      return;
    }
    if (!form.checkValidity()) return form.reportValidity();
    const cli = revision.datos;
    for (const k of ['nombre', 'apellido', 'cedula']) controls[k].value = cli[k];
    telefono.value = cli.telefono.slice(5);
    const datos = {
      numero: orderNumber(),
      nombre: `${cli.nombre} ${cli.apellido}`,
      nombrePila: cli.nombre,
      apellido: cli.apellido,
      telefono: cli.telefono,
      cedula: cli.cedula,
      entrega,
      direccion: dirField.hidden ? '' : direccion.value.trim(),
      pago: pago ? pago.value : '',
      notas: notas.value.trim(),
    };
    try { localStorage.setItem('cliente', JSON.stringify({ nombre: cli.nombre, apellido: cli.apellido, telefono: cli.telefono, cedula: cli.cedula })); } catch {}
    if (online) return sendOrder(datos);
    const enviados = orderLines();
    if (enviados.length) pixel('Lead', enviados);
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
          nombre: datos.nombrePila, apellido: datos.apellido, telefono: datos.telefono, cedula: datos.cedula, entrega: datos.entrega, direccion: datos.direccion,
          pago: datos.pago, notas: datos.notas, moneda: CURRENCY_CODES[cur], sitio: trap.value,
          items: lines.map(([it, n]) => ({ codigo: it.codigo, cantidad: n })),
        }),
      });
      data = await res.json().catch(() => null);
    } catch {}
    if (res?.status === 201 && data?.numero) {
      if (lines.length) pixel('Purchase', lines, cur);
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
    if (res?.status === 400 && data?.campos && typeof data.campos === 'object') showErrors(data.campos);
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
    ...categoriasEnOrden(counts).slice(0, 6).map((c) => {
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

const PAGES = { inicio: pageHome, productos: pageProducts, carrito: pageCart, nosotros: pageAbout, contacto: pageContact };
const TITLES = { inicio: 'Tienda de tecnología', productos: 'Productos', carrito: 'Carrito', nosotros: 'Nosotros', contacto: 'Contacto' };
let lastPage = '';

function render() {
  // La lista de precios ya no existe: sus enlaces viejos llevan al catálogo.
  if (parseRoute().page === 'precios') history.replaceState(null, '', '#/productos');
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

// Buscar en el catálogo filtra mientras se escribe; Enter quita el foco (en el teléfono cierra el teclado).
searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  q.blur();
  go('productos', { q: q.value.trim() });
});
q.addEventListener('input', () => {
  const { page, params } = parseRoute();
  if (page !== 'productos') return;
  history.replaceState(null, '', hashFor('productos', { categoria: params.get('categoria'), marca: params.get('marca'), q: q.value.trim() }));
  // El buscador va dentro de la página que se vuelve a dibujar: se le devuelve el foco y el cursor.
  const [a, b] = [q.selectionStart, q.selectionEnd];
  render();
  q.focus({ preventScroll: true });
  try { q.setSelectionRange(a, b); } catch {}
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
  // Sin promociones (o si fallan) la tienda funciona igual.
  const cargaPromos = fetch('/api/promociones', { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : []))
    .then((d) => { promos = Array.isArray(d) ? d : []; })
    .catch(() => {});
  const cargaOrden = fetch('/api/categorias', { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : []))
    .then((d) => {
      ordenCats = new Map((Array.isArray(d) ? d : [])
        .filter((c) => c && typeof c.nombre === 'string')
        .map((c) => [c.nombre, { orden: Number.isInteger(c.orden) ? c.orden : null, vendidas: Number(c.vendidas) || 0 }]));
    })
    .catch(() => {});
  try {
    const res = await fetch('/api/stock', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    items = await res.json();
  } catch {
    loadError = true;
  }
  await Promise.all([estadoPedidos, cargaPromos, cargaOrden]);
  aplicarPromos(items, promos);
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
iniciarEfectos(app);
load();
