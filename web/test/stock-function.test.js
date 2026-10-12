import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/stock.js';

const env = {
  STOCK_API_URL: 'https://api-stock.example.com/stock',
  CF_ACCESS_CLIENT_ID: 'id.access',
  CF_ACCESS_CLIENT_SECRET: 'secreto',
};
const request = new Request('https://mntechve.com/api/stock?x=1');
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

const run = async (ctxEnv = env) => {
  const pending = [];
  const res = await onRequestGet({ env: ctxEnv, request, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return res;
};

test('envía el token de Access y devuelve el stock con caché', async () => {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, env.STOCK_API_URL);
    assert.equal(init.headers['CF-Access-Client-Id'], 'id.access');
    assert.equal(init.headers['CF-Access-Client-Secret'], 'secreto');
    return Response.json([{ codigo: 'A1', disponible: 3 }]);
  };
  const res = await run();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=60');
  assert.deepEqual(await res.json(), [{ codigo: 'A1', disponible: 3 }]);

  const again = await run();
  assert.deepEqual(await again.json(), [{ codigo: 'A1', disponible: 3 }]);
  assert.equal(calls, 1, 'la segunda vez sale de la caché');
});

test('si Access redirige al login responde 503 y no cachea', async () => {
  globalThis.fetch = async () =>
    new Response('', { status: 302, headers: { Location: 'https://x.cloudflareaccess.com/login' } });
  const res = await run();
  assert.equal(res.status, 503);
  assert.equal(store.size, 0);
});

test('si el servidor está caído responde 503', async () => {
  globalThis.fetch = async () => { throw new Error('network'); };
  assert.equal((await run()).status, 503);
});

test('sin variables configuradas responde 500 sin llamar al servidor', async () => {
  globalThis.fetch = async () => assert.fail('no debe llamar');
  assert.equal((await run({})).status, 500);
});
