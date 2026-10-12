import { icon, iconFor } from './icons.js';

const LOW_STOCK = 3;
const PAGE = 48;
const OTHERS = 'Otros';
const FORMATS = {
  precio: new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }),
  precio_ves: new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }),
  precio_cop: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }),
};
const CURRENCY_NAMES = { precio: 'Dólares (USD)', precio_ves: 'Bolívares (Bs.)', precio_cop: 'Pesos (COP)' };
const number = new Intl.NumberFormat('es-VE');

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const statusEl = $('status');
const q = $('q');
const currency = $('currency');
const sort = $('sort');
const catsNav = $('categories');
const more = $('more');
const detail = $('detail');

let items = [];
let category = '';
let limit = PAGE;

$('year').textContent = new Date().getFullYear();

// Preferencia de moneda de cada visitante (si el navegador no deja guardar, no pasa nada).
try {
  const saved = localStorage.getItem('moneda');
  if (saved && FORMATS[saved]) currency.value = saved;
} catch {}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Fotos públicas por https, o las del servidor que sirve /api/foto por el túnel.
const safePhoto = (url) =>
  typeof url === 'string' && (url.startsWith('https://') || url.startsWith('/api/foto/')) ? url : null;

const categoryOf = (item) => item.categoria || OTHERS;

function photoInto(box, item) {
  const src = safePhoto(item.foto);
  // Sin foto: el ícono de su categoría.
  const fallback = () => box.replaceChildren(icon(iconFor(item.categoria), 'placeholder'));
  if (!src) return fallback();
  const img = el('img');
  img.src = src;
  img.alt = item.nombre;
  img.loading = 'lazy';
  img.decoding = 'async';
  // Si la foto no carga (p. ej. el archivo ya no está en el servidor), se ve el ícono.
  img.addEventListener('error', fallback, { once: true });
  box.replaceChildren(img);
}

function stockLabel(n) {
  if (n <= LOW_STOCK) return [n === 1 ? 'Última unidad' : `Quedan ${n}`, 'low'];
  return ['Disponible', 'ok'];
}

const priceText = (item, key = currency.value) => {
  const value = item[key];
  return value === null || value === undefined ? null : FORMATS[key].format(value);
};

function specsOf(item) {
  return [item.ram && `RAM ${item.ram}`, item.almacenamiento, item.color].filter(Boolean);
}

function card(item) {
  const li = el('li', 'card');

  const open = el('button', 'card-link');
  open.type = 'button';
  open.setAttribute('aria-label', `Ver ${item.nombre}`);
  open.addEventListener('click', () => showDetail(item));

  const photo = el('div', 'photo');
  photoInto(photo, item);
  if (item.disponible <= LOW_STOCK) photo.append(el('span', 'badge', stockLabel(item.disponible)[0]));

  const body = el('div', 'body');
  body.append(el('p', 'cat', categoryOf(item)));
  body.append(el('h3', 'name', item.nombre));
  const meta = [item.marca, item.modelo].filter(Boolean).join(' · ');
  if (meta) body.append(el('p', 'meta', meta));

  const specs = specsOf(item);
  if (specs.length) {
    const chips = el('ul', 'chips');
    specs.forEach((s) => chips.append(el('li', null, s)));
    body.append(chips);
  }

  const row = el('div', 'row');
  const price = priceText(item);
  row.append(price ? el('span', 'price', price) : el('span', 'price none', 'Consultar precio'));
  const [label, kind] = stockLabel(item.disponible);
  row.append(el('span', `stock ${kind}`, label));
  body.append(row);

  li.append(photo, body, open);
  return li;
}

function showDetail(item) {
  photoInto($('detail-photo'), item);
  $('detail-cat').textContent = categoryOf(item);
  $('detail-name').textContent = item.nombre;
  $('detail-meta').textContent = [item.marca, item.modelo].filter(Boolean).join(' · ');

  const specs = specsOf(item);
  $('detail-specs').replaceChildren(...specs.map((s) => el('li', null, s)));

  // La moneda elegida primero, luego las otras que tengan precio.
  const keys = [currency.value, ...Object.keys(FORMATS).filter((k) => k !== currency.value)];
  const rows = keys
    .map((k) => [k, priceText(item, k)])
    .filter(([, text]) => text)
    .map(([k, text]) => {
      const div = el('div');
      div.append(el('dt', null, CURRENCY_NAMES[k]), el('dd', null, text));
      return div;
    });
  $('detail-prices').replaceChildren(...(rows.length ? rows : [el('p', 'meta', 'Consulta el precio con nosotros.')]));

  const [label, kind] = stockLabel(item.disponible);
  const stock = $('detail-stock');
  stock.className = `stock ${kind}`;
  stock.textContent = item.disponible > LOW_STOCK ? `${label} · ${item.disponible} unidades` : label;
  $('detail-code').textContent = item.codigo ? `Cód. ${item.codigo}` : '';

  if (typeof detail.showModal === 'function') detail.showModal();
}

