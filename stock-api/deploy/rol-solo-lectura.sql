-- Rol de PostgreSQL de solo lectura para la API de stock.
-- Ejecutar una vez en el servidor de MN Tech:
--   sudo -u postgres psql -d mn_technology -f rol-solo-lectura.sql
-- Sin contraseña: entra por el socket local con autenticación "peer" (usuario del sistema mnstock).

CREATE ROLE mnstock LOGIN;

ALTER ROLE mnstock SET default_transaction_read_only = on;

GRANT CONNECT ON DATABASE mn_technology TO mnstock;
GRANT USAGE ON SCHEMA public TO mnstock;

-- Solo las columnas públicas de productos. Sin cost, imei, serial_number,
-- supplier_id ni maranet_stock: aunque alguien cambie la consulta, no puede leerlas.
GRANT SELECT (
  code, name, brand, model, color, ram, storage,
  price, price_ves, price_cop, stock, foto_url,
  is_active, publicado, maranet_only
) ON public.mnstore_products TO mnstock;
