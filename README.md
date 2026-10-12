# MN Technology Web

Sitio público de MN Tech. La web se publica en Cloudflare Pages y el stock llega desde el
servidor local de MN Tech por Cloudflare Tunnel.

- [`stock-api/`](stock-api/): API de solo lectura que corre en el servidor local.
- [`web/`](web/): sitio para Cloudflare Pages. `public/` es la web estática y
  `functions/api/stock.js` es el Worker que lee el stock por el túnel con el token de Access.
