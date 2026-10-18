import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHandler } from '../src/app.js';

async function withServer(query, fn, opts = {}) {
  const silent = { error() {} };
  const server = http.createServer(createHandler({ query, log: silent, ...opts }));
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
        stock: 7, foto_url: 'https://x/l.jpg', cost: '400.00', imei: '123', category: 'Laptops',
        template_fields: [{ key: 'tipo', label: 'Tipo', type: 'select' }, { key: 'pantalla', label: 'Pantalla' }, { key: 'vacio', label: 'Vacío' }],
        specs: { tipo: 'Ultrabook', pantalla: 14, vacio: ' ', clave_interna: 'no sale' },
      },
      { code: 'MON-024', name: 'Monitor 24', price: '159.00', stock: -2 },
      { code: 'TEL 1', name: 'Tel', price: null, stock: 1, foto_url: '/uploads/a.jpg' },
      { code: 'X', name: 'X', price: null, stock: 1, foto_url: '/uploads/../../etc/passwd' },
    ],
  });
  await withServer(query, async (base) => {
    const res = await fetch(`${base}/stock`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.slice(0, 2), [
      {
        codigo: 'LAP-001', nombre: 'Laptop 14', categoria: 'Laptops', marca: 'Lenovo', modelo: 'IdeaPad', color: null,
        ram: '16GB', almacenamiento: '512GB', precio: 549, precio_ves: null, precio_cop: 2200000,
        disponible: 7, foto: 'https://x/l.jpg',
        especificaciones: [{ campo: 'Tipo', valor: 'Ultrabook' }, { campo: 'Pantalla', valor: '14' }],
      },
      {
        codigo: 'MON-024', nombre: 'Monitor 24', categoria: null, marca: null, modelo: null, color: null,
        ram: null, almacenamiento: null, precio: 159, precio_ves: null, precio_cop: null,
        disponible: 0, foto: null, especificaciones: [],
      },
    ]);
    const [, , tel, bad] = body;
    assert.match(tel.foto, /^\/api\/foto\/TEL%201\?v=[0-9a-f]{10}$/);
    assert.equal(bad.foto, null);
  });
});

test('la consulta solo lee columnas públicas de productos activos con stock', async () => {
  let seen;
  await withServer(async (sql) => { seen = sql; return { rows: [] }; }, async (base) => {
    await fetch(`${base}/stock`);
  });
  assert.match(seen, /^\s*SELECT/i);
  assert.match(seen, /FROM mnstore_products p/);
  assert.match(seen, /LEFT JOIN mnstore_categories c ON c.id = p.category_id/);
  assert.match(seen, /p.is_active AND NOT p.maranet_only AND p.stock > 0/);
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

test('GET /foto/:codigo trae la foto de la app local solo para productos publicados', async () => {
  let asked;
  const query = async (sql, params) => {
    asked = params;
    assert.match(sql, /p.code = \$1 AND p.is_active AND NOT p.maranet_only AND p.stock > 0/);
    return { rows: params[0] === 'TEL 1' ? [{ foto_url: '/uploads/a.jpg' }] : [] };
  };
  let fetched;
  const fetchPhoto = async (url) => {
    fetched = String(url);
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
  };
  await withServer(query, async (base) => {
    const res = await fetch(`${base}/foto/TEL%201`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=86400');
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), new Uint8Array([1, 2, 3]));
    assert.deepEqual(asked, ['TEL 1']);
    assert.equal(fetched, 'http://127.0.0.1:1107/uploads/a.jpg');

    assert.equal((await fetch(`${base}/foto/OTRO`)).status, 404);
  }, { fetchPhoto });
});

test('/foto no devuelve algo que no sea imagen', async () => {
  const query = async () => ({ rows: [{ foto_url: '/uploads/a.jpg' }] });
  const fetchPhoto = async () => new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } });
  await withServer(query, async (base) => {
    assert.equal((await fetch(`${base}/foto/A`)).status, 404);
  }, { fetchPhoto });
});

test('GET /promociones lee solo la vista y manda los campos públicos', async () => {
  let sql = '';
  const query = async (q) => {
    sql = q;
    return {
      rows: [
        { id: 3, tipo: 'producto', titulo: ' A16 en oferta ', texto: null, etiqueta: '-15%', producto_code: 'MN-0730', marca: 'x', categoria: null, categorias: [], descuento_tipo: 'precio', descuento_valor: '160.00', precio_oferta: '160.00', lugares: ['nuevos', 'otro', 'vitrina'], category_ids: null },
        { id: 4, tipo: 'categoria', titulo: 'Forros', texto: 'Todos', etiqueta: null, producto_code: null, marca: null, categoria: 'Accesorios', categorias: ['Accesorios', 'Forros'], descuento_tipo: 'porcentaje', descuento_valor: '10', precio_oferta: null },
        { id: 5, tipo: 'raro', titulo: 'x' },
        { id: 6, tipo: 'aviso', titulo: '  ', descuento_tipo: 'ninguno' },
      ],
    };
  };
  await withServer(query, async (base) => {
    const body = await (await fetch(`${base}/promociones`)).json();
    assert.match(sql, /FROM web_promociones_vigentes v/);
    assert.doesNotMatch(sql, /v\.lugares/);
    assert.doesNotMatch(sql, /FROM web_promociones\b(?!_)/);
    assert.deepEqual(body, [
      { id: 3, tipo: 'producto', titulo: 'A16 en oferta', texto: null, etiqueta: '-15%', producto: 'MN-0730', marca: null, categoria: null, categorias: [], descuento: 'precio', porcentaje: null, precio_oferta: 160, lugares: ['vitrina', 'nuevos'] },
      { id: 4, tipo: 'categoria', titulo: 'Forros', texto: 'Todos', etiqueta: null, producto: null, marca: null, categoria: 'Accesorios', categorias: ['Accesorios', 'Forros'], descuento: 'porcentaje', porcentaje: 10, precio_oferta: null, lugares: ['vitrina', 'destacados'] },
    ]);
  });
});

test('sin la vista de promociones responde una lista vacía; otro error, 503', async () => {
  const fail = (code) => async () => { throw Object.assign(new Error('x'), { code }); };
  await withServer(fail('42P01'), async (base) => assert.deepEqual(await (await fetch(`${base}/promociones`)).json(), []));
  await withServer(fail('42501'), async (base) => assert.deepEqual(await (await fetch(`${base}/promociones`)).json(), []));
  await withServer(fail('57014'), async (base) => assert.equal((await fetch(`${base}/promociones`)).status, 503));
});
