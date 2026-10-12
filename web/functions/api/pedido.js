// Función de Cloudflare Pages en /api/pedido: recibe el pedido del carrito y lo guarda en el sistema MN Tech
// (pantalla «Pedidos web»). Lo reenvía por el túnel a POST /api/pedidos-web/entrada de la app, con el token de
// servicio de Cloudflare Access y la clave PEDIDOS_TOKEN (la misma que PEDIDOS_WEB_TOKEN en el .env del servidor).
// La app recalcula precios y disponibilidad desde su base: de aquí solo pasan códigos, cantidades y datos del cliente.
//
// Variables del proyecto de Pages:
//   PEDIDOS_API_URL          https://pedidos-api.mntechve.com/api/pedidos-web/entrada   (texto)
//   PEDIDOS_TOKEN            clave compartida con el servidor                           (secreto)
//   CF_ACCESS_CLIENT_ID      Client ID del token worker-web (el mismo del stock)        (secreto)
//   CF_ACCESS_CLIENT_SECRET  Client Secret del token worker-web                         (secreto)
// GET /api/pedido dice si los pedidos están activos; sin esas variables la web ofrece WhatsApp o copiar el pedido.

const MAX_BYTES = 20000;
const CAMPOS = { nombre: 80, telefono: 30, cedula: 20, entrega: 60, direccion: 200, pago: 60, notas: 300 };

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const VARIABLES = ['PEDIDOS_API_URL', 'PEDIDOS_TOKEN', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET'];
const faltantes = (env) => VARIABLES.filter((k) => !env[k]);
const configurado = (env) => faltantes(env).length === 0;

// Si falta alguna variable, dice cuáles (solo los nombres, nunca los valores) para revisar el entorno de Pages.
export function onRequestGet({ env }) {
  const faltan = faltantes(env);
  return json(faltan.length ? { activo: false, faltan } : { activo: true }, 200);
}

export async function onRequestPost({ env, request }) {
  if (!configurado(env)) return json({ error: 'Los pedidos en línea no están activos' }, 503);

  // Solo desde la propia web (otro sitio no puede mandar pedidos en nombre de un visitante).
  let mismoSitio = false;
  try {
    mismoSitio = new URL(request.headers.get('Origin')).host === new URL(request.url).host;
  } catch {}
  if (!mismoSitio) return json({ error: 'Origen no permitido' }, 403);
  if (!request.headers.get('Content-Type')?.includes('application/json')) return json({ error: 'Formato no válido' }, 415);

  const raw = await request.text();
  if (raw.length > MAX_BYTES) return json({ error: 'Pedido demasiado grande' }, 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Formato no válido' }, 400);
  }
  if (!body || typeof body !== 'object') return json({ error: 'Formato no válido' }, 400);
  // Campo trampa: invisible para las personas; los robots que llenan todo lo completan.
  if (body.sitio) return json({ error: 'Pedido rechazado' }, 400);

  const pedido = { moneda: ['USD', 'VES', 'COP'].includes(body.moneda) ? body.moneda : 'USD' };
  for (const [k, max] of Object.entries(CAMPOS)) {
    if (typeof body[k] === 'string') pedido[k] = body[k].trim().slice(0, max);
  }
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) {
    return json({ error: 'El pedido no tiene productos' }, 400);
  }
  pedido.items = body.items.map((it) => ({ codigo: String(it?.codigo ?? '').slice(0, 60), cantidad: Number(it?.cantidad) }));

  let upstream;
  try {
    upstream = await fetch(env.PEDIDOS_API_URL, {
      method: 'POST',
      headers: {
        'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET,
        'X-Pedidos-Token': env.PEDIDOS_TOKEN,
        'X-Cliente-IP': request.headers.get('CF-Connecting-IP') || '',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(pedido),
      redirect: 'manual',
    });
  } catch {
    upstream = null;
  }

  const isJson = upstream?.headers.get('Content-Type')?.includes('application/json');
  const data = isJson ? await upstream.json().catch(() => null) : null;
  if (upstream && data && upstream.status === 201 && data.numero) {
    return json({ numero: data.numero, total_usd: data.total_usd, moneda: data.moneda, total_moneda: data.total_moneda }, 201);
  }
  // Errores del pedido (datos, stock, demasiados seguidos): el mensaje de la app es para el cliente.
  if (upstream && data?.error && [400, 409, 429].includes(upstream.status)) {
    return json({ error: data.error, faltan: data.faltan }, upstream.status);
  }
  return json({ error: 'No pudimos recibir tu pedido en este momento' }, 503);
}
