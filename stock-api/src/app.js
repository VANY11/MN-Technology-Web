import { STOCK_SQL, toPublicItem } from './query.js';

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

export function createHandler({ query, log = console }) {
  return async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return send(res, 405, { error: 'Solo se permite GET' });
    }

    if (pathname === '/health') {
      return send(res, 200, { ok: true });
    }

    if (pathname === '/stock') {
      try {
        const { rows } = await query(STOCK_SQL);
        return send(res, 200, rows.map(toPublicItem));
      } catch (err) {
        log.error('Error leyendo el stock:', err.message);
        return send(res, 503, { error: 'Stock no disponible' });
      }
    }

    return send(res, 404, { error: 'No encontrado' });
  };
}
