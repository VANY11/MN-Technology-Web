import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHandler } from '../src/app.js';

async function withServer(query, fn) {
  const silent = { error() {} };
  const server = http.createServer(createHandler({ query, log: silent }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('GET /stock devuelve solo los campos públicos', async () => {
  const query = async () => ({
    rows: [
      { sku: 'LAP-001', name: 'Laptop 14', price: '549.00', stock: 7, cost: '400.00' },
      { sku: 'MON-024', name: 'Monitor 24', price: '159.00', stock: -2 },
    ],
  });
  await withServer(query, async (base) => {
    const res = await fetch(`${base}/stock`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [
      { sku: 'LAP-001', nombre: 'Laptop 14', precio: 549, disponible: 7 },
      { sku: 'MON-024', nombre: 'Monitor 24', precio: 159, disponible: 0 },
    ]);
  });
});

test('la consulta solo lee mnstore_products', async () => {
  let seen;
  await withServer(async (sql) => { seen = sql; return { rows: [] }; }, async (base) => {
    await fetch(`${base}/stock`);
  });
  assert.match(seen, /^\s*SELECT/i);
  assert.match(seen, /FROM mnstore_products/);
  assert.doesNotMatch(seen, /INSERT|UPDATE|DELETE|mnstore_serials/i);
});

test('rechaza métodos que no son GET', async () => {
  await withServer(async () => ({ rows: [] }), async (base) => {
    const res = await fetch(`${base}/stock`, { method: 'POST' });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET');
  });
});

test('responde 503 sin detalles si la base falla', async () => {
  const query = async () => { throw new Error('password authentication failed for user x'); };
  await withServer(query, async (base) => {
    const res = await fetch(`${base}/stock`);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'Stock no disponible' });
  });
});

test('/health responde y otras rutas dan 404', async () => {
  await withServer(async () => ({ rows: [] }), async (base) => {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/otra`)).status, 404);
  });
});
