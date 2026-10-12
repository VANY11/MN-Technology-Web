-- Agrega a un rol mnstock ya creado los permisos de categorías (si instalaste antes de este cambio).
--   sudo -u postgres psql -d mn_technology -f permisos-categorias.sql
GRANT SELECT (category_id) ON public.mnstore_products TO mnstock;
GRANT SELECT (id, name) ON public.mnstore_categories TO mnstock;
