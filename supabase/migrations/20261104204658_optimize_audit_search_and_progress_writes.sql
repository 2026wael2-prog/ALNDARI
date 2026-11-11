-- Migration: 20261104204658_optimize_audit_search_and_progress_writes.sql
-- Description: استقرار وتسريع الجرد الميداني + البحث داخل حوارات الأصناف.
--
--   1) [PERF] public.search_inventory_paginated:
--      كانت الشروط تُكتب كـ `normalized_search_text LIKE ALL (v_patterns)`.
--      هذا الشكل يجعل المخطِّط عاجزاً عن استخدام فهرس GIN trigram، فيقع على
--      Seq Scan لكامل جدول المنتجات.
--      الدليل (EXPLAIN ANALYZE على قاعدة الإنتاج، 7,351 صف):
--        • LIKE ALL (ARRAY['%زيت%','%فلتر%'])  ⇒ Seq Scan              ≈ 523 ms
--        • LIKE '%زيت%' AND LIKE '%فلتر%'      ⇒ Bitmap Index Scan     ≈  31 ms
--                                                (idx_products_normalized_trgm)
--      الحل: بناء شروط LIKE منفصلة موصولة بـ AND نصياً (Dynamic SQL) مع قصّ
--      القيم بـ %L وحصر مفاتيح الترتيب في قائمة بيضاء ⇒ لا حقن ولا Seq Scan.
--
--   2) [BUG] إصلاح تقسيم العبارة إلى كلمات:
--      النسخة السابقة استخدمت النمط E'\\\\s+'، وبعد فكّ الترميز يصبح التعبير
--      النمطي `\\s+` وهو يعني «شرطة مائلة حرفية ثم s» وليس «مسافة بيضاء».
--      النتيجة: لا يتم تقسيم العبارة إطلاقاً، فيتحول بحث «زيت فلتر» إلى نمط
--      واحد '%زيت فلتر%' يطابق العبارة المتصلة فقط ⇒ نتائج ناقصة للمستخدم.
--      بعد الإصلاح: ['%زيت%','%فلتر%'] كشرطين AND ⇒ نتائج أوسع وأسرع.
--
--   3) [PERF] public.save_audit_progress:
--      حارس «لا تغيير = لا كتابة»: إذا كانت كل الكميات المرسلة مطابقة لما هو
--      مخزَّن، والمسودة مطابقة أيضاً، تُعاد النتيجة بدون أي UPDATE ⇒ لا تتغير
--      updated_at ⇒ لا يُطلق realtime حدثاً ⇒ لا يُعاد إبطال/جلب جلسة الجرد،
--      وهو المصدر الأساسي لارتجاف الواجهة أثناء الحفظ التلقائي.
--
-- Idempotent: يمكن إعادة تنفيذه بأمان.
BEGIN;

