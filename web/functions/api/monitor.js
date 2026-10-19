// Función de Cloudflare Pages en /api/monitor: el estado de la web para el panel /monitor.html.
// Revisa por el túnel el servidor (API de stock), el stock, las promociones y la entrada de pedidos, con el
// tiempo de respuesta de cada uno, y, si están las variables de Cloudflare, las visitas de Web Analytics.
// Solo responde con la clave del monitor (cabecera X-Monitor-Clave); nunca se guarda en caché.
//
// Variables del proyecto de Pages:
//   MONITOR_CLAVE            clave para abrir el panel                                  (secreto)
//   STOCK_API_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, PEDIDOS_API_URL        (las de la tienda)
//   CF_API_TOKEN             token de API con permiso «Account Analytics: Read»         (secreto, opcional)
//   CF_ACCOUNT_ID            ID de la cuenta de Cloudflare                              (texto, opcional)
//   CF_WEB_ANALYTICS_SITE    site tag de Web Analytics, si la cuenta tiene varios sitios (texto, opcional)

const TIMEOUT_MS = 8000;
const LENTO_MS = 1500;
const VISITAS_CACHE_SECONDS = 60;
const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
// Venezuela no cambia la hora: «hoy» empieza a las 00:00 de UTC-4.
const OFFSET_VE_MS = -4 * 3600 * 1000;

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });

