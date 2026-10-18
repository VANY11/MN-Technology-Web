// Función de Cloudflare Pages en /p/<código>: el enlace de un producto para compartir.
// Devuelve la misma página de la tienda (que abre la ficha de ese producto) con las etiquetas
// Open Graph del producto (nombre, precio y foto), para que WhatsApp, Facebook, Telegram, etc.
// muestren la vista previa. Los datos salen de /api/stock (la misma caché de 60 s de la tienda).

import { onRequestGet as stockGet } from '../api/stock.js';

const precio = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' });
const numero = new Intl.NumberFormat('es-VE');

const escapar = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Las etiquetas del producto: van en el <head> de la página, con su título en vez del general.
export function metaProducto(item, origin) {
  const url = `${origin}/p/${encodeURIComponent(item.codigo)}`;
  const partes = [];
  if (item.precio !== null && item.precio !== undefined) partes.push(precio.format(item.precio));
  if (item.disponible > 0) partes.push(item.disponible === 1 ? 'Última unidad' : `${numero.format(item.disponible)} disponibles`);
  partes.push('MN Technology');
  const descripcion = partes.join(' · ');
  const foto =
    typeof item.foto === 'string' && item.foto.startsWith('https://') ? item.foto
    : typeof item.foto === 'string' && item.foto.startsWith('/api/foto/') ? `${origin}${item.foto}`
    : null;
  const tags = [
    ['og:type', 'product'],
    ['og:site_name', 'MN Technology'],
    ['og:title', item.nombre],
    ['og:description', descripcion],
    ['og:url', url],
    foto && ['og:image', foto],
  ]
    .filter(Boolean)
    .map(([k, v]) => `<meta property="${k}" content="${escapar(v)}">`);
  tags.push(`<meta name="twitter:card" content="${foto ? 'summary_large_image' : 'summary'}">`);
  tags.push(`<link rel="canonical" href="${escapar(url)}">`);
  return { titulo: `${item.nombre} · MN Technology`, descripcion, tags };
}

export function conMeta(html, meta) {
  return html
    // Con función: un «$» en el nombre del producto no se toma como patrón de reemplazo.
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapar(meta.titulo)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${escapar(meta.descripcion)}">`)
    .replace('</head>', () => `  ${meta.tags.join('\n  ')}\n</head>`);
}

// Usa la misma función de /api/stock (sin pedirse a sí misma por la red).
async function buscarProducto(ctx, code) {
  try {
    const request = new Request(new URL('/api/stock', ctx.request.url), { headers: { Accept: 'application/json' } });
    const res = await stockGet({ ...ctx, request });
    if (!res.ok) return null;
    const lista = await res.json();
    return Array.isArray(lista) ? lista.find((it) => it && it.codigo === code) || null : null;
  } catch {
    return null;
  }
}

export async function onRequestGet(ctx) {
  const { env, request, params } = ctx;
  const code = String(params.code || '');
  const pagina = await env.ASSETS.fetch(new URL('/', request.url));
  const item = code && code.length <= 64 ? await buscarProducto(ctx, code) : null;
  // Sin el producto (ya no está, o el stock no responde) se ve la tienda normal y la página avisa.
  if (!item || !pagina.ok) return pagina;
  const html = conMeta(await pagina.text(), metaProducto(item, new URL(request.url).origin));
  const headers = new Headers(pagina.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=60');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(html, { status: 200, headers });
}
