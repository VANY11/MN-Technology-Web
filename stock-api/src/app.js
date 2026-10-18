import { STOCK_SQL, PHOTO_SQL, PROMOS_SQL, toPublicItem, toPublicPromo, localPhotoPath } from './query.js';

// Sin la vista de promociones (MN Tech aún sin el módulo) o sin permiso sobre ella: no hay promociones.
const SIN_PROMOS = new Set(['42P01', '42501']);

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = /^image\/(jpeg|png|webp|gif|avif)$/;

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

// photoOrigin: la app MN Tech local (nginx), que ya sirve las fotos que sube Yvan.
export function createHandler({ query, fetchPhoto = fetch, photoOrigin = 'http://127.0.0.1:1107', log = console }) {
  async function photo(res, code) {
    let path;
    try {
      const { rows } = await query(PHOTO_SQL, [code]);
      path = localPhotoPath(rows[0]?.foto_url);
    } catch (err) {
      log.error('Error leyendo la foto:', err.message);
      return send(res, 503, { error: 'Foto no disponible' });
    }
    if (!path) return send(res, 404, { error: 'Sin foto' });

    try {
      const upstream = await fetchPhoto(new URL(path, photoOrigin), { redirect: 'error' });
      const type = (upstream.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      if (!upstream.ok || !PHOTO_TYPES.test(type)) {
        log.error(`Foto rechazada ${path}: HTTP ${upstream.status} ${type || 'sin Content-Type'}`);
        return send(res, 404, { error: 'Sin foto' });
      }
      const body = Buffer.from(await upstream.arrayBuffer());
      if (body.length > MAX_PHOTO_BYTES) return send(res, 404, { error: 'Sin foto' });
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': body.length,
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.end(body);
    } catch (err) {
      log.error('Error trayendo la foto:', err.message);
      return send(res, 503, { error: 'Foto no disponible' });
    }
  }

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

    if (pathname === '/promociones') {
      try {
        const { rows } = await query(PROMOS_SQL);
        return send(res, 200, rows.map(toPublicPromo).filter(Boolean));
      } catch (err) {
        if (SIN_PROMOS.has(err.code)) return send(res, 200, []);
        log.error('Error leyendo las promociones:', err.message);
        return send(res, 503, { error: 'Promociones no disponibles' });
      }
    }

    const fotoMatch = pathname.match(/^\/foto\/([^/]{1,64})$/);
    if (fotoMatch) {
      let code;
      try {
        code = decodeURIComponent(fotoMatch[1]);
      } catch {
        return send(res, 404, { error: 'No encontrado' });
      }
      return photo(res, code);
    }

    return send(res, 404, { error: 'No encontrado' });
  };
}
