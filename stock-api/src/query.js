import { createHash } from 'node:crypto';

// Consultas que hace la API. Solo columnas que el cliente puede ver:
// nada de costos, proveedores, IMEI, seriales ni stock de MaraNet.
// Lee la base propia de MN Tech (mn_technology), nunca las tablas mnstore_* de MaraNet.
// El rol mnstock solo tiene permiso sobre estas columnas (deploy/rol-solo-lectura.sql).
const PUBLIC_FILTER = 'p.is_active AND NOT p.maranet_only AND p.stock > 0';

export const STOCK_SQL = `
  SELECT p.code, p.name, p.brand, p.model, p.color, p.ram, p.storage,
         p.price, p.price_ves, p.price_cop, p.stock, p.foto_url, p.specs,
         c.name AS category, c.template_fields
  FROM mnstore_products p
  LEFT JOIN mnstore_categories c ON c.id = p.category_id
  WHERE ${PUBLIC_FILTER}
  ORDER BY p.name
`;

// La foto de un solo producto, y solo si ese producto se ve en la web.
export const PHOTO_SQL = `
  SELECT p.foto_url
  FROM mnstore_products p
  WHERE p.code = $1 AND ${PUBLIC_FILTER}
`;

const money = (v) => (v === null || v === undefined ? null : Number(v));

// Ruta de una foto guardada por el sistema MN Tech (p. ej. /uploads/productos/a.jpg).
// Nada de "..", "//", ni caracteres raros: la API la pide a la app local tal cual.
export function localPhotoPath(url) {
  if (typeof url !== 'string') return null;
  const path = url.trim();
  if (!/^\/[A-Za-z0-9._~\/-]+$/.test(path) || path.includes('..') || path.includes('//')) return null;
  return path;
}

// URL de la foto que ve el cliente: una https pública se deja igual; una ruta local se sirve
// por /api/foto/<código>, con ?v= para que la caché se renueve cuando cambie la foto.
export function publicPhoto(code, url) {
  if (typeof url === 'string' && url.startsWith('https://')) return url;
  const path = localPhotoPath(url);
  if (!path || !code) return null;
  const v = createHash('sha1').update(path).digest('hex').slice(0, 10);
  return `/api/foto/${encodeURIComponent(code)}?v=${v}`;
}

