-- ============================================================================
-- Migration: 20261107000001_deep_branch_warehouses_and_isolation.sql
-- Purpose:
--   1. Ensure every branch has its own dedicated primary warehouse:
--      - Link orphan warehouses (branch_id IS NULL) to the company's main branch.
--      - Provision a primary warehouse for any existing branch that lacks one.
--      - Install an AFTER INSERT trigger on public.branches to auto-provision
--        a dedicated primary warehouse for every newly created branch.
--   2. Patch commit_sales_invoice_v2 (via safe anchored pg_get_functiondef patch)
--      to resolve the selling branch's primary warehouse first and pass p_branch_id
--      to generate_invoice_number(v_company_id, 'sale', p_branch_id).
--   3. Upgrade search_inventory_paginated to include branch_id in stock JSONB
--      and strictly scope branch stock when p_branch_id IS NOT NULL.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1) ربط المستودعات اليتيمة (branch_id IS NULL) بالفرع الرئيسي للمنشأة،
--    وإنشاء مستودع رئيسي تلقائي لكل فرع لا يمتلك مستودعاً خاصاً به
-- ============================================================================
DO $$
DECLARE
  r_company RECORD;
  v_main_branch_id uuid;
  r_branch RECORD;
BEGIN
  -- 1.أ: ربط أي مستودع بدون فرع بالفرع الرئيسي للمنشأة (أو أول فرع نشط)
  FOR r_company IN
    SELECT DISTINCT company_id
    FROM public.warehouses
    WHERE branch_id IS NULL AND deleted_at IS NULL
  LOOP
    SELECT id INTO v_main_branch_id
    FROM public.branches
    WHERE company_id = r_company.company_id
      AND COALESCE(status, 'active') = 'active'
    ORDER BY is_main DESC NULLS LAST, created_at ASC
    LIMIT 1;

    IF v_main_branch_id IS NOT NULL THEN
      UPDATE public.warehouses
      SET branch_id = v_main_branch_id,
          updated_at = NOW()
      WHERE company_id = r_company.company_id
        AND branch_id IS NULL
        AND deleted_at IS NULL;
    END IF;
  END LOOP;

  -- 1.ب: التأكد من أن كل فرع نشط يمتلك مستودعاً واحداً على الأقل خاصاً به
  FOR r_branch IN
    SELECT b.id, b.company_id, b.name, b.code, b.address
    FROM public.branches b
    WHERE COALESCE(b.status, 'active') = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM public.warehouses w
        WHERE w.company_id = b.company_id
          AND w.branch_id = b.id
          AND w.deleted_at IS NULL
      )
  LOOP
    INSERT INTO public.warehouses (
      company_id,
      branch_id,
      name_ar,
      location,
      is_primary,
      status
    ) VALUES (
      r_branch.company_id,
      r_branch.id,
      'مستودع ' || r_branch.name,
      r_branch.address,
      true,
      'active'
    );
  END LOOP;

  -- 1.ج: ضمان وجود مستودع رئيسي (is_primary = true) لكل فرع يمتلك مستودعات
  FOR r_branch IN
    SELECT DISTINCT w.company_id, w.branch_id
    FROM public.warehouses w
    WHERE w.branch_id IS NOT NULL
      AND w.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.warehouses w2
        WHERE w2.company_id = w.company_id
          AND w2.branch_id = w.branch_id
          AND w2.is_primary = true
          AND w2.deleted_at IS NULL
      )
  LOOP
    UPDATE public.warehouses
    SET is_primary = true,
        updated_at = NOW()
    WHERE id = (
      SELECT id
      FROM public.warehouses
      WHERE company_id = r_branch.company_id
        AND branch_id = r_branch.branch_id
        AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    );
  END LOOP;
END $$;

