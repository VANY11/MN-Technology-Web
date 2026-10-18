import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/promociones.js';

const env = { STOCK_API_URL: 'https://api-stock.example.com/stock', CF_ACCESS_CLIENT_ID: 'id', CF_ACCESS_CLIENT_SECRET: 'secreto' };
const ctx = () => ({ env, request: new Request('https://mntechve.com/api/promociones'), waitUntil: () => {} });

test('trae las promociones del servidor con el token de Access', async () => {
  let pedido;
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  globalThis.fetch = async (url, init) => {
    pedido = { url: String(url), init };
    return new Response('[{"id":1,"tipo":"aviso","titulo":"Hola"}]', { headers: { 'Content-Type': 'application/json' } });
  };
  const res = await onRequestGet(ctx());
  assert.deepEqual(await res.json(), [{ id: 1, tipo: 'aviso', titulo: 'Hola' }]);
  assert.equal(pedido.url, 'https://api-stock.example.com/promociones');
  assert.equal(pedido.init.headers['CF-Access-Client-Id'], 'id');
  assert.match(res.headers.get('Cache-Control'), /max-age=60/);
});

test('si el servidor falla, lista vacía sin guardar en caché', async () => {
  globalThis.caches = { default: { match: async () => undefined, put: async () => { throw new Error('no'); } } };
  globalThis.fetch = async () => new Response('<html>', { status: 403, headers: { 'Content-Type': 'text/html' } });
  const res = await onRequestGet(ctx());
  assert.deepEqual(await res.json(), []);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});
