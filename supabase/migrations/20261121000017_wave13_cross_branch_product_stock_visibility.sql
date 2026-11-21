-- ============================================================================
-- Wave 13: Cross-Branch Product Stock & Location Visibility in
--          search_inventory_paginated
-- ----------------------------------------------------------------------------
-- Applied live on dagfjncoullstrhbjssr as:
--   wave13_cross_branch_product_stock_visibility
--
-- Returns stock across ALL company warehouses with branch_id, branch_name,
-- branch_code, and warehouse location so every branch sees where products
-- are available across all branches/warehouses (matching the Wave 11 exemption:
-- strict branch isolation EXCEPT products and their locations).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.search_inventory_paginated(
  p_company_id uuid,
  p_term text,
  p_limit integer,
  p_offset integer,
  p_sort_key text,
  p_sort_dir text,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_is_core boolean DEFAULT NULL::boolean
)
RETURNS TABLE(
  id uuid,
  company_id uuid,
  name_ar text,
  sku text,
  part_number text,
  brand text,
  size text,
  description text,
  purchase_price numeric,
  sale_price numeric,
  min_stock_level numeric,
  unit text,
  image_url text,
  alternative_numbers text,
  barcode text,
  updated_at timestamp with time zone,
  created_at timestamp with time zone,
  status text,
  category_id uuid,
  category jsonb,
  stock jsonb,
  is_core boolean,
  total_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tokens text[];
  v_patterns text[];
  v_total integer;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  IF p_term IS NULL OR trim(p_term) = '' THEN
    SELECT count(*)::integer INTO v_total
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND (p.status = 'active' OR p.status IS NULL)
      AND (p_is_core IS NULL OR p.is_core = p_is_core);

    RETURN QUERY
    SELECT
      p.id,
      p.company_id,
      p.name_ar,
      p.sku,
      p.part_number,
      p.brand,
      p.size,
      p.description,
      p.purchase_price,
      p.sale_price,
      p.min_stock_level::numeric,
      p.unit,
      p.image_url,
      p.alternative_numbers,
      p.barcode,
      p.updated_at,
      p.created_at,
      p.status,
      p.category_id,
      CASE
        WHEN cat.id IS NOT NULL THEN jsonb_build_object('id', cat.id, 'name', cat.name)
        ELSE NULL::jsonb
      END AS category,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'warehouse_id', ps.warehouse_id,
              'quantity', ps.quantity,
              'warehouse_name', w.name_ar,
              'location', w.location,
              'branch_id', w.branch_id,
              'branch_name', b.name,
              'branch_code', b.code
            )
            ORDER BY (p_branch_id IS NOT NULL AND w.branch_id = p_branch_id) DESC, ps.quantity DESC, w.name_ar ASC
          )
          FROM public.product_stock ps
          JOIN public.warehouses w
            ON w.id = ps.warehouse_id
           AND w.company_id = p_company_id
           AND w.deleted_at IS NULL
          LEFT JOIN public.branches b
            ON b.id = w.branch_id
          WHERE ps.product_id = p.id
            AND ps.company_id = p_company_id
        ),
        '[]'::jsonb
      ) AS stock,
      p.is_core,
      v_total AS total_count
    FROM public.products p
    LEFT JOIN public.product_categories cat ON cat.id = p.category_id AND cat.company_id = p_company_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND (p.status = 'active' OR p.status IS NULL)
      AND (p_is_core IS NULL OR p.is_core = p_is_core)
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;

  ELSE
    v_tokens := regexp_split_to_array(public.normalize_arabic(trim(p_term)), E'\\s+');
    SELECT array_agg('%' || t || '%') INTO v_patterns FROM unnest(v_tokens) t WHERE trim(t) <> '';

    SELECT count(*)::integer INTO v_total
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND (p.status = 'active' OR p.status IS NULL)
      AND (p_is_core IS NULL OR p.is_core = p_is_core)
      AND p.normalized_search_text LIKE ALL (v_patterns);

    RETURN QUERY
    SELECT
      p.id,
      p.company_id,
      p.name_ar,
      p.sku,
      p.part_number,
      p.brand,
      p.size,
      p.description,
      p.purchase_price,
      p.sale_price,
      p.min_stock_level::numeric,
      p.unit,
      p.image_url,
      p.alternative_numbers,
      p.barcode,
      p.updated_at,
      p.created_at,
      p.status,
      p.category_id,
      CASE
        WHEN cat.id IS NOT NULL THEN jsonb_build_object('id', cat.id, 'name', cat.name)
        ELSE NULL::jsonb
      END AS category,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'warehouse_id', ps.warehouse_id,
              'quantity', ps.quantity,
              'warehouse_name', w.name_ar,
              'location', w.location,
              'branch_id', w.branch_id,
              'branch_name', b.name,
              'branch_code', b.code
            )
            ORDER BY (p_branch_id IS NOT NULL AND w.branch_id = p_branch_id) DESC, ps.quantity DESC, w.name_ar ASC
          )
          FROM public.product_stock ps
          JOIN public.warehouses w
            ON w.id = ps.warehouse_id
           AND w.company_id = p_company_id
           AND w.deleted_at IS NULL
          LEFT JOIN public.branches b
            ON b.id = w.branch_id
          WHERE ps.product_id = p.id
            AND ps.company_id = p_company_id
        ),
        '[]'::jsonb
      ) AS stock,
      p.is_core,
      v_total AS total_count
    FROM public.products p
    LEFT JOIN public.product_categories cat ON cat.id = p.category_id AND cat.company_id = p_company_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND (p.status = 'active' OR p.status IS NULL)
      AND (p_is_core IS NULL OR p.is_core = p_is_core)
      AND p.normalized_search_text LIKE ALL (v_patterns)
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
  END IF;
END;
$function$;