detail.addEventListener('click', (e) => {
  // Cerrar con la X o tocando fuera de la ventana.
  if (e.target === detail || e.target.closest('[data-close]')) detail.close();
});

function countsByCategory() {
  const counts = new Map();
  for (const it of items) counts.set(categoryOf(it), (counts.get(categoryOf(it)) || 0) + 1);
  return counts;
}

function categoryButton(name, label, count) {
  const btn = el('button', 'cat-btn');
  btn.type = 'button';
  btn.dataset.cat = name;
  btn.setAttribute('aria-current', String(name === category));
  const dot = el('span', 'cat-dot');
  dot.append(icon(name === OTHERS ? 'box' : iconFor(name)));
  btn.append(dot);
  btn.append(el('span', 'cat-name', label));
  btn.append(el('span', 'cat-count', number.format(count)));
  btn.addEventListener('click', () => selectCategory(name));
  return btn;
}

function fillCategories() {
  const counts = countsByCategory();
  // Orden alfabético, con «Otros» (productos sin categoría) al final.
  const names = [...counts.keys()].sort((a, b) =>
    a === OTHERS ? 1 : b === OTHERS ? -1 : a.localeCompare(b, 'es', { sensitivity: 'base' }),
  );
  catsNav.replaceChildren(
    categoryButton('', 'Todos los productos', items.length),
    ...names.map((n) => categoryButton(n, n, counts.get(n))),
  );
  const fromUrl = new URLSearchParams(location.search).get('categoria');
  if (fromUrl && counts.has(fromUrl)) category = fromUrl;

  $('stat-products').textContent = number.format(items.length);
  $('stat-categories').textContent = number.format([...counts.keys()].filter((n) => n !== OTHERS).length);
  $('stat-units').textContent = number.format(items.reduce((sum, it) => sum + it.disponible, 0));
}

// La categoría elegida queda en la dirección (?categoria=...) para poder compartir el enlace.
function selectCategory(name) {
  category = name;
  limit = PAGE;
  const url = new URL(location.href);
  if (name) url.searchParams.set('categoria', name);
  else url.searchParams.delete('categoria');
  history.replaceState(null, '', url);
  render();
  const current = catsNav.querySelector('[aria-current="true"]');
  current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  if (window.matchMedia('(max-width: 900px)').matches) {
    document.querySelector('.content').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const SORTS = {
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
  'precio-asc': (a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity),
  'precio-desc': (a, b) => (b.precio ?? -Infinity) - (a.precio ?? -Infinity),
  stock: (a, b) => b.disponible - a.disponible,
};

function render() {
  for (const btn of catsNav.children) btn.setAttribute('aria-current', String(btn.dataset.cat === category));

  const terms = normalize(q.value.trim()).split(/\s+/).filter(Boolean);
  const shown = items
    .filter((it) => {
      if (category && categoryOf(it) !== category) return false;
      if (!terms.length) return true;
      const text = normalize([it.nombre, it.marca, it.modelo, it.codigo, it.categoria].filter(Boolean).join(' '));
      return terms.every((t) => text.includes(t));
    })
    .sort(SORTS[sort.value]);

  grid.replaceChildren(...shown.slice(0, limit).map(card));
  more.hidden = shown.length <= limit;
  more.textContent = `Ver más productos (${number.format(shown.length - limit)} restantes)`;

  $('view-title').textContent = category || 'Todos los productos';
  $('view-count').textContent = items.length
    ? `${number.format(shown.length)} ${shown.length === 1 ? 'producto' : 'productos'}${terms.length ? ` para «${q.value.trim()}»` : ''}`
    : '';

  if (!items.length) statusEl.textContent = 'Pronto publicaremos nuestro catálogo.';
  else if (!shown.length) statusEl.textContent = 'No encontramos productos con esa búsqueda.';
  else statusEl.textContent = '';
}

async function load() {
  try {
    const res = await fetch('/api/stock', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    items = await res.json();
    fillCategories();
    render();
  } catch {
    statusEl.textContent = 'No pudimos cargar el catálogo en este momento. Intenta de nuevo en unos minutos.';
  }
}

q.addEventListener('input', () => { limit = PAGE; render(); });
sort.addEventListener('change', () => { limit = PAGE; render(); });
currency.addEventListener('change', () => {
  try { localStorage.setItem('moneda', currency.value); } catch {}
  render();
});
more.addEventListener('click', () => { limit += PAGE; render(); });
load();
