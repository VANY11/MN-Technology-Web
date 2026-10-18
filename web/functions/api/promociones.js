// Función de Cloudflare Pages en /api/promociones: las promociones vigentes que Yvan arma en MN Tech
// (vitrina de la portada y precios de oferta). Las trae de la API del servidor local por el túnel, igual que
// /api/stock (mismas variables; la URL sale de STOCK_API_URL), y las guarda 60 segundos en la caché.
// Si algo falla responde una lista vacía: sin promociones la tienda funciona igual.

const CACHE_SECONDS = 60;

const json = (body, cacheControl) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cacheControl },
  });

export async function onRequestGet({ env, request, waitUntil }) {
  if (!env.STOCK_API_URL || !env.CF_ACCESS_CLIENT_ID || !env.CF_ACCESS_CLIENT_SECRET) return json([], 'no-store');

  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/promociones', request.url).toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let data = null;
  try {
    const upstream = await fetch(new URL('/promociones', env.STOCK_API_URL), {
      headers: {
        'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET,
        Accept: 'application/json',
      },
      redirect: 'manual',
    });
    if (upstream.ok && upstream.headers.get('Content-Type')?.includes('application/json')) data = await upstream.json();
  } catch {}
  if (!Array.isArray(data)) return json([], 'no-store');

  const response = json(data, `public, max-age=${CACHE_SECONDS}`);
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
