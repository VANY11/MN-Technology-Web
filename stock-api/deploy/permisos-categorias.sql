-- Agrega a un rol mnstock ya creado los permisos de categorías y especificaciones
-- (si instalaste antes de este cambio).
--   sudo -u postgres psql -d mn_technology -f permisos-categorias.sql
GRANT SELECT (category_id, specs) ON public.mnstore_products TO mnstock;
GRANT SELECT (id, name, template_fields) ON public.mnstore_categories TO mnstock;
