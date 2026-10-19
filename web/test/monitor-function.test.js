import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, inicioDeHoyVE, resumirInventario, diaVE } from '../functions/api/monitor.js';

const env = {
  MONITOR_CLAVE: 'clave-monitor',
  STOCK_API_URL: 'https://api-stock.example.com/stock',
  CF_ACCESS_CLIENT_ID: 'id.access',
  CF_ACCESS_CLIENT_SECRET: 'secreto',
  PEDIDOS_API_URL: 'https://pedidos-api.example.com/api/pedidos-web/entrada',
  PEDIDOS_TOKEN: 'token',
};
const req = (clave = 'clave-monitor') =>
  new Request('https://mntechve.com/api/monitor', { headers: clave ? { 'X-Monitor-Clave': clave } : {} });
const jsonRes = (body, status = 200) => Response.json(body, { status });
let calls;
let respuestas;

beforeEach(() => {
  calls = [];
  globalThis.caches = undefined;
  respuestas = {
    '/health': () => jsonRes({ ok: true }),
    '/stock': () => jsonRes([{ codigo: 'A', disponible: 3 }, { codigo: 'B', disponible: 2 }]),
    '/promociones': () => jsonRes([{ id: 1 }]),
    '/api/pedidos-web/entrada': () => new Response('Not found', { status: 404 }),
  };
  globalThis.fetch = async (url, init) => {
    const u = new URL(url);
    calls.push({ url: u, init });
    if (u.host === 'api.cloudflare.com') return respuestas.graphql(init);
    return respuestas[u.pathname]();
  };
});