-- ============================================================================
-- 1) search_inventory_paginated — شروط LIKE مفصولة بـ AND (فهرس trgm)
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

  -- حماية الخادم من القيم غير المنطقية (الصفحات السابقة كانت ترسل 250 صفاً)
  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 1000);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  -- 1) تقطيع العبارة إلى كلمات — مسافة بيضاء حقيقية ([[:space:]]+) بلا محارف هروب
  IF p_term IS NULL OR btrim(p_term) = '' THEN
    v_tokens := ARRAY[]::text[];
  ELSE
    v_tokens := regexp_split_to_array(public.normalize_arabic(btrim(p_term)), '[[:space:]]+');
  END IF;

  -- 2) تحويل الكلمات إلى أنماط LIKE مع تحييد محارف النمط الخاصة
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

  -- 3) شرط لكل كلمة على حِدة (AND) ⇒ يستطيع المخطِّط استخدام فهرس GIN trigram
  IF v_patterns IS NOT NULL THEN
    FOREACH v_token IN ARRAY v_patterns LOOP
      v_filters := v_filters || format(' AND p.normalized_search_text LIKE %L', v_token);
    END LOOP;
  END IF;

  IF p_is_core IS NOT NULL THEN
    v_filters := v_filters || format(' AND p.is_core = %L::boolean', p_is_core);
  END IF;

  -- فلتر الفرع يخصّ التجميع داخل stock فقط (نفس دلالات النسخة السابقة)
  IF p_branch_id IS NOT NULL THEN
    v_branch := format(' AND (w.branch_id = %L::uuid OR w.branch_id IS NULL)', p_branch_id);
  END IF;

  -- 4) تحديث الصفحة الواحدة فقط (نفس دلالات النسخة السابقة: بدون فلتر الفرع)
  EXECUTE format(
    'SELECT count(*)::integer FROM public.products p '
    'WHERE p.company_id = %L::uuid '
    '  AND p.deleted_at IS NULL '
    '  AND (p.status = %L OR p.status IS NULL)%s',
    p_company_id, 'active', v_filters
  ) INTO v_total;

  -- 5) ترتيب مُقيَّد بقائمة بيضاء (يمنع الحقن ويسمح باستخدام الفهارس)
  v_key := lower(COALESCE(p_sort_key, 'created_at'));
  v_dir := CASE WHEN lower(COALESCE(p_sort_dir, 'asc')) = 'desc' THEN 'DESC' ELSE 'ASC' END;

  IF v_key IN (
    'name_ar', 'sku', 'part_number', 'brand',
    'sale_price', 'purchase_price', 'updated_at', 'created_at'
  ) THEN
    v_order := format(' ORDER BY p.%I %s NULLS LAST, p.created_at DESC', v_key, v_dir);
  ELSE
    -- مفاتيح غير معروفة: نفس سلوك النسخة السابقة (الأحدث إنشاءً أولاً)
    v_order := ' ORDER BY p.created_at DESC';
  END IF;

  -- 6) إرجاع السجلات المطابقة
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

