-- =============================================================================
-- Wave 32: Fix 404s on send-notification and get_similar_products (pg_trgm)
-- - Seeds default disabled messaging_config row for company so send-notification
--   returns HTTP 200 ("No channels enabled") instead of HTTP 404.
-- - Fixes search_path on get_similar_products, get_potential_duplicates, and
--   search_inventory to include 'extensions' where pg_trgm's similarity() lives.
-- =============================================================================

INSERT INTO public.messaging_config (
  company_id,
  telegram_enabled,
  whatsapp_enabled,
  sms_enabled
)
SELECT '7f3a9c21-5b4e-4d8a-9e12-6c0d3b8a5f47', false, false, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.messaging_config
  WHERE company_id = '7f3a9c21-5b4e-4d8a-9e12-6c0d3b8a5f47'
);

CREATE OR REPLACE FUNCTION public.get_similar_products(p_name text, p_company_id uuid)
 RETURNS TABLE(id uuid, name_ar text, similarity_score real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.name_ar::text, extensions.similarity(p.name_ar, p_name) AS similarity_score
  FROM public.products p
  WHERE p.company_id = p_company_id
    AND COALESCE(p.status, 'active') <> 'archived'
    AND p.deleted_at IS NULL
    AND extensions.similarity(p.name_ar, p_name) > 0.3
  ORDER BY extensions.similarity(p.name_ar, p_name) DESC
  LIMIT 5;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_similar_products(text, uuid) TO authenticated, service_role;

ALTER FUNCTION public.get_potential_duplicates(uuid, text) SET search_path TO 'public', 'extensions', 'pg_temp';
ALTER FUNCTION public.search_inventory(text, uuid) SET search_path TO 'public', 'extensions', 'pg_temp';

NOTIFY pgrst, 'reload schema';
