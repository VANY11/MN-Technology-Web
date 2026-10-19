// Función de Cloudflare Pages en /api/categorias: el orden de las categorías que Yvan arma en MN Tech (las fijadas en
// Inventario → Categorías y las unidades vendidas en 30 días). La trae de la API del servidor local por el túnel, igual
// que /api/promociones, y la guarda 5 minutos en la caché. Si algo falla responde una lista vacía: la web ordena entonces
// por cantidad de productos.

const CACHE_SECONDS = 300;

const json = (body, cacheControl) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cacheControl },
  });

export async function onRequestGet({ env, request, waitUntil }) {
  if (!env.STOCK_API_URL || !env.CF_ACCESS_CLIENT_ID || !env.CF_ACCESS_CLIENT_SECRET) return json([], 'no-store');

  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/categorias', request.url).toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let data = null;
  try {
    const upstream = await fetch(new URL('/categorias', env.STOCK_API_URL), {
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