-- ============================================================================
-- 2) Trigger تلقائي لإنشاء مستودع رئيسي عند إضافة أي فرع جديد
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_auto_provision_branch_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouses w
    WHERE w.company_id = NEW.company_id
      AND w.branch_id = NEW.id
      AND w.deleted_at IS NULL
  ) THEN
    INSERT INTO public.warehouses (
      company_id,
      branch_id,
      name_ar,
      location,
      is_primary,
      status
    ) VALUES (
      NEW.company_id,
      NEW.id,
      'مستودع ' || NEW.name,
      NEW.address,
      true,
      'active'
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_provision_branch_warehouse ON public.branches;
CREATE TRIGGER trg_auto_provision_branch_warehouse
  AFTER INSERT ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_provision_branch_warehouse();

-- ============================================================================
-- 3) تعديل موضعي آمن لـ commit_sales_invoice_v2:
--    - اختيار مستودع الفرع البائع أولاً قبل السقوط الاحتياطي لمستودع المنشأة
--    - تمرير p_branch_id إلى generate_invoice_number
-- ============================================================================
DO $patch_commit_sales_invoice_v2_branch$
DECLARE
  v_oid oid := 'public.commit_sales_invoice_v2(uuid,date,date,jsonb,text,text,text,numeric,text,uuid,uuid,numeric)'::regprocedure;
  v_before text;
  v_after  text;

  v_anchor_wh constant text := $a$  SELECT id INTO v_warehouse_id FROM public.warehouses
  WHERE company_id = v_company_id AND is_primary = true AND deleted_at IS NULL
  LIMIT 1;

  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
    WHERE company_id = v_company_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;$a$;

  v_replacement_wh constant text := $b$  -- اختيار المستودع الرئيسي للفرع البائع أولاً، ثم أي مستودع للفرع، ثم المستودع العام للمنشأة
  IF p_branch_id IS NOT NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
    WHERE company_id = v_company_id AND branch_id = p_branch_id AND is_primary = true AND deleted_at IS NULL
    LIMIT 1;

    IF v_warehouse_id IS NULL THEN
      SELECT id INTO v_warehouse_id FROM public.warehouses
      WHERE company_id = v_company_id AND branch_id = p_branch_id AND deleted_at IS NULL
      LIMIT 1;
    END IF;
  END IF;

  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
    WHERE company_id = v_company_id AND is_primary = true AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
    WHERE company_id = v_company_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;$b$;

  v_anchor_inv constant text := $c$v_invoice_number := public.generate_invoice_number(v_company_id, 'sale');$c$;
  v_replacement_inv constant text := $d$v_invoice_number := public.generate_invoice_number(v_company_id, 'sale', p_branch_id);$d$;
BEGIN
  SELECT pg_get_functiondef(v_oid) INTO v_before;
  v_after := v_before;

  IF position('branch_id = p_branch_id AND is_primary = true' in v_after) = 0
     AND position(v_anchor_wh in v_after) > 0 THEN
    v_after := replace(v_after, v_anchor_wh, v_replacement_wh);
  END IF;

  IF position(v_anchor_inv in v_after) > 0 THEN
    v_after := replace(v_after, v_anchor_inv, v_replacement_inv);
  END IF;

  IF v_after <> v_before THEN
    EXECUTE v_after;
    RAISE NOTICE 'commit_sales_invoice_v2: تم تحديث ربط مستودع الفرع وترقيم الفروع بنجاح.';
  ELSE
    RAISE NOTICE 'commit_sales_invoice_v2: التعديلات مطبقة مسبقاً أو لم تتطابق المرساة.';
  END IF;
END;
$patch_commit_sales_invoice_v2_branch$;

