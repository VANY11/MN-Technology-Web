// Función de Cloudflare Pages en /api/foto/<código>/<n>: la foto n del producto (2 = la primera de «más fotos»,
// hasta 12). Igual que la principal: por el túnel con el token de Access y un día en la caché de Cloudflare.
import { servirFoto } from '../[code].js';

export function onRequestGet(context) {
  const n = /^\d{1,2}$/.test(String(context.params.n || '')) ? Number(context.params.n) : 0;
  if (n < 2) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return servirFoto(context, n);
}
