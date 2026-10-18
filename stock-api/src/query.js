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
// (la de la promoción y sus subcategorías), que es lo que la web conoce de cada producto.
export const PROMOS_SQL = `
  SELECT v.id, v.tipo, v.titulo, v.texto, v.etiqueta, v.producto_code, v.marca, v.categoria,
         ARRAY(SELECT c.name FROM mnstore_categories c WHERE c.id = ANY(v.category_ids) ORDER BY c.name) AS categorias,
         v.descuento_tipo, v.descuento_valor, v.precio_oferta
  FROM web_promociones_vigentes v
  ORDER BY v.orden, v.id
`;

const TIPOS_PROMO = new Set(['producto', 'marca', 'categoria', 'aviso']);
const DESCUENTOS = new Set(['ninguno', 'porcentaje', 'precio']);
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
  };
}
