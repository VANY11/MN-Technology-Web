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
      {
        code: 'LAP-001', name: 'Laptop 14', brand: 'Lenovo', model: 'IdeaPad', color: null,
        ram: '16GB', storage: '512GB', price: '549.00', price_ves: null, price_cop: '2200000.00',
        stock: 7, foto_url: 'https://x/l.jpg', cost: '400.00', imei: '123',
      },
      { code: 'MON-024', name: 'Monitor 24', price: '159.00', stock: -2 },
    ],
  });
  await withServer(query, async (base) => {
    const res = await fetch(`${base}/stock`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [
      {
        codigo: 'LAP-001', nombre: 'Laptop 14', marca: 'Lenovo', modelo: 'IdeaPad', color: null,
        ram: '16GB', almacenamiento: '512GB', precio: 549, precio_ves: null, precio_cop: 2200000,
        disponible: 7, foto: 'https://x/l.jpg',
      },
      {
        codigo: 'MON-024', nombre: 'Monitor 24', marca: null, modelo: null, color: null,
        ram: null, almacenamiento: null, precio: 159, precio_ves: null, precio_cop: null,
        disponible: 0, foto: null,
      },
    ]);
  });
});

test('la consulta solo lee columnas públicas de productos activos con stock', async () => {
  let seen;
  await withServer(async (sql) => { seen = sql; return { rows: [] }; }, async (base) => {
    await fetch(`${base}/stock`);
  });
  assert.match(seen, /^\s*SELECT/i);
  assert.match(seen, /FROM mnstore_products/);
  assert.match(seen, /is_active AND NOT maranet_only AND stock > 0/);
  assert.doesNotMatch(seen, /\b(cost|imei|serial_number|supplier_id|maranet_stock)\b/);
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
