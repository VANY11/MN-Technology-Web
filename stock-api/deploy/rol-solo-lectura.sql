-- Rol de PostgreSQL de solo lectura para la API de stock.
-- Ejecutar una vez en el servidor de MN Tech:
--   sudo -u postgres psql -d mn_technology -f rol-solo-lectura.sql
-- Sin contraseña: entra por el socket local con autenticación "peer" (usuario del sistema mnstock).

CREATE ROLE mnstock LOGIN;

ALTER ROLE mnstock SET default_transaction_read_only = on;

GRANT CONNECT ON DATABASE mn_technology TO mnstock;
GRANT USAGE ON SCHEMA public TO mnstock;

-- Solo la tabla de productos. Nada de seriales, clientes ni ventas.
GRANT SELECT ON public.mnstore_products TO mnstock;
