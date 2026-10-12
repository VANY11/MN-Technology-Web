import http from 'node:http';
import pg from 'pg';
import { createHandler } from './app.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8080);

// Sin contraseña: se conecta por el socket local con autenticación "peer",
// así que el usuario del sistema y el rol de PostgreSQL se llaman igual (mnstock).
const pool = new pg.Pool({
  host: process.env.PGHOST || '/var/run/postgresql',
  database: process.env.PGDATABASE || 'mn_technology',
  user: process.env.PGUSER || 'mnstock',
  max: 3,
  // Segunda barrera además de los permisos del rol: toda transacción es de solo lectura.
  options: '-c default_transaction_read_only=on -c statement_timeout=5000',
});

const server = http.createServer(
  createHandler({
    query: (sql, params) => pool.query(sql, params),
    photoOrigin: process.env.PHOTO_ORIGIN || 'http://127.0.0.1:1107',
  }),
);

server.listen(port, host, () => {
  console.log(`API de stock escuchando en http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
