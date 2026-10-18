import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, metaProducto, conMeta } from '../functions/p/[code].js';

const HTML = '<html><head>\n  <title>MN Technology · Tienda</title>\n  <meta name="description" content="Catálogo">\n</head><body></body></html>';
const items = [
  { codigo: 'MN-0730', nombre: 'SAMSUNG A16 4+128', precio: 185, disponible: 2, foto: '/api/foto/MN-0730?v=abc' },
  { codigo: 'TEL 1', nombre: 'Forro "rosa" <b> $& 50%', precio: null, disponible: 1, foto: null },
];

function contexto(code, stock = items) {
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  globalThis.fetch = async () =>
    new Response(JSON.stringify(stock), { status: 200, headers: { 'Content-Type': 'application/json' } });
  return {
    params: { code },
    request: new Request(`https://mntechve.com/p/${encodeURIComponent(code)}`),
    waitUntil: () => {},
    env: {
      STOCK_API_URL: 'https://api-stock.example.com/stock',
      CF_ACCESS_CLIENT_ID: 'id',
      CF_ACCESS_CLIENT_SECRET: 'secreto',
      ASSETS: { fetch: async () => new Response(HTML, { status: 200, headers: { 'Content-Type': 'text/html' } }) },
    },
  };
}

test('el enlace de un producto lleva su nombre, precio y foto para la vista previa', async () => {
  const res = await onRequestGet(contexto('MN-0730'));
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /<title>SAMSUNG A16 4\+128 · MN Technology<\/title>/);
  assert.match(html, /<meta property="og:title" content="SAMSUNG A16 4\+128">/);
  assert.match(html, /<meta property="og:description" content="USD[^"]*185,00 · 2 disponibles · MN Technology">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/mntechve.com\/api\/foto\/MN-0730\?v=abc">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/mntechve.com\/p\/MN-0730">/);
  assert.equal((html.match(/<title>/g) || []).length, 1);
});

test('escapa el texto del producto y no usa patrones de reemplazo', () => {
  const html = conMeta(HTML, metaProducto(items[1], 'https://mntechve.com'));
  assert.match(html, /content="Forro &quot;rosa&quot; &lt;b&gt; \$&amp; 50%"/);
  assert.match(html, /og:url" content="https:\/\/mntechve.com\/p\/TEL%201"/);
  assert.doesNotMatch(html, /og:image/);
  assert.match(html, /twitter:card" content="summary"/);
});

test('un producto que ya no está devuelve la tienda sin cambios', async () => {
  const res = await onRequestGet(contexto('NO-EXISTE'));
  assert.equal(await res.text(), HTML);
});

test('si el stock no responde, igual se ve la tienda', async () => {
  const ctx = contexto('MN-0730');
  globalThis.fetch = async () => new Response('caído', { status: 502 });
  const res = await onRequestGet(ctx);
  assert.equal(await res.text(), HTML);
});
