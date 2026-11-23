-- Migration: Wave 26 — Make duplicate product detection category-aware and allow void invoice product_id re-pointing during merge
-- Date: 2026-11-23

CREATE OR REPLACE FUNCTION public.fn_guard_posted_invoice_items_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inv_status text;
  v_invoice_id uuid;
BEGIN
  IF current_setting('app.reposting_doc', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_invoice_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;

  SELECT status INTO v_inv_status
  FROM public.invoices
  WHERE id = v_invoice_id;

  IF v_inv_status IN ('void', 'cancelled', 'posted', 'confirmed', 'paid', 'partially_paid') THEN
    IF TG_OP IN ('INSERT', 'DELETE') THEN
      RAISE EXCEPTION 'posted_invoice_items_locked: لا يمكن إضافة أو حذف بنود فاتورة مرحلة أو ملغية (%)',
        v_inv_status USING ERRCODE = '23514';
    END IF;

    -- Allow non-financial reference updates (e.g. product_id during merge), block financial tampering
    IF OLD.quantity IS DISTINCT FROM NEW.quantity
       OR OLD.unit_price IS DISTINCT FROM NEW.unit_price
       OR COALESCE(OLD.cost_price, 0) IS DISTINCT FROM COALESCE(NEW.cost_price, 0)
       OR COALESCE(OLD.discount_amount, 0) IS DISTINCT FROM COALESCE(NEW.discount_amount, 0)
       OR COALESCE(OLD.tax_amount, 0) IS DISTINCT FROM COALESCE(NEW.tax_amount, 0)
       OR COALESCE(OLD.total, 0) IS DISTINCT FROM COALESCE(NEW.total, 0) THEN
      RAISE EXCEPTION 'posted_invoice_items_locked: لا يمكن تعديل الكميات أو الأسعار أو الإجمالي في فاتورة مرحلة أو ملغية (%) خارج دالة التعديل المعتمدة',
        v_inv_status USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_find_duplicate_products_by_part_brand(
  p_company_id uuid,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(btrim(p_search), '');
  v_total integer := 0;
  v_groups jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  WITH base AS (
    SELECT
      p.id,
      p.sku,
      p.name_ar,
      p.part_number,
      p.brand,
      p.size,
      p.category_id,
      COALESCE(pc.name, 'عام') AS category_name,
      COALESCE(p.sale_price, 0) AS sale_price,
      COALESCE(NULLIF(p.cost_price, 0), p.purchase_price, 0) AS cost_price,
      p.created_at,
      LOWER(TRIM(regexp_replace(p.part_number, '\s+', ' ', 'g'))) AS norm_pn,
      LOWER(TRIM(regexp_replace(p.brand, '\s+', ' ', 'g'))) AS norm_brand
    FROM public.products p
    LEFT JOIN public.product_categories pc ON pc.id = p.category_id AND pc.deleted_at IS NULL
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND COALESCE(p.item_type, 'stock') <> 'service'
      AND p.part_number IS NOT NULL
      AND length(TRIM(p.part_number)) >= 4
      AND p.brand IS NOT NULL
      AND length(TRIM(p.brand)) >= 2
      AND TRIM(p.part_number) NOT IN ('0', '-', '--', '---', 'N/A', 'n/a', 'غير محدد', 'لا يوجد', '.')
      AND TRIM(p.brand) NOT IN ('0', '-', '--', 'N/A', 'n/a', 'غير محدد', 'لا يوجد', '.')
  ),
  dup_keys AS (
    SELECT
      norm_pn,
      norm_brand,
      category_name,
      COUNT(*) AS group_count
    FROM base
    GROUP BY norm_pn, norm_brand, category_name
    HAVING COUNT(*) > 1
       AND (
         v_search IS NULL
         OR norm_pn ILIKE '%' || LOWER(v_search) || '%'
         OR norm_brand ILIKE '%' || LOWER(v_search) || '%'
         OR category_name ILIKE '%' || v_search || '%'
         OR bool_or(name_ar ILIKE '%' || v_search || '%')
         OR bool_or(sku ILIKE '%' || v_search || '%')
         OR bool_or(COALESCE(size, '') ILIKE '%' || v_search || '%')
       )
  ),
  paged_keys AS (
    SELECT norm_pn, norm_brand, category_name, group_count
    FROM dup_keys
    ORDER BY group_count DESC, norm_pn ASC
    LIMIT v_limit OFFSET v_offset
  ),
  group_products AS (
    SELECT
      pk.norm_pn,
      pk.norm_brand,
      pk.category_name,
      pk.group_count,
      b.id,
      b.sku,
      b.name_ar,
      b.part_number,
      b.brand,
      b.size,
      b.sale_price,
      b.cost_price,
      b.created_at,
      COALESCE((
        SELECT SUM(ps.quantity)
        FROM public.product_stock ps
        WHERE ps.company_id = p_company_id AND ps.product_id = b.id
      ), 0) AS total_stock,
      COALESCE((
        SELECT COUNT(*)
        FROM public.invoice_items ii
        WHERE ii.company_id = p_company_id AND ii.product_id = b.id
      ), 0) AS invoice_count,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'branch_name', COALESCE(br.name, w.name_ar, 'مستودع'),
          'warehouse_name', w.name_ar,
          'quantity', ps.quantity
        ) ORDER BY ps.quantity DESC)
        FROM public.product_stock ps
        JOIN public.warehouses w ON w.id = ps.warehouse_id AND w.deleted_at IS NULL
        LEFT JOIN public.branches br ON br.id = w.branch_id
        WHERE ps.company_id = p_company_id
          AND ps.product_id = b.id
          AND ps.quantity <> 0
      ), '[]'::jsonb) AS stock_by_branch
    FROM paged_keys pk
    JOIN base b ON b.norm_pn = pk.norm_pn AND b.norm_brand = pk.norm_brand AND b.category_name = pk.category_name
  )
  SELECT
    (SELECT COUNT(*)::integer FROM dup_keys),
    COALESCE((
      SELECT jsonb_agg(g_row ORDER BY g_row.group_count DESC, g_row.norm_pn ASC)
      FROM (
        SELECT
          norm_pn,
          norm_brand,
          category_name,
          group_count,
          jsonb_agg(jsonb_build_object(
            'id', id,
            'sku', sku,
            'name_ar', name_ar,
            'part_number', part_number,
            'brand', brand,
            'size', size,
            'category_name', category_name,
            'sale_price', sale_price,
            'cost_price', cost_price,
            'total_stock', total_stock,
            'invoice_count', invoice_count,
            'stock_by_branch', stock_by_branch
          ) ORDER BY invoice_count DESC, cost_price DESC, total_stock DESC, created_at ASC) AS items
        FROM group_products
        GROUP BY norm_pn, norm_brand, category_name, group_count
      ) g_row
    ), '[]'::jsonb)
  INTO v_total, v_groups;

  RETURN jsonb_build_object(
    'total_groups', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'groups', v_groups
  );
END;
$function$;
