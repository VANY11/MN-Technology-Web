// Única consulta que hace la API. Solo columnas que el cliente puede ver:
// nada de costos, proveedores, IMEI, seriales ni stock de MaraNet.
// Lee la base propia de MN Tech (mn_technology), nunca las tablas mnstore_* de MaraNet.
// El rol mnstock solo tiene permiso sobre estas columnas (deploy/rol-solo-lectura.sql).
export const STOCK_SQL = `
  SELECT code, name, brand, model, color, ram, storage,
         price, price_ves, price_cop, stock, foto_url
  FROM mnstore_products
  WHERE is_active AND NOT maranet_only AND stock > 0
  ORDER BY name
`;

const money = (v) => (v === null || v === undefined ? null : Number(v));

export function toPublicItem(row) {
  return {
    codigo: row.code,
    nombre: row.name,
    marca: row.brand ?? null,
    modelo: row.model ?? null,
    color: row.color ?? null,
    ram: row.ram ?? null,
    almacenamiento: row.storage ?? null,
    precio: money(row.price),
    precio_ves: money(row.price_ves),
    precio_cop: money(row.price_cop),
    disponible: Math.max(0, Number(row.stock) || 0),
    foto: row.foto_url ?? null,
  };
}