async function claveCorrecta(dada, esperada) {
  if (!dada) return false;
  const digest = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([digest(dada), digest(esperada)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function medir(url, env) {
  const inicio = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET,
        Accept: 'application/json',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const esJson = res.headers.get('Content-Type')?.includes('application/json');
    const data = esJson ? await res.json().catch(() => null) : null;
    return { res, data, ms: Date.now() - inicio };
  } catch (err) {
    return { res: null, data: null, ms: Date.now() - inicio, timeout: err?.name === 'TimeoutError' };
  }
}

const porTiempo = (ms) => (ms >= LENTO_MS ? 'lento' : 'ok');

// Lo que significa cada respuesta cuando no llega lo esperado.
function fallo({ res, timeout }) {
  if (!res) return timeout ? 'No respondió a tiempo' : 'Sin conexión con el servidor';
  if (res.status === 403 || (res.status >= 300 && res.status < 400)) return 'Cloudflare Access rechazó el token';
  if (res.status === 530) return 'El túnel está desconectado';
  if (res.status === 502 || res.status === 504) return 'El túnel no llega al programa del servidor';
  return `Respondió ${res.status}`;
}

async function revisarServidor(env) {
  const r = await medir(new URL('/health', env.STOCK_API_URL), env);
  if (r.res?.ok && r.data?.ok) return { estado: porTiempo(r.ms), ms: r.ms, detalle: 'API de stock en línea' };
  return { estado: 'caido', ms: r.ms, detalle: fallo(r) };
}

// Lo que el panel muestra del inventario publicado: totales, valor a precio de venta y lo que se está agotando.
export function resumirInventario(items) {
  const categorias = new Map();
  let unidades = 0, valor = 0, pocas = 0;
  for (const p of items) {
    const n = Number(p?.disponible) || 0;
    unidades += n;
    valor += n * (Number(p?.precio) || 0);
    if (n > 0 && n <= 2) pocas++;
    const cat = p?.categoria || 'Sin categoría';
    categorias.set(cat, (categorias.get(cat) || 0) + n);
  }
  const top = [...categorias].sort((a, b) => b[1] - a[1]);
  return {
    productos: items.length,
    unidades,
    valorUsd: Math.round(valor),
    pocasUnidades: pocas,
    categorias: top.length,
    porCategoria: top.slice(0, 6).map(([nombre, u]) => ({ nombre, unidades: u })),
  };
}

async function revisarStock(env) {
  const r = await medir(env.STOCK_API_URL, env);
  if (r.res?.ok && Array.isArray(r.data)) {
    const inventario = resumirInventario(r.data);
    return { estado: porTiempo(r.ms), ms: r.ms, detalle: `${inventario.productos} productos, ${inventario.unidades} unidades`, inventario };
  }
  return { estado: 'caido', ms: r.ms, detalle: r.res?.ok ? 'La respuesta no es una lista' : fallo(r) };
}

async function revisarPromociones(env) {
  const r = await medir(new URL('/promociones', env.STOCK_API_URL), env);
  if (r.res?.ok && Array.isArray(r.data)) {
    const n = r.data.length;
    return { estado: porTiempo(r.ms), ms: r.ms, detalle: n === 1 ? '1 promoción vigente' : `${n} promociones vigentes` };
  }
  return { estado: 'caido', ms: r.ms, detalle: fallo(r) };
}

// La entrada de pedidos solo acepta POST: un GET no crea nada y cualquier respuesta del programa
// (404, 405, 401...) prueba que el túnel y la app MN Tech están arriba.
async function revisarPedidos(env) {
  if (!env.PEDIDOS_API_URL || !env.PEDIDOS_TOKEN) return { estado: 'config', ms: null, detalle: 'Pedidos en línea sin configurar' };
  const r = await medir(env.PEDIDOS_API_URL, env);
  const s = r.res?.status;
  if (!r.res || s === 403 || (s >= 300 && s < 400) || [502, 503, 504, 530].includes(s)) {
    return { estado: 'caido', ms: r.ms, detalle: fallo(r) };
  }
  return { estado: porTiempo(r.ms), ms: r.ms, detalle: 'App MN Tech recibe pedidos' };
}

const filtroTipo = (evento) => `Account${evento}EventsAdaptiveGroupsFilter_InputObject`;
const PAGELOAD = filtroTipo('RumPageload');

// Lo principal: si esta consulta falla, el panel muestra el error de Cloudflare.
const VISITAS_QUERY = `query Visitas($cuenta: string!, $filtroHoy: ${PAGELOAD}, $filtroHora: ${PAGELOAD}, $filtro5: ${PAGELOAD}) {
  viewer { accounts(filter: { accountTag: $cuenta }) {
    hoy: rumPageloadEventsAdaptiveGroups(filter: $filtroHoy, limit: 1) { count sum { visits } }
    ahora: rumPageloadEventsAdaptiveGroups(filter: $filtro5, limit: 1) { count sum { visits } }
    minutos: rumPageloadEventsAdaptiveGroups(filter: $filtroHora, limit: 60, orderBy: [datetimeMinute_ASC]) { count sum { visits } dimensions { datetimeMinute } }
    paises: rumPageloadEventsAdaptiveGroups(filter: $filtroHoy, limit: 6, orderBy: [count_DESC]) { count dimensions { countryName } }
    equipos: rumPageloadEventsAdaptiveGroups(filter: $filtroHoy, limit: 3, orderBy: [count_DESC]) { count dimensions { deviceType } }
    origen: rumPageloadEventsAdaptiveGroups(filter: $filtroHoy, limit: 6, orderBy: [count_DESC]) { count dimensions { refererHost } }
  } }
}`;

// Extras: si alguna falla, el resto del panel sigue igual y esa tarjeta queda vacía.
const SEMANA_QUERY = `query Semana($cuenta: string!, $filtroSemana: ${PAGELOAD}, $filtroAyer: ${PAGELOAD}, $filtroHoy: ${PAGELOAD}) {
  viewer { accounts(filter: { accountTag: $cuenta }) {
    horas: rumPageloadEventsAdaptiveGroups(filter: $filtroSemana, limit: 200, orderBy: [datetimeHour_ASC]) { count sum { visits } dimensions { datetimeHour } }
    ayer: rumPageloadEventsAdaptiveGroups(filter: $filtroAyer, limit: 1) { count sum { visits } }
    paginas: rumPageloadEventsAdaptiveGroups(filter: $filtroHoy, limit: 6, orderBy: [count_DESC]) { count dimensions { requestPath } }
    navegadores: rumPageloadEventsAdaptiveGroups(filter: $filtroHoy, limit: 5, orderBy: [count_DESC]) { count dimensions { userAgentBrowser } }
  } }
}`;

const RENDIMIENTO_QUERY = `query Rendimiento($cuenta: string!, $filtroHoy: ${filtroTipo('RumPerformance')}) {
  viewer { accounts(filter: { accountTag: $cuenta }) {
    carga: rumPerformanceEventsAdaptiveGroups(filter: $filtroHoy, limit: 1) { count quantiles { pageLoadTimeP50 pageLoadTimeP90 firstContentfulPaintP50 } }
  } }
}`;

export function inicioDeHoyVE(ahora = Date.now()) {
  const local = new Date(ahora + OFFSET_VE_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - OFFSET_VE_MS);
}

// Día de Venezuela (AAAA-MM-DD) de un instante.
export const diaVE = (t) => new Date(new Date(t).getTime() + OFFSET_VE_MS).toISOString().slice(0, 10);

async function graphql(env, query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { cuenta: env.CF_ACCOUNT_ID, ...variables } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => null);
  const cuenta = data?.data?.viewer?.accounts?.[0];
  if (!res.ok || !cuenta) throw new Error(data?.errors?.[0]?.message || `Cloudflare respondió ${res.status}`);
  return cuenta;
}

// Cloudflare da los tiempos de carga en microsegundos; se pasan a milisegundos.
const aMs = (v) => (Number.isFinite(v) && v > 0 ? Math.round(v > 60000 ? v / 1000 : v) : null);

async function consultarVisitas(env) {
  const ahora = Date.now();
  const hoy = inicioDeHoyVE(ahora).getTime();
  const filtro = (desde, hasta) => ({
    datetime_geq: new Date(desde).toISOString(),
    ...(hasta ? { datetime_lt: new Date(hasta).toISOString() } : {}),
    ...(env.CF_WEB_ANALYTICS_SITE ? { siteTag: env.CF_WEB_ANALYTICS_SITE } : {}),
  });
  const [base, semana, rendimiento] = await Promise.allSettled([
    graphql(env, VISITAS_QUERY, { filtroHoy: filtro(hoy), filtroHora: filtro(ahora - 3600e3), filtro5: filtro(ahora - 5 * 60e3) }),
    // Siete días completos hacia atrás desde el inicio de hoy; «ayer» corta a la misma hora de hoy para comparar parejo.
    graphql(env, SEMANA_QUERY, { filtroSemana: filtro(hoy - 6 * 86400e3), filtroAyer: filtro(hoy - 86400e3, ahora - 86400e3), filtroHoy: filtro(hoy) }),
    graphql(env, RENDIMIENTO_QUERY, { filtroHoy: filtro(hoy) }),
  ]);
  if (base.status === 'rejected') return { configurado: true, error: base.reason?.message || 'No se pudo consultar Cloudflare' };

  const c = base.value;
  const total = (g) => ({ paginas: g?.[0]?.count ?? 0, visitas: g?.[0]?.sum?.visits ?? 0 });
  const top = (g, campo, vacio = '(directo)') => (g || []).map((x) => ({ nombre: x.dimensions?.[campo] || vacio, paginas: x.count }));
  const datos = {
    configurado: true,
    hoy: total(c.hoy),
    ultimos5min: total(c.ahora),
    porMinuto: (c.minutos || []).map((x) => ({ t: x.dimensions?.datetimeMinute, paginas: x.count, visitas: x.sum?.visits ?? 0 })),
    paises: top(c.paises, 'countryName', '??'),
    equipos: top(c.equipos, 'deviceType', 'otro'),
    origen: top(c.origen, 'refererHost'),
  };

  if (semana.status === 'fulfilled') {
    const s = semana.value;
    const horas = (s.horas || []).map((x) => ({ t: x.dimensions?.datetimeHour, paginas: x.count, visitas: x.sum?.visits ?? 0 }));
    datos.porHora = horas.filter((h) => new Date(h.t).getTime() >= ahora - 24 * 3600e3);
    const dias = new Map();
    for (let i = 6; i >= 0; i--) dias.set(diaVE(hoy - i * 86400e3 + 3600e3), { t: diaVE(hoy - i * 86400e3 + 3600e3), paginas: 0, visitas: 0 });
    for (const h of horas) {
      const d = dias.get(diaVE(h.t));
      if (d) { d.paginas += h.paginas; d.visitas += h.visitas; }
    }
    datos.porDia = [...dias.values()];
    datos.ayerALaHora = total(s.ayer);
    datos.paginasTop = top(s.paginas, 'requestPath', '/');
    datos.navegadores = top(s.navegadores, 'userAgentBrowser', 'otro');
  }
  if (rendimiento.status === 'fulfilled') {
    const q = rendimiento.value.carga?.[0];
    if (q?.count) {
      datos.carga = {
        muestras: q.count,
        p50: aMs(q.quantiles?.pageLoadTimeP50),
        p90: aMs(q.quantiles?.pageLoadTimeP90),
        primerPintado: aMs(q.quantiles?.firstContentfulPaintP50),
      };
    }
  }
  const avisos = [semana, rendimiento].filter((r) => r.status === 'rejected').map((r) => r.reason?.message);
  if (avisos.length) datos.avisos = avisos;
  return datos;
}

async function visitas(env, request, waitUntil) {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return { configurado: false };
  // Guardadas 60 s en la caché del borde: Web Analytics no se actualiza más rápido y así no se gasta la API.
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(new URL('/api/monitor/visitas-cache', request.url).toString());
  const cached = await cache?.match(cacheKey);
  if (cached) return cached.json();
  let datos;
  try {
    datos = await consultarVisitas(env);
  } catch {
    return { configurado: true, error: 'No se pudo consultar Cloudflare' };
  }
  if (cache && !datos.error) {
    const res = new Response(JSON.stringify(datos), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${VISITAS_CACHE_SECONDS}` },
    });
    waitUntil(cache.put(cacheKey, res));
  }
  return datos;
}

export async function onRequestGet({ env, request, waitUntil }) {
  if (!env.MONITOR_CLAVE) return json({ error: 'Falta la variable MONITOR_CLAVE en Cloudflare Pages' }, 503);
  if (!(await claveCorrecta(request.headers.get('X-Monitor-Clave'), env.MONITOR_CLAVE))) {
    return json({ error: 'Clave incorrecta' }, 401);
  }

  const tunelListo = env.STOCK_API_URL && env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET;
  const sinTunel = { estado: 'config', ms: null, detalle: 'Faltan STOCK_API_URL o el token de Access' };
  const [servidor, stock, promociones, pedidos, vis] = await Promise.all([
    tunelListo ? revisarServidor(env) : sinTunel,
    tunelListo ? revisarStock(env) : sinTunel,
    tunelListo ? revisarPromociones(env) : sinTunel,
    tunelListo ? revisarPedidos(env) : sinTunel,
    visitas(env, request, waitUntil),
  ]);

  return json({
    hora: new Date().toISOString(),
    revisiones: [
      { id: 'web', nombre: 'Página web', estado: 'ok', ms: 0, detalle: `Cloudflare ${request.cf?.colo ? `(${request.cf.colo})` : ''}`.trim() },
      { id: 'servidor', nombre: 'Servidor y túnel', ...servidor },
      { id: 'stock', nombre: 'Stock', ...stock },
      { id: 'promociones', nombre: 'Promociones', ...promociones },
      { id: 'pedidos', nombre: 'Pedidos web', ...pedidos },
    ],
    visitas: vis,
  }, 200);
}