const parseJson = (v, fallback) => {
  if (v === null || v === undefined) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

// Especificaciones del producto, solo las que su categoría define como campos (template_fields),
// en el orden de la categoría y con su nombre visible. Cualquier otra clave guardada en specs no sale.
export function publicSpecs(templateFields, specs) {
  const fields = parseJson(templateFields, []);
  const values = parseJson(specs, {});
  if (!Array.isArray(fields) || !values || typeof values !== 'object') return [];
  const out = [];
  for (const f of fields) {
    if (!f || typeof f !== 'object' || !f.key) continue;
    const raw = values[f.key];
    if (raw === null || raw === undefined || typeof raw === 'object') continue;
    const valor = String(raw).trim();
    const campo = String(f.label || f.key).trim();
    if (valor && campo) out.push({ campo, valor: valor.slice(0, 80) });
  }
  return out;
}

export function toPublicItem(row) {
  return {
    codigo: row.code,
    nombre: row.name,
    categoria: row.category ?? null,
    marca: row.brand ?? null,
    modelo: row.model ?? null,
    color: row.color ?? null,
    ram: row.ram ?? null,
    almacenamiento: row.storage ?? null,
    precio: money(row.price),
    precio_ves: money(row.price_ves),
    precio_cop: money(row.price_cop),
    disponible: Math.max(0, Number(row.stock) || 0),
    foto: publicPhoto(row.code, row.foto_url),
    especificaciones: publicSpecs(row.template_fields, row.specs),
  };
}

// Promociones que Yvan arma en MN Tech (módulo «Promociones de la web»). Solo se lee la vista
// web_promociones_vigentes, que ya deja fuera las vencidas, las inactivas y los productos que no se venden;
// el rol mnstock tiene SELECT sobre la vista, nunca sobre la tabla. De las categorías se mandan los nombres
// (la de la promoción y sus subcategorías), que es lo que la web conoce de cada producto. Con v.* la consulta
// sigue sirviendo cuando MN Tech suma columnas a la vista (p. ej. `lugares`); solo sale lo que arma toPublicPromo.
export const PROMOS_SQL = `
  SELECT v.*,
         ARRAY(SELECT c.name FROM mnstore_categories c WHERE c.id = ANY(v.category_ids) ORDER BY c.name) AS categorias
  FROM web_promociones_vigentes v
  ORDER BY v.orden, v.id
`;

const TIPOS_PROMO = new Set(['producto', 'marca', 'categoria', 'aviso']);
const DESCUENTOS = new Set(['ninguno', 'porcentaje', 'precio']);
// Dónde se muestra la promoción en la web. Sin la columna (vista vieja), donde iba antes: vitrina y destacados.
const LUGARES = ['vitrina', 'destacados', 'nuevos'];
const LUGARES_POR_DEFECTO = ['vitrina', 'destacados'];
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export function toPublicPromo(row) {
  if (!TIPOS_PROMO.has(row.tipo)) return null;
  const titulo = text(row.titulo, 80);
  if (!titulo) return null;
  const descuento = DESCUENTOS.has(row.descuento_tipo) ? row.descuento_tipo : 'ninguno';
  const valor = money(row.descuento_valor);
  return {
    id: Number(row.id),
    tipo: row.tipo,
    titulo,
    texto: text(row.texto, 300),
    etiqueta: text(row.etiqueta, 30),
    producto: row.tipo === 'producto' ? text(row.producto_code, 64) : null,
    marca: row.tipo === 'marca' ? text(row.marca, 80) : null,
    categoria: row.tipo === 'categoria' ? text(row.categoria, 120) : null,
    categorias: row.tipo === 'categoria' && Array.isArray(row.categorias) ? row.categorias.filter((c) => typeof c === 'string') : [],
    descuento,
    porcentaje: descuento === 'porcentaje' && valor > 0 && valor < 100 ? valor : null,
    precio_oferta: row.tipo === 'producto' && descuento !== 'ninguno' ? money(row.precio_oferta) : null,
    lugares: Array.isArray(row.lugares) ? LUGARES.filter((l) => row.lugares.includes(l)) : LUGARES_POR_DEFECTO,
  };
}

// Orden de las categorías del catálogo, que Yvan arma en MN Tech (Inventario → Categorías, «Orden en la web»). Solo se
// lee la vista web_categorias_orden: nombre, el número fijado (o null) y las unidades vendidas en 30 días, sin montos.
// El rol mnstock tiene SELECT sobre la vista, nunca sobre las ventas.
export const CATS_SQL = `
  SELECT v.name, v.web_orden, v.vendidas_30d
  FROM web_categorias_orden v
`;

export function toPublicCat(row) {
  const nombre = text(row.name, 120);
  if (!nombre) return null;
  const orden = Number(row.web_orden);
  const vendidas = Number(row.vendidas_30d);
  return {
    nombre,
    orden: Number.isInteger(orden) && orden >= 1 ? orden : null,
    vendidas: Number.isFinite(vendidas) && vendidas > 0 ? Math.round(vendidas) : 0,
  };
}

// Productos nuevos (decisión de Yvan del 2026-10-22, «fecha + reposiciones»): los creados en MN Tech en los últimos 30
// días o a los que les entró mercancía en ese plazo. Solo se lee la vista web_productos_nuevos (código, desde cuándo y
// el motivo); el rol mnstock tiene SELECT sobre la vista, nunca sobre el historial del inventario.
export const NUEVOS_SQL = `
  SELECT v.code, v.nuevo_desde, v.motivo
  FROM web_productos_nuevos v
  ORDER BY v.nuevo_desde DESC
`;

export function toPublicNuevo(row) {
  const codigo = text(row.code, 64);
  const desde = row.nuevo_desde instanceof Date ? row.nuevo_desde : new Date(row.nuevo_desde);
  if (!codigo || Number.isNaN(desde.getTime())) return null;
  return { codigo, desde: desde.toISOString(), motivo: row.motivo === 'reposicion' ? 'reposicion' : 'nuevo' };
}

// Colores por serial: en MN Tech los teléfonos guardan el color en cada serial/IMEI, no en el producto. Solo se lee la
// vista web_colores_disponibles (código, color y cuántas unidades libres hay de ese color); el rol mnstock tiene SELECT
// sobre la vista, nunca sobre mnstore_serials, así que ningún IMEI sale de la base.
export const COLORES_SQL = `
  SELECT v.code, v.color, v.disponible
  FROM web_colores_disponibles v
  ORDER BY v.code, v.color
`;

// Mapa código → [{ color, disponible }] con los colores que tienen al menos una unidad.
export function coloresPorCodigo(rows) {
  const out = new Map();
  for (const row of rows) {
    const codigo = text(row.code, 64);
    const color = text(row.color, 50);
    const disponible = Math.floor(Number(row.disponible) || 0);
    if (!codigo || !color || disponible < 1) continue;
    if (!out.has(codigo)) out.set(codigo, []);
    out.get(codigo).push({ color, disponible });
  }
  return out;
}
