import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/foto/[code].js';

const env = {
  STOCK_API_URL: 'https://api-stock.example.com/stock',
  CF_ACCESS_CLIENT_ID: 'id.access',
  CF_ACCESS_CLIENT_SECRET: 'secreto',
};
let store;

beforeEach(() => {
  store = new Map();
  globalThis.caches = {
    default: {
      match: async (req) => store.get(req.url)?.clone(),
      put: async (req, res) => { store.set(req.url, res); },
    },
  };
});

const run = async (code, v = 'abc', ctxEnv = env) => {
  const pending = [];
  const request = new Request(`https://mntechve.com/api/foto/${encodeURIComponent(code)}?v=${v}`);
  const res = await onRequestGet({ env: ctxEnv, request, params: { code }, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return res;
};

test('pide la foto por el túnel con el token de Access y la cachea un día', async () => {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), 'https://api-stock.example.com/foto/TEL%201');
    assert.equal(init.headers['CF-Access-Client-Id'], 'id.access');
    return new Response(new Uint8Array([9, 9]), { headers: { 'Content-Type': 'image/png' } });
  };
  const res = await run('TEL 1');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'image/png');
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=86400');
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), new Uint8Array([9, 9]));

  await run('TEL 1');
  assert.equal(calls, 1, 'la segunda vez sale de la caché');
  await run('TEL 1', 'nueva');
  assert.equal(calls, 2, 'otra versión de la foto se vuelve a pedir');
});

test('no entrega nada que no sea imagen (p. ej. el login de Access)', async () => {
  globalThis.fetch = async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } });
  const res = await run('A');
  assert.equal(res.status, 503);
  assert.equal(store.size, 0);
});

test('si el producto no tiene foto responde 404', async () => {
  globalThis.fetch = async () => Response.json({ error: 'Sin foto' }, { status: 404 });
  assert.equal((await run('A')).status, 404);
});
