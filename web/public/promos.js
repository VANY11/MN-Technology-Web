// Promociones que Yvan arma en MN Tech (/api/promociones): a qué producto le toca cuál y su precio de oferta.
// Una promoción de producto gana sobre la de su marca, y la de marca sobre la de su categoría; entre las del
// mismo tipo, la primera en el orden que viene de MN Tech.

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const MONEDAS = ['precio', 'precio_ves', 'precio_cop'];
const redondear = (k, v) => (k === 'precio_cop' ? Math.round(v) : Math.round(v * 100) / 100);

export function promoDe(item, promos) {
  const marca = norm(item.marca);
  const categoria = norm(item.categoria);
  return (
    promos.find((p) => p.tipo === 'producto' && p.producto === item.codigo) ||
    promos.find((p) => p.tipo === 'marca' && marca && norm(p.marca) === marca) ||
    promos.find((p) => p.tipo === 'categoria' && categoria && [p.categoria, ...(p.categorias || [])].some((c) => norm(c) === categoria)) ||
    null
  );
}

// Cuánto queda del precio: con porcentaje, igual en las tres monedas; con precio de oferta (solo productos),
// en la proporción entre la oferta y el precio en USD. Una «oferta» que no baja el precio no cambia nada.
function factor(item, p) {
  if (p.porcentaje > 0 && p.porcentaje < 100) return 1 - p.porcentaje / 100;
  if (p.tipo === 'producto' && p.precio_oferta > 0 && item.precio > 0 && p.precio_oferta < item.precio) return p.precio_oferta / item.precio;
  return null;
}

// Marca cada producto con su promoción (`promo`) y, si tiene descuento, pone el precio de oferta y guarda el
// de antes en `antes`. Así el catálogo, la ficha, la vitrina y el carrito usan el mismo precio.
export function aplicarPromos(items, promos) {
  if (!Array.isArray(promos) || !promos.length) return;
  for (const it of items) {
    const p = promoDe(it, promos);
    if (!p) continue;
    it.promo = p;
    const f = factor(it, p);
    if (!f) continue;
    it.antes = {};
    for (const k of MONEDAS) {
      if (it[k] === null || it[k] === undefined) continue;
      it.antes[k] = it[k];
      it[k] = k === 'precio' && !p.porcentaje ? p.precio_oferta : redondear(k, it[k] * f);
    }
  }
}

// Lo que dice la etiqueta roja del producto: la que puso Yvan, o el porcentaje, o «Oferta».
export function etiquetaPromo(item) {
  const p = item.promo;
  if (!p) return null;
  if (p.etiqueta) return p.etiqueta;
  if (!item.antes) return null;
  if (p.porcentaje) return `-${p.porcentaje}%`;
  return 'Oferta';
}