const run = async (e = env, r = req()) => {
  const pending = [];
  const res = await onRequestGet({ env: e, request: r, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return res;
};
const estados = (data) => Object.fromEntries(data.revisiones.map((r) => [r.id, r.estado]));

test('pide la clave y no responde sin ella', async () => {
  assert.equal((await run(env, req(''))).status, 401);
  assert.equal((await run(env, req('otra'))).status, 401);
  assert.equal((await run({ ...env, MONITOR_CLAVE: '' })).status, 503);
  assert.equal(calls.length, 0);
});

test('todo en línea, con el token de Access en cada revisión y sin caché', async () => {
  const res = await run();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const data = await res.json();
  assert.deepEqual(estados(data), { web: 'ok', servidor: 'ok', stock: 'ok', promociones: 'ok', pedidos: 'ok' });
  assert.match(data.revisiones.find((r) => r.id === 'stock').detalle, /2 productos, 5 unidades/);
  assert.deepEqual(data.visitas, { configurado: false });
  for (const c of calls) assert.equal(c.init.headers['CF-Access-Client-Id'], 'id.access');
  assert.ok(calls.every((c) => !c.init.method || c.init.method === 'GET'), 'nunca envía un pedido');
});

test('distingue túnel caído, token rechazado y servidor sin respuesta', async () => {
  respuestas['/health'] = () => new Response('<html>1033</html>', { status: 530 });
  respuestas['/stock'] = () => new Response('<html>login</html>', { status: 302 });
  respuestas['/promociones'] = () => { throw new TypeError('fetch failed'); };
  respuestas['/api/pedidos-web/entrada'] = () => new Response('Bad gateway', { status: 502 });
  const data = await (await run()).json();
  assert.deepEqual(estados(data), { web: 'ok', servidor: 'caido', stock: 'caido', promociones: 'caido', pedidos: 'caido' });
  const det = Object.fromEntries(data.revisiones.map((r) => [r.id, r.detalle]));
  assert.match(det.servidor, /túnel está desconectado/);
  assert.match(det.stock, /Access rechazó/);
  assert.match(det.promociones, /Sin conexión/);
  assert.match(det.pedidos, /no llega al programa/);
});

test('sin variables del túnel marca sin configurar', async () => {
  const data = await (await run({ MONITOR_CLAVE: 'clave-monitor' })).json();
  assert.equal(estados(data).stock, 'config');
  assert.equal(calls.length, 0);
});

test('lee las visitas de Web Analytics con el token de API', async () => {
  respuestas.graphql = (init) => {
    assert.equal(init.headers.Authorization, 'Bearer cf-token');
    const { query, variables } = JSON.parse(init.body);
    assert.equal(variables.cuenta, 'cuenta-1');
    assert.equal(variables.filtroHoy.siteTag, 'sitio-1');
    if (query.startsWith('query Rendimiento')) {
      return jsonRes({ data: { viewer: { accounts: [{ carga: [{ count: 9, quantiles: { pageLoadTimeP50: 1234000, pageLoadTimeP90: 3400000, firstContentfulPaintP50: 800000 } }] }] } } });
    }
    if (query.startsWith('query Semana')) {
      const hace = (h) => new Date(Math.floor(Date.now() / 3600e3) * 3600e3 - h * 3600e3).toISOString();
      return jsonRes({ data: { viewer: { accounts: [{
        horas: [{ count: 5, sum: { visits: 2 }, dimensions: { datetimeHour: hace(30) } }, { count: 7, sum: { visits: 3 }, dimensions: { datetimeHour: hace(1) } }],
        ayer: [{ count: 50, sum: { visits: 20 } }],
        paginas: [{ count: 9, dimensions: { requestPath: '/p/T001' } }],
        navegadores: [{ count: 9, dimensions: { userAgentBrowser: 'Chrome' } }],
      }] } } });
    }
    return jsonRes({ data: { viewer: { accounts: [{
      hoy: [{ count: 120, sum: { visits: 45 } }],
      ahora: [{ count: 4, sum: { visits: 2 } }],
      minutos: [{ count: 3, dimensions: { datetimeMinute: '2026-10-18T21:00:00Z' } }],
      paises: [{ count: 100, dimensions: { countryName: 'VE' } }],
      equipos: [{ count: 90, dimensions: { deviceType: 'mobile' } }],
      origen: [{ count: 50, dimensions: { refererHost: '' } }],
    }] } } });
  };
  const data = await (await run({ ...env, CF_API_TOKEN: 'cf-token', CF_ACCOUNT_ID: 'cuenta-1', CF_WEB_ANALYTICS_SITE: 'sitio-1' })).json();
  assert.deepEqual(data.visitas.hoy, { paginas: 120, visitas: 45 });
  assert.deepEqual(data.visitas.ultimos5min, { paginas: 4, visitas: 2 });
  assert.deepEqual(data.visitas.origen, [{ nombre: '(directo)', paginas: 50 }]);
  assert.deepEqual(data.visitas.ayerALaHora, { paginas: 50, visitas: 20 });
  assert.equal(data.visitas.porHora.length, 1, 'solo las últimas 24 horas');
  assert.equal(data.visitas.porDia.length, 7);
  assert.equal(data.visitas.porDia.reduce((s, d) => s + d.paginas, 0), 12);
  assert.deepEqual(data.visitas.carga, { muestras: 9, p50: 1234, p90: 3400, primerPintado: 800 });
  assert.equal(data.visitas.avisos, undefined);
});

test('si fallan los extras de visitas, lo principal sigue', async () => {
  respuestas.graphql = (init) => {
    if (!JSON.parse(init.body).query.startsWith('query Visitas')) return jsonRes({ data: null, errors: [{ message: 'campo desconocido' }] });
    return jsonRes({ data: { viewer: { accounts: [{ hoy: [{ count: 3, sum: { visits: 1 } }], ahora: [], minutos: [], paises: [], equipos: [], origen: [] }] } } });
  };
  const data = await (await run({ ...env, CF_API_TOKEN: 'x', CF_ACCOUNT_ID: 'y' })).json();
  assert.deepEqual(data.visitas.hoy, { paginas: 3, visitas: 1 });
  assert.equal(data.visitas.porDia, undefined);
  assert.deepEqual(data.visitas.avisos, ['campo desconocido', 'campo desconocido']);
});

test('resume el inventario publicado', () => {
  const r = resumirInventario([
    { categoria: 'Teléfonos', disponible: 2, precio: 100 },
    { categoria: 'Teléfonos', disponible: 5, precio: 10 },
    { categoria: null, disponible: 1, precio: 3.5 },
  ]);
  assert.equal(r.productos, 3);
  assert.equal(r.unidades, 8);
  assert.equal(r.valorUsd, 254);
  assert.equal(r.pocasUnidades, 2);
  assert.deepEqual(r.porCategoria[0], { nombre: 'Teléfonos', unidades: 7 });
  assert.equal(diaVE('2026-10-19T03:00:00Z'), '2026-10-18');
});

test('muestra el error de Cloudflare si el token no sirve', async () => {
  respuestas.graphql = () => jsonRes({ data: null, errors: [{ message: 'not authorized' }] }, 200);
  const data = await (await run({ ...env, CF_API_TOKEN: 'x', CF_ACCOUNT_ID: 'y' })).json();
  assert.equal(data.visitas.error, 'not authorized');
});

test('«hoy» empieza a medianoche de Venezuela', () => {
  assert.equal(inicioDeHoyVE(Date.parse('2026-10-18T21:00:00Z')).toISOString(), '2026-10-18T04:00:00.000Z');
  assert.equal(inicioDeHoyVE(Date.parse('2026-10-19T02:00:00Z')).toISOString(), '2026-10-18T04:00:00.000Z');
});
