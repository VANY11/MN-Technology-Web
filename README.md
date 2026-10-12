# MN Technology Web

Sitio público de MN Tech. La web se publica en Cloudflare Pages y el stock llega desde el
servidor local de MN Tech por Cloudflare Tunnel.

- [`stock-api/`](stock-api/): API de solo lectura que corre en el servidor local.
- [`web/`](web/): sitio para Cloudflare Pages. `public/` es la web estática y
  `functions/api/stock.js` es el Worker que lee el stock por el túnel con el token de Access.
- `functions/api/pedido.js`: recibe los pedidos del carrito y los guarda en el sistema MN Tech (pantalla
  *Pedidos web*) por el túnel, en `POST /api/pedidos-web/entrada` de la app. Nunca escribe por la API de stock.

## Pedidos en línea

Sin configurar, el carrito envía el pedido por WhatsApp (o lo copia). Para que quede guardado en el servidor:

1. En el servidor, `PEDIDOS_WEB_TOKEN` en `backend/.env` de la app MN Tech (clave larga al azar) y actualizar la
   app (trae la tabla `web_pedidos` y la pantalla *Pedidos web*, permiso `pedidos_web`).
2. En el túnel `mntech-server`, una ruta pública `pedidos-api.mntechve.com` con la ruta (path)
   `^/api/pedidos-web/entrada$` hacia `http://localhost:1107`. Cualquier otra dirección de ese nombre responde 404.
3. Ese nombre protegido por Cloudflare Access con la misma política de token de servicio que `api-stock`.
4. En el proyecto de Pages: `PEDIDOS_API_URL` = `https://pedidos-api.mntechve.com/api/pedidos-web/entrada` y el
   secreto `PEDIDOS_TOKEN` (el mismo valor de `PEDIDOS_WEB_TOKEN`). `GET /api/pedido` dice `{"activo": true}`.

La app recalcula precios y disponibilidad con su base, no aparta ni descuenta stock, limita 5 pedidos por IP cada 10
minutos y avisa por Telegram (evento *Pedido web nuevo*).
