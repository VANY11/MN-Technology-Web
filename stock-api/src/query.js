// Única consulta que hace la API. Solo columnas que el cliente puede ver:
// nada de costos, proveedores ni seriales.
// Lee la base propia de MN Tech (mn_technology), nunca las tablas mnstore_* de MaraNet.
// TODO: confirmar los nombres de columna con `\d mnstore_products`.
export const STOCK_SQL = `
  SELECT sku, name, price, stock
  FROM mnstore_products
  ORDER BY name
`;

export function toPublicItem(row) {
  return {
    sku: row.sku,
    nombre: row.name,
    precio: row.price === null ? null : Number(row.price),
    disponible: Math.max(0, Number(row.stock) || 0),
  };
}
