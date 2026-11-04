// Función de Cloudflare Pages en /api/foto/<código> (la foto principal; las de más, en /api/foto/<código>/<n>).
// Trae la foto del producto desde la API del servidor local por el túnel (con el token de Access)
// y la guarda un día en la caché de Cloudflare, así el servidor casi nunca recibe la petición.
// El ?v= que pone la API cambia cuando cambia la foto, y forma parte de la clave de caché.
// Usa las mismas variables que /api/stock (la URL de las fotos sale de STOCK_API_URL).

const CACHE_SECONDS = 86400;
const PHOTO_TYPES = /^image\/(jpeg|png|webp|gif|avif)$/;

const notFound = (status = 404) =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });

export function onRequestGet(context) {
  return servirFoto(context, 1);
}

// La foto n de un producto (1 = la principal; 2… = las de más, functions/api/foto/[code]/[n].js).
export async function servirFoto({ env, request, params, waitUntil }, n) {
  if (!env.STOCK_API_URL || !env.CF_ACCESS_CLIENT_ID || !env.CF_ACCESS_CLIENT_SECRET) {
    return notFound(500);
  }
  const code = String(params.code || '');
  if (!code || code.length > 64) return notFound();
  if (!Number.isInteger(n) || n < 1 || n > 12) return notFound();
  const ruta = `${encodeURIComponent(code)}${n > 1 ? `/${n}` : ''}`;

  const v = new URL(request.url).searchParams.get('v') || '';
  const cache = caches.default;
  const cacheKey = new Request(
    new URL(`/api/foto/${ruta}?v=${encodeURIComponent(v)}`, request.url).toString(),
  );
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let upstream;
  try {
    upstream = await fetch(new URL(`/foto/${ruta}`, env.STOCK_API_URL), {
      headers: {
        'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET,
      },
      redirect: 'manual',
    });
  } catch {
    upstream = null;
  }

  const type = (upstream?.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (!upstream || !upstream.ok || !PHOTO_TYPES.test(type)) {
    return notFound(upstream && upstream.status === 404 ? 404 : 503);
  }

  const response = new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
