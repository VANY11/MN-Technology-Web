# API de stock (solo lectura)

Servicio pequeño que corre en el servidor de MN Tech (Ubuntu) y responde el stock en JSON
para la web pública. Cloudflare Tunnel lo publica en `api-stock.mntechve.com`, protegido con
Cloudflare Access; nunca se abre un puerto en el router.

- Escucha solo en `127.0.0.1:8080` (la app `mn-technology` sigue en el 1107 detrás de nginx).
- Lee la base propia `mn_technology`, nunca las tablas `mnstore_*` de MaraNet.
- Entra con el rol `mnstock`, que solo puede hacer `SELECT` en `mnstore_products`
  y además tiene todas sus transacciones en modo solo lectura.
- Devuelve `sku`, `nombre`, `precio` y `disponible`. Nada de costos ni seriales.

## Respuesta

`GET /stock`

```json
[
  { "sku": "LAP-001", "nombre": "Laptop 14", "precio": 549, "disponible": 7 }
]
```

`GET /health` responde `{"ok": true}`. Cualquier otro método da 405.

## Antes de instalar

La consulta está en [`src/query.js`](src/query.js) y asume que `mnstore_products` tiene las
columnas `sku`, `name`, `price` y `stock`. Confírmalo en el servidor:

```bash
sudo -u postgres psql -d mn_technology -c '\d mnstore_products'
```

Si los nombres son otros, se cambian solo en ese archivo.

## Instalación en el servidor (Ubuntu)

```bash
# 1. Usuario del sistema sin login, con el mismo nombre que el rol de PostgreSQL
sudo useradd --system --no-create-home --shell /usr/sbin/nologin mnstock

# 2. Código en /opt/mn-stock-api
sudo git clone https://github.com/VANY11/MN-Technology-Web.git /tmp/mn-web
sudo cp -r /tmp/mn-web/stock-api /opt/mn-stock-api
cd /opt/mn-stock-api && sudo npm ci --omit=dev
sudo chown -R root:root /opt/mn-stock-api

# 3. Rol de solo lectura en PostgreSQL
sudo -u postgres psql -d mn_technology -f /opt/mn-stock-api/deploy/rol-solo-lectura.sql

# 4. Servicio
sudo cp /opt/mn-stock-api/deploy/mn-stock-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mn-stock-api

# 5. Prueba local
curl http://127.0.0.1:8080/stock
```

La conexión a PostgreSQL usa el socket local con autenticación `peer`, que es la configuración
por defecto de Ubuntu (`local all all peer` en `pg_hba.conf`), así que no hay contraseña que guardar.

## Desarrollo

```bash
npm install
npm test
```
