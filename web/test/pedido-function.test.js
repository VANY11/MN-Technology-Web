import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../functions/api/pedido.js';

const env = {
  PEDIDOS_API_URL: 'https://pedidos-api.example.com/api/pedidos-web/entrada',
  PEDIDOS_TOKEN: 'clave-compartida',
  CF_ACCESS_CLIENT_ID: 'id.access',
  CF_ACCESS_CLIENT_SECRET: 'secreto',
};
const body = { nombre: 'Ana', apellido: 'Pérez', cedula: 'v-12.345.678', telefono: '0412 123 4567', moneda: 'VES', items: [{ codigo: 'T001', cantidad: 2 }], precio: 1 };
const req = (b = body, headers = {}) =>
  new Request('https://mntechve.com/api/pedido', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://mntechve.com', 'CF-Connecting-IP': '1.2.3.4', ...headers },
    body: typeof b === 'string' ? b : JSON.stringify(b),
  });
let calls;
let reply;

beforeEach(() => {
  calls = [];
  reply = () => new Response(JSON.stringify({ numero: 'PW000001', total_usd: '50.00', moneda: 'VES', total_moneda: '18000.00' }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return reply(); };
});

test('dice si los pedidos están activos', async () => {
  assert.deepEqual(await (await onRequestGet({ env })).json(), { activo: true });
  assert.deepEqual(await (await onRequestGet({ env: { ...env, PEDIDOS_TOKEN: '' } })).json(), { activo: false, faltan: ['PEDIDOS_TOKEN'] });
});

test('reenvía el pedido con los tokens y solo los campos permitidos', async () => {
  const res = await onRequestPost({ env, request: req() });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).numero, 'PW000001');
  const { url, init } = calls[0];
  assert.equal(url, env.PEDIDOS_API_URL);
  assert.equal(init.headers['X-Pedidos-Token'], 'clave-compartida');
  assert.equal(init.headers['CF-Access-Client-Id'], 'id.access');
  assert.equal(init.headers['X-Cliente-IP'], '1.2.3.4');
  const sent = JSON.parse(init.body);
  assert.equal(sent.precio, undefined);
  assert.equal(sent.nombre, 'Ana Pérez');
  assert.equal(sent.apellido, undefined);
  assert.equal(sent.cedula, 'V12345678');
  assert.equal(sent.telefono, '0412-1234567');
  assert.deepEqual(sent.items, [{ codigo: 'T001', cantidad: 2 }]);
  assert.equal(sent.moneda, 'USD'); // aunque llegue VES: la tienda vende solo en dólares
});

test('rechaza pedidos de otro sitio, sin configurar o con el campo trampa', async () => {
  assert.equal((await onRequestPost({ env, request: req(body, { Origin: 'https://otro.com' }) })).status, 403);
  assert.equal((await onRequestPost({ env: {}, request: req() })).status, 503);
  assert.equal((await onRequestPost({ env, request: req({ ...body, sitio: 'x' }) })).status, 400);
  assert.equal((await onRequestPost({ env, request: req('no es json') })).status, 400);
  assert.equal(calls.length, 0);
});

test('pasa el mensaje de stock agotado y oculta otros errores', async () => {
  reply = () => new Response(JSON.stringify({ error: 'Ya no hay disponible: X', faltan: ['X'] }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  const r1 = await onRequestPost({ env, request: req() });
  assert.equal(r1.status, 409);
  assert.equal((await r1.json()).error, 'Ya no hay disponible: X');
  reply = () => new Response('<html>login</html>', { status: 302, headers: { 'Content-Type': 'text/html' } });
  assert.equal((await onRequestPost({ env, request: req() })).status, 503);
});

test('exige nombre, apellido, cédula y un celular venezolano', async () => {
  for (const malo of [{ nombre: '' }, { apellido: '' }, { apellido: '123' }, { cedula: '' }, { cedula: 'J123' }, { telefono: '' }, { telefono: '02121234567' }, { telefono: '0413 123 4567' }, { telefono: '0412 123' }]) {
    const res = await onRequestPost({ env, request: req({ ...body, ...malo }) });
    assert.equal(res.status, 400, JSON.stringify(malo));
    assert.ok((await res.json()).error);
  }
  assert.equal(calls.length, 0);
});
