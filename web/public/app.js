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

// Datos de contacto de la tienda. Lo que quede vacío no se muestra.
// whatsapp: número con código de país, solo dígitos (p. ej. '584121234567').
const CONTACT = {
  whatsapp: '',
  instagram: '', // usuario sin @
  direccion: '',
  horario: '',
};
const TILES = 8;

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const statusEl = $('status');
const q = $('q');
const currency = $('currency');
const sort = $('sort');
const catsNav = $('categories');
const more = $('more');
const detail = $('detail');
const filtersEl = $('filters');

let items = [];
let category = '';
let limit = PAGE;
// Filtros por especificación de la categoría elegida: nombre del campo → valores marcados.
let specFilters = new Map();

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

const specList = (item) => (Array.isArray(item.especificaciones) ? item.especificaciones : []);

// Chips de la tarjeta: RAM, almacenamiento y color, y luego las especificaciones de su categoría.
function specsOf(item) {
  const base = [item.ram && `RAM ${item.ram}`, item.almacenamiento, item.color].filter(Boolean);
  const extra = specList(item).map((s) => s.valor).filter((v) => !base.includes(v));
  return [...base, ...extra].slice(0, 4);
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

  const base = [item.ram && `RAM ${item.ram}`, item.almacenamiento, item.color].filter(Boolean);
  $('detail-specs').replaceChildren(...base.map((s) => el('li', null, s)));
  $('detail-spec-list').replaceChildren(
    ...specList(item).map((s) => {
      const div = el('div');
      div.append(el('dt', null, s.campo), el('dd', null, s.valor));
      return div;
    }),
  );

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

  const wa = $('detail-whatsapp');
  wa.hidden = !CONTACT.whatsapp;
  if (CONTACT.whatsapp) {
    const text = `Hola, me interesa: ${item.nombre}${item.codigo ? ` (${item.codigo})` : ''}`;
    wa.href = `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`;
  }

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

const sortedCategories = (counts) =>
  // Orden alfabético, con «Otros» (productos sin categoría) al final.
  [...counts.keys()].sort((a, b) =>
    a === OTHERS ? 1 : b === OTHERS ? -1 : a.localeCompare(b, 'es', { sensitivity: 'base' }),
  );

function tile(name, count) {
  const li = el('li');
  const btn = el('button', 'tile');
  btn.type = 'button';
  const badge = el('span', 'tile-icon');
  badge.append(icon(name === OTHERS ? 'box' : iconFor(name)));
  // Permite cortar «Cámaras/Videovigilancia» después de la barra.
  btn.append(badge, el('span', 'tile-name', name.replace(/\//g, '/\u200b')), el('span', 'tile-count', `${number.format(count)} ${count === 1 ? 'producto' : 'productos'}`));
  btn.addEventListener('click', () => selectCategory(name, true));
  li.append(btn);
  return li;
}

function fillCategories() {
  const counts = countsByCategory();
  const names = sortedCategories(counts);
  catsNav.replaceChildren(
    categoryButton('', 'Todos', items.length),
    ...names.map((n) => categoryButton(n, n, counts.get(n))),
  );
  const fromUrl = new URLSearchParams(location.search).get('categoria');
  if (fromUrl && counts.has(fromUrl)) category = fromUrl;

  // Tarjetas de categorías: primero las que tienen más productos.
  const byCount = names.filter((n) => n !== OTHERS).sort((a, b) => counts.get(b) - counts.get(a));
  const tiles = $('tiles');
  const allBtn = $('all-cats');
  const showTiles = (all) => {
    tiles.replaceChildren(...(all ? byCount : byCount.slice(0, TILES)).map((n) => tile(n, counts.get(n))));
    allBtn.hidden = byCount.length <= TILES;
    allBtn.textContent = all ? 'Ver menos' : `Ver todas (${byCount.length})`;
    allBtn.onclick = () => showTiles(!all);
  };
  showTiles(false);

  $('foot-cats').replaceChildren(
    ...byCount.slice(0, 6).map((n) => {
      const li = el('li');
      const a = el('a', null, n);
      a.href = `?categoria=${encodeURIComponent(n)}#catalogo`;
      a.addEventListener('click', (e) => { e.preventDefault(); selectCategory(n, true); });
      li.append(a);
      return li;
    }),
  );
  $('trust-count').textContent = `${number.format(items.length)} productos disponibles`;
}

// La categoría elegida queda en la dirección (?categoria=...) para poder compartir el enlace.
function selectCategory(name, scrollToCatalog = false) {
  category = name;
  limit = PAGE;
  specFilters = new Map();
  const url = new URL(location.href);
  if (name) url.searchParams.set('categoria', name);
  else url.searchParams.delete('categoria');
  history.replaceState(null, '', url);
  render();
  const current = catsNav.querySelector('[aria-current="true"]');
  current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  if (scrollToCatalog) $('catalogo').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const matchesSpecs = (item) => {
  for (const [campo, valores] of specFilters) {
    if (!valores.size) continue;
    const spec = specList(item).find((s) => s.campo === campo);
    if (!spec || !valores.has(spec.valor)) return false;
  }
  return true;
};

// Filtros de la categoría elegida, a partir de las especificaciones de sus productos.
// Solo campos con al menos dos valores distintos (con uno solo no hay nada que filtrar).
function renderFilters(inCategory) {
  if (!category) {
    filtersEl.hidden = true;
    filtersEl.replaceChildren();
    return;
  }
  const fields = new Map();
  for (const it of inCategory) {
    for (const { campo, valor } of specList(it)) {
      if (!fields.has(campo)) fields.set(campo, new Map());
      const values = fields.get(campo);
      values.set(valor, (values.get(valor) || 0) + 1);
    }
  }
  const groups = [];
  for (const [campo, values] of fields) {
    if (values.size < 2) continue;
    const group = el('div', 'filter-group');
    group.append(el('span', 'filter-label', campo));
    const pills = el('div', 'pills');
    const chosen = specFilters.get(campo) || new Set();
    [...values.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es', { numeric: true }))
      .slice(0, 30)
      .forEach(([valor, count]) => {
        const pill = el('button', 'pill');
        pill.type = 'button';
        pill.setAttribute('aria-pressed', String(chosen.has(valor)));
        pill.append(el('span', null, valor), el('span', 'pill-count', number.format(count)));
        pill.addEventListener('click', () => toggleFilter(campo, valor));
        pills.append(pill);
      });
    group.append(pills);
    groups.push(group);
  }
  const active = [...specFilters.values()].some((v) => v.size);
  if (active) {
    const clear = el('button', 'clear', 'Quitar filtros');
    clear.type = 'button';
    clear.addEventListener('click', () => { specFilters = new Map(); limit = PAGE; render(); });
    groups.push(clear);
  }
  filtersEl.replaceChildren(...groups);
  filtersEl.hidden = groups.length === 0;
}

function toggleFilter(campo, valor) {
  const set = specFilters.get(campo) || new Set();
  if (set.has(valor)) set.delete(valor);
  else set.add(valor);
  specFilters.set(campo, set);
  limit = PAGE;
  render();
}

const SORTS = {
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
  'precio-asc': (a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity),
  'precio-desc': (a, b) => (b.precio ?? -Infinity) - (a.precio ?? -Infinity),
  stock: (a, b) => b.disponible - a.disponible,
};

function render() {
  for (const btn of catsNav.children) btn.setAttribute('aria-current', String(btn.dataset.cat === category));

  const terms = normalize(q.value.trim()).split(/\s+/).filter(Boolean);
  const inCategory = category ? items.filter((it) => categoryOf(it) === category) : items;
  renderFilters(inCategory);
  const shown = inCategory
    .filter((it) => {
      if (!matchesSpecs(it)) return false;
      if (!terms.length) return true;
      const text = normalize(
        [it.nombre, it.marca, it.modelo, it.codigo, it.categoria, ...specList(it).map((x) => x.valor)].filter(Boolean).join(' '),
      );
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

function fillContact() {
  const rows = [
    CONTACT.whatsapp && ['WhatsApp', `+${CONTACT.whatsapp}`, `https://wa.me/${CONTACT.whatsapp}`],
    CONTACT.instagram && ['Instagram', `@${CONTACT.instagram}`, `https://instagram.com/${CONTACT.instagram}`],
    CONTACT.direccion && ['Dirección', CONTACT.direccion],
    CONTACT.horario && ['Horario', CONTACT.horario],
  ].filter(Boolean);
  if (!rows.length) return;
  $('contact-list').replaceChildren(
    ...rows.map(([label, text, href]) => {
      const li = el('li');
      li.append(el('span', 'foot-label', label));
      if (href) {
        const a = el('a', null, text);
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener';
        li.append(a);
      } else li.append(el('span', null, text));
      return li;
    }),
  );
  $('contacto').hidden = false;
  document.querySelector('.contact-link').hidden = false;
}

for (const node of document.querySelectorAll('.hero-art [data-icon]')) node.append(icon(node.dataset.icon));
fillContact();

// Al buscar desde arriba, mostrar los resultados.
q.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('catalogo').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
q.addEventListener('input', () => { limit = PAGE; render(); });
sort.addEventListener('change', () => { limit = PAGE; render(); });
currency.addEventListener('change', () => {
  try { localStorage.setItem('moneda', currency.value); } catch {}
  render();
});
more.addEventListener('click', () => { limit += PAGE; render(); });
load();