-- ============================================================================
-- 4) تحديث search_inventory_paginated لإرجاع branch_id ضمن مصفوفة stock
--    وحصر الكمية بمستودعات الفرع المحدد عند تمرير p_branch_id
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
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_tokens   text[];
  v_token    text;
  v_patterns text[];
  v_filters  text := '';
  v_branch   text := '';
  v_order    text;
  v_sql      text;
  v_key      text;
  v_dir      text;
  v_limit    integer;
  v_offset   integer;
  v_total    integer;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 1000);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  IF p_term IS NULL OR btrim(p_term) = '' THEN
    v_tokens := ARRAY[]::text[];
  ELSE
    v_tokens := regexp_split_to_array(public.normalize_arabic(btrim(p_term)), '[[:space:]]+');
  END IF;

  v_patterns := ARRAY[]::text[];
  IF v_tokens IS NOT NULL THEN
    FOREACH v_token IN ARRAY v_tokens LOOP
      v_token := replace(replace(replace(btrim(v_token), chr(92), ''), '%', ''), '_', '');
      IF v_token <> '' THEN
        v_patterns := v_patterns || ('%' || v_token || '%');
      END IF;
    END LOOP;
  END IF;
  IF v_patterns IS NULL OR cardinality(v_patterns) = 0 THEN
    v_patterns := NULL;
  END IF;

  IF v_patterns IS NOT NULL THEN
    FOREACH v_token IN ARRAY v_patterns LOOP
      v_filters := v_filters || format(' AND p.normalized_search_text LIKE %L', v_token);
    END LOOP;
  END IF;

  IF p_is_core IS NOT NULL THEN
    v_filters := v_filters || format(' AND p.is_core = %L::boolean', p_is_core);
  END IF;

  -- عند تحديد فرع معين: حصر المخزون بمستودعات هذا الفرع فقط
  IF p_branch_id IS NOT NULL THEN
    v_branch := format(' AND w.branch_id = %L::uuid AND w.deleted_at IS NULL', p_branch_id);
  ELSE
    v_branch := ' AND w.deleted_at IS NULL';
  END IF;

  EXECUTE format(
    'SELECT count(*)::integer FROM public.products p '
    'WHERE p.company_id = %L::uuid '
    '  AND p.deleted_at IS NULL '
    '  AND (p.status = %L OR p.status IS NULL)%s',
    p_company_id, 'active', v_filters
  ) INTO v_total;

  v_key := lower(COALESCE(p_sort_key, 'created_at'));
  v_dir := CASE WHEN lower(COALESCE(p_sort_dir, 'asc')) = 'desc' THEN 'DESC' ELSE 'ASC' END;

  IF v_key IN (
    'name_ar', 'sku', 'part_number', 'brand',
    'sale_price', 'purchase_price', 'updated_at', 'created_at'
  ) THEN
    v_order := format(' ORDER BY p.%I %s NULLS LAST, p.created_at DESC', v_key, v_dir);
  ELSE
    v_order := ' ORDER BY p.created_at DESC';
  END IF;

  v_sql := format(
    'SELECT p.id, p.company_id, p.name_ar, p.sku, p.part_number, p.brand, p.size, '
    'p.description, p.purchase_price, p.sale_price, p.min_stock_level::numeric, '
    'p.unit, p.image_url, p.alternative_numbers, p.barcode, p.updated_at, '
    'p.created_at, p.status, p.category_id, '
    'CASE WHEN cat.id IS NOT NULL '
    '     THEN jsonb_build_object(''id'', cat.id, ''name'', cat.name) '
    '     ELSE NULL::jsonb END AS category, '
    'COALESCE(( '
    '  SELECT jsonb_agg(jsonb_build_object( '
    '           ''warehouse_id'', ps.warehouse_id, '
    '           ''branch_id'', w.branch_id, '
    '           ''quantity'', ps.quantity, '
    '           ''warehouse_name'', w.name_ar)) '
    '  FROM public.product_stock ps '
    '  JOIN public.warehouses w ON w.id = ps.warehouse_id '
    '  WHERE ps.product_id = p.id%s '
    '), ''[]''::jsonb) AS stock, '
    'p.is_core, %s AS total_count '
    'FROM public.products p '
    'LEFT JOIN public.product_categories cat ON cat.id = p.category_id '
    'WHERE p.company_id = %L::uuid '
    '  AND p.deleted_at IS NULL '
    '  AND (p.status = %L OR p.status IS NULL)%s '
    '%s LIMIT %s OFFSET %s',
    v_branch, v_total, p_company_id, 'active', v_filters, v_order, v_limit, v_offset
  );

  RETURN QUERY EXECUTE v_sql;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.search_inventory_paginated(uuid, text, integer, integer, text, text, uuid, boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_inventory_paginated(uuid, text, integer, integer, text, text, uuid, boolean) TO authenticated;

COMMIT;

