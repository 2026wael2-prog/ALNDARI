-- Migration: Wave 27 — Server-side product categories statistics RPC (eliminates downloading 45k products on client)
-- Date: 2026-11-23

CREATE OR REPLACE FUNCTION public.fn_get_product_categories_with_stats(p_company_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  "productsCount" integer,
  "totalStock" numeric,
  "totalValue" numeric,
  "hasAlert" boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  RETURN QUERY
  WITH prod_stock AS (
    SELECT 
      ps.product_id,
      SUM(ps.quantity) AS qty
    FROM public.product_stock ps
    WHERE ps.company_id = p_company_id
    GROUP BY ps.product_id
  ),
  cat_agg AS (
    SELECT
      p.category_id,
      COUNT(p.id)::integer AS products_count,
      COALESCE(SUM(COALESCE(s.qty, 0)), 0) AS total_stock,
      COALESCE(SUM(COALESCE(s.qty, 0) * COALESCE(NULLIF(p.cost_price, 0), p.purchase_price, 0)), 0) AS total_value,
      BOOL_OR(COALESCE(s.qty, 0) <= COALESCE(p.min_stock_level, 0)) AS has_alert
    FROM public.products p
    LEFT JOIN prod_stock s ON s.product_id = p.id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND p.category_id IS NOT NULL
    GROUP BY p.category_id
  )
  SELECT
    pc.id,
    pc.name,
    COALESCE(ca.products_count, 0) AS "productsCount",
    COALESCE(ca.total_stock, 0) AS "totalStock",
    COALESCE(ca.total_value, 0) AS "totalValue",
    COALESCE(ca.has_alert, false) AS "hasAlert"
  FROM public.product_categories pc
  LEFT JOIN cat_agg ca ON ca.category_id = pc.id
  WHERE pc.company_id = p_company_id
    AND pc.deleted_at IS NULL
  ORDER BY COALESCE(ca.products_count, 0) DESC, pc.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_product_categories_with_stats(uuid) TO authenticated, service_role;
