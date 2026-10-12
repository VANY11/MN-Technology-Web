const LOW_STOCK = 3;
const FORMATS = {
  precio: new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }),
  precio_ves: new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }),
  precio_cop: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }),
};

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const statusEl = $('status');
const q = $('q');
const onlyStock = $('only-stock');
const currency = $('currency');
let items = [];

$('year').textContent = new Date().getFullYear();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Solo fotos públicas por https; una ruta del servidor local no se ve desde internet.
const safePhoto = (url) => (typeof url === 'string' && url.startsWith('https://') ? url : null);

function stockLabel(n) {
  if (n <= 0) return ['Agotado', 'out'];
  if (n <= LOW_STOCK) return [`Quedan ${n}`, 'low'];
  return ['Disponible', 'ok'];
}

function card(item) {
  const li = el('li', 'card');
  if (item.disponible <= 0) li.classList.add('is-out');

  const photo = el('div', 'photo');
  const src = safePhoto(item.foto);
  if (src) {
    const img = el('img');
    img.src = src;
    img.alt = item.nombre;
    img.loading = 'lazy';
    photo.append(img);
  } else {
    photo.textContent = (item.marca || item.nombre || '?').slice(0, 2).toUpperCase();
  }

  const body = el('div', 'body');
  body.append(el('h2', 'name', item.nombre));
  const meta = [item.marca, item.modelo].filter(Boolean).join(' · ');
  if (meta) body.append(el('p', 'meta', meta));

  const specs = [item.ram && `RAM ${item.ram}`, item.almacenamiento, item.color].filter(Boolean);
  if (specs.length) {
    const chips = el('ul', 'chips');
    specs.forEach((s) => chips.append(el('li', null, s)));
    body.append(chips);
  }

  const row = el('div', 'row');
  const value = item[currency.value];
  row.append(
    value === null || value === undefined
      ? el('span', 'price none', 'Consultar precio')
      : el('span', 'price', FORMATS[currency.value].format(value)),
  );
  const [label, kind] = stockLabel(item.disponible);
  row.append(el('span', `stock ${kind}`, label));
  body.append(row);

  li.append(photo, body);
  return li;
}

function render() {
  const term = q.value.trim().toLowerCase();
  const shown = items.filter((it) => {
    if (onlyStock.checked && it.disponible <= 0) return false;
    if (!term) return true;
    return [it.nombre, it.marca, it.modelo, it.codigo].some((v) => v && v.toLowerCase().includes(term));
  });
  grid.replaceChildren(...shown.map(card));
  if (!items.length) statusEl.textContent = 'Pronto publicaremos nuestro catálogo.';
  else if (!shown.length) statusEl.textContent = 'No hay productos que coincidan con la búsqueda.';
  else statusEl.textContent = '';
}

async function load() {
  try {
    const res = await fetch('/api/stock', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    items = await res.json();
    render();
  } catch {
    statusEl.textContent = 'No pudimos cargar el catálogo en este momento. Intenta de nuevo en unos minutos.';
  }
}

q.addEventListener('input', render);
onlyStock.addEventListener('change', render);
currency.addEventListener('change', render);
load();