-- ============================================================================
-- 2) save_audit_progress — حارس «لا تغيير = لا كتابة»
--    audit_items مُدرَج في نشر supabase_realtime، فأي UPDATE (حتى لو بنفس القيمة)
--    يُطلق حدثاً ⇒ الشاشة تُبطل الاستعلام وتُعيد الجلب ⇒ ارتجاف.
--    لذلك: (أ) لا نُحدّث إلا الصفوف التي تغيّرت فعلياً، (ب) وإذا لم يتغيّر شيء
--    والمسودة مطابقة نعود فوراً بلا أي كتابة.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.save_audit_progress(
    p_session_id uuid,
    p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_session record;
    v_user_id uuid;
    v_updated_count integer := 0;
    v_no_item_changes boolean := false;
    v_draft_identical boolean := false;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT id, warehouse_id, company_id, status INTO v_session
    FROM public.audit_sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'جلسة الجرد غير موجودة' USING ERRCODE = 'P0002';
    END IF;

    IF v_session.status <> 'active' THEN
        IF v_session.status = 'completed' THEN
            RAISE EXCEPTION 'لا يمكن تعديل كميات جلسة جرد مكتملة' USING ERRCODE = '22023';
        ELSE
            RAISE EXCEPTION 'لا يمكن تعديل كميات جرد ملغاة أو غير نشطة' USING ERRCODE = '22023';
        END IF;
    END IF;

    -- Multi-tenant isolation check
    IF NOT (v_session.company_id IN (SELECT get_auth_companies())) THEN
        RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية الوصول لهذه المنشأة' USING ERRCODE = '42501';
    END IF;

    -- Role check: saving audit quantities requires admin or manager
    IF NOT user_is_admin_or_manager(v_session.company_id) THEN
        RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية تعديل كميات الجرد' USING ERRCODE = '42501';
    END IF;

    IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
        -- [SEC-FIX] quantity sanity: رفض السالب/NaN/Infinity قبل أي تخزين
        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(p_items) elem
            WHERE elem->>'counted_quantity' IS NOT NULL
              AND elem->>'counted_quantity' <> ''
              AND (
                    (elem->>'counted_quantity')::numeric < 0
                 OR (elem->>'counted_quantity')::numeric = 'NaN'::numeric
                 OR (elem->>'counted_quantity')::numeric = 'Infinity'::numeric
                 OR (elem->>'counted_quantity')::numeric > 1000000
              )
        ) THEN
            RAISE EXCEPTION 'كمية الجرد غير صالحة (يجب أن تكون بين 0 و 1000000)' USING ERRCODE = '22023';
        END IF;

        -- [PERF-FIX] هل يوجد صف واحد على الأقل بكمية مختلفة عن المخزَّن؟
        SELECT
            NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(p_items) elem
                JOIN public.audit_items ai
                  ON ai.session_id = p_session_id
                 AND (
                      (NULLIF(elem->>'id', '') IS NOT NULL
                         AND ai.id = NULLIF(elem->>'id', '')::uuid)
                      OR
                      (NULLIF(elem->>'id', '') IS NULL
                         AND NULLIF(elem->>'product_id', '') IS NOT NULL
                         AND ai.product_id = NULLIF(elem->>'product_id', '')::uuid)
                     )
                WHERE ai.counted_quantity IS DISTINCT FROM (
                        CASE
                            WHEN elem->>'counted_quantity' IS NULL OR elem->>'counted_quantity' = ''
                                THEN NULL
                            ELSE (elem->>'counted_quantity')::numeric
                        END)
            ),
            EXISTS (
                SELECT 1
                FROM public.inventory_session_drafts d
                WHERE d.session_id = p_session_id
                  AND d.items IS NOT DISTINCT FROM p_items
            )
        INTO v_no_item_changes, v_draft_identical;

        -- لا كميات تغيّرت والمسودة مطابقة ⇒ لا نلمس أي جدول ولا نطلق أي حدث realtime
        IF v_no_item_changes AND v_draft_identical THEN
            RETURN jsonb_build_object(
                'success', true,
                'session_id', p_session_id,
                'updated_count', 0,
                'skipped', true
            );
        END IF;

        WITH parsed_items AS (
            SELECT
                NULLIF(elem->>'id', '')::uuid AS item_id,
                NULLIF(elem->>'product_id', '')::uuid AS product_id,
                CASE
                    WHEN elem->>'counted_quantity' IS NULL OR elem->>'counted_quantity' = '' THEN NULL
                    ELSE (elem->>'counted_quantity')::numeric
                END AS counted_qty
            FROM jsonb_array_elements(p_items) elem
        )
        UPDATE public.audit_items ai
        SET
            counted_quantity = pi.counted_qty,
            updated_at = timezone('utc'::text, now())
        FROM parsed_items pi
        WHERE ai.session_id = p_session_id
          AND (
              (pi.item_id IS NOT NULL AND ai.id = pi.item_id)
              OR
              (pi.item_id IS NULL AND pi.product_id IS NOT NULL AND ai.product_id = pi.product_id)
          )
          -- [PERF-FIX] الصفوف غير المتغيّرة لا تُكتب ⇒ لا حدث realtime ولا إبطال استعلام
          AND ai.counted_quantity IS DISTINCT FROM pi.counted_qty;

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;

        -- مزامنة المسودة (inventory_session_drafts ليست في نشر realtime ⇒ بلا أحداث)
        INSERT INTO public.inventory_session_drafts (
            session_id,
            warehouse_id,
            items,
            updated_at
        ) VALUES (
            p_session_id,
            v_session.warehouse_id,
            p_items,
            timezone('utc'::text, now())
        )
        ON CONFLICT (session_id) DO UPDATE
        SET items = EXCLUDED.items,
            updated_at = EXCLUDED.updated_at
        WHERE public.inventory_session_drafts.items IS DISTINCT FROM EXCLUDED.items;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', p_session_id,
        'updated_count', v_updated_count
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_audit_progress(uuid, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_audit_progress(uuid, jsonb) TO authenticated;

COMMIT;
