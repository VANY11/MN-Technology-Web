// Función de Cloudflare Pages (corre como Worker) en /api/stock.
// Pide el stock a la API del servidor local a través del túnel, con el token de servicio
// de Cloudflare Access, y guarda la respuesta 60 segundos en la caché de Cloudflare.
//
// Variables del proyecto de Pages:
//   STOCK_API_URL            https://api-stock.mntechve.com/stock   (texto)
//   CF_ACCESS_CLIENT_ID      Client ID del token worker-web         (secreto)
//   CF_ACCESS_CLIENT_SECRET  Client Secret del token worker-web     (secreto)

const CACHE_SECONDS = 60;

const json = (body, status, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });

export async function onRequestGet({ env, request, waitUntil }) {
  if (!env.STOCK_API_URL || !env.CF_ACCESS_CLIENT_ID || !env.CF_ACCESS_CLIENT_SECRET) {
    return json({ error: 'Stock no configurado' }, 500, { 'Cache-Control': 'no-store' });
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/stock', request.url).toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let upstream;
  try {
    upstream = await fetch(env.STOCK_API_URL, {
      headers: {
        'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET,
        Accept: 'application/json',
      },
      redirect: 'manual',
    });
  } catch {
    upstream = null;
  }

  // Si Access rechaza el token responde con 403 o una redirección al login, nunca con JSON.
  const isJson = upstream?.headers.get('Content-Type')?.includes('application/json');
  if (!upstream || !upstream.ok || !isJson) {
    return json({ error: 'Stock no disponible por ahora' }, 503, { 'Cache-Control': 'no-store' });
  }

  const response = json(await upstream.json(), 200, {
    'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
  });
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
