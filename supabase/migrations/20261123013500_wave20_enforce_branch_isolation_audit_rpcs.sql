-- ============================================================================
-- Wave 20: Enforce Strict Branch Isolation on Stock Audit & Stock Adjust RPCs
-- ============================================================================
-- Audit Findings Addressed:
-- 1. All 6 SECURITY DEFINER audit_session RPCs bypassed RLS and only checked
--    company_id + role, without calling fn_assert_branch_access(company_id, branch_id).
-- 2. All 3 SECURITY DEFINER stock adjustment RPCs (quick_adjust_stock_batch,
--    bulk_adjust_stock, adjust_stock_atomic) also lacked fn_assert_branch_access.
-- 3. Fixed corrupted UTF-8 mojibake error messages in add_audit_session_item
--    and save_audit_progress.
-- 4. Fixed reverse_audit_session querying reference_type = 'audit' instead of
--    IN ('stock_audit', 'audit').
-- ============================================================================

-- 1. add_audit_session_item
CREATE OR REPLACE FUNCTION public.add_audit_session_item(p_session_id uuid, p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session record;
    v_stock_qty numeric := 0;
    v_item record;
    v_product record;
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT s.id, s.warehouse_id, s.company_id, s.status, w.branch_id
    INTO v_session
    FROM public.audit_sessions s
    JOIN public.warehouses w ON w.id = s.warehouse_id AND w.company_id = s.company_id
    WHERE s.id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'جلسة الجرد غير موجودة' USING ERRCODE = 'P0002';
    END IF;

    PERFORM public.fn_assert_branch_access(v_session.company_id, v_session.branch_id);

    IF v_session.status <> 'active' THEN
        IF v_session.status = 'completed' THEN
            RAISE EXCEPTION 'لا يمكن إضافة أصناف لجلسة جرد مكتملة' USING ERRCODE = '22023';
        ELSE
            RAISE EXCEPTION 'لا يمكن إضافة أصناف لجلسة جرد ملغاة أو غير نشطة' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF NOT public.user_is_admin_or_manager(v_session.company_id) THEN
        RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية إدارة الجرد' USING ERRCODE = '42501';
    END IF;

    SELECT p.id, p.name_ar, p.sku, p.part_number, p.brand, p.size, pc.name AS category_name
    INTO v_product
    FROM public.products p
    LEFT JOIN public.product_categories pc ON pc.id = p.category_id
    WHERE p.id = p_product_id
      AND p.company_id = v_session.company_id
      AND p.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'المنتج غير موجود أو لا ينتمي لمنشأة جلسة الجرد' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(quantity, 0) INTO v_stock_qty
    FROM public.product_stock
    WHERE product_id = p_product_id AND warehouse_id = v_session.warehouse_id;

    INSERT INTO public.audit_items (
        session_id, product_id, expected_quantity, company_id, created_by
    ) VALUES (
        p_session_id, p_product_id, COALESCE(v_stock_qty, 0), v_session.company_id, v_user_id
    )
    ON CONFLICT (session_id, product_id)
    DO UPDATE SET expected_quantity = EXCLUDED.expected_quantity
    RETURNING * INTO v_item;

    RETURN jsonb_build_object(
        'id', v_item.id,
        'session_id', v_item.session_id,
        'product_id', v_item.product_id,
        'expected_quantity', v_item.expected_quantity,
        'counted_quantity', v_item.counted_quantity,
        'created_at', v_item.created_at,
        'products', jsonb_build_object(
            'id', v_product.id,
            'name', COALESCE(v_product.name_ar, 'بدون اسم'),
            'name_ar', COALESCE(v_product.name_ar, 'بدون اسم'),
            'sku', COALESCE(v_product.sku, '---'),
            'part_number', v_product.part_number,
            'brand', v_product.brand,
            'size', v_product.size,
            'category', COALESCE(v_product.category_name, 'عام')
        )
    );
END;
$function$;

-- 2. delete_audit_session_item
CREATE OR REPLACE FUNCTION public.delete_audit_session_item(
    p_session_id uuid,
    p_item_id uuid DEFAULT NULL::uuid,
    p_product_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session RECORD;
    v_deleted_count INT := 0;
    v_target_product_id UUID := p_product_id;
BEGIN
    SELECT s.id, s.company_id, s.status, w.branch_id
    INTO v_session
    FROM public.audit_sessions s
    JOIN public.warehouses w ON w.id = s.warehouse_id AND w.company_id = s.company_id
    WHERE s.id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Audit session not found' USING ERRCODE = 'P0002';
    END IF;

    PERFORM public.fn_assert_branch_access(v_session.company_id, v_session.branch_id);

    IF v_session.status <> 'active' THEN
        IF v_session.status = 'completed' THEN
            RAISE EXCEPTION 'Cannot delete items from a completed audit session' USING ERRCODE = '22023';
        ELSE
            RAISE EXCEPTION 'Cannot delete items from an inactive audit session' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF NOT public.user_is_admin_or_manager(v_session.company_id) THEN
        RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية تعديل أو حذف عناصر الجرد' USING ERRCODE = '42501';
    END IF;

    IF p_item_id IS NOT NULL THEN
        IF v_target_product_id IS NULL THEN
            SELECT product_id INTO v_target_product_id
            FROM public.audit_items
            WHERE id = p_item_id AND session_id = p_session_id;
        END IF;

        DELETE FROM public.audit_items
        WHERE id = p_item_id AND session_id = p_session_id;
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    ELSIF p_product_id IS NOT NULL THEN
        DELETE FROM public.audit_items
        WHERE product_id = p_product_id AND session_id = p_session_id;
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    ELSE
        RAISE EXCEPTION 'Either p_item_id or p_product_id must be provided' USING ERRCODE = '22023';
    END IF;

    IF v_target_product_id IS NOT NULL THEN
        UPDATE public.inventory_session_drafts
        SET items = (
            SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
            FROM jsonb_array_elements(items) elem
            WHERE elem->>'productId' <> v_target_product_id::text
        ),
        updated_at = NOW()
        WHERE session_id = p_session_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'deleted_count', v_deleted_count);
END;
$function$;

-- 3. save_audit_progress
CREATE OR REPLACE FUNCTION public.save_audit_progress(p_session_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session record;
    v_user_id uuid;
    v_updated_count integer := 0;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT s.id, s.warehouse_id, s.company_id, s.status, w.branch_id
    INTO v_session
    FROM public.audit_sessions s
    JOIN public.warehouses w ON w.id = s.warehouse_id AND w.company_id = s.company_id
    WHERE s.id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'جلسة الجرد غير موجودة' USING ERRCODE = 'P0002';
    END IF;

    PERFORM public.fn_assert_branch_access(v_session.company_id, v_session.branch_id);

    IF v_session.status <> 'active' THEN
        IF v_session.status = 'completed' THEN
            RAISE EXCEPTION 'لا يمكن تعديل كميات جلسة جرد مكتملة' USING ERRCODE = '22023';
        ELSE
            RAISE EXCEPTION 'لا يمكن تعديل كميات جلسة جرد ملغاة أو غير نشطة' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF NOT public.user_is_admin_or_manager(v_session.company_id) THEN
        RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية تعديل كميات الجرد' USING ERRCODE = '42501';
    END IF;

    IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
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
              OR (pi.item_id IS NULL AND pi.product_id IS NOT NULL AND ai.product_id = pi.product_id)
          );

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;

        INSERT INTO public.inventory_session_drafts (session_id, warehouse_id, items, updated_at)
        VALUES (p_session_id, v_session.warehouse_id, p_items, timezone('utc'::text, now()))
        ON CONFLICT (session_id) DO UPDATE
        SET items = EXCLUDED.items, updated_at = EXCLUDED.updated_at;
    END IF;

    RETURN jsonb_build_object('success', true, 'session_id', p_session_id, 'updated_count', v_updated_count);
END;
$function$;

-- 4. populate_audit_session_warehouse
CREATE OR REPLACE FUNCTION public.populate_audit_session_warehouse(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session record;
    v_user_id uuid;
    v_inserted_count integer := 0;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT s.id, s.warehouse_id, s.company_id, s.status, w.branch_id
    INTO v_session
    FROM public.audit_sessions s
    JOIN public.warehouses w ON w.id = s.warehouse_id AND w.company_id = s.company_id
    WHERE s.id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'جلسة الجرد غير موجودة' USING ERRCODE = 'P0002';
    END IF;

    PERFORM public.fn_assert_branch_access(v_session.company_id, v_session.branch_id);

    IF v_session.status <> 'active' THEN
        IF v_session.status = 'completed' THEN
            RAISE EXCEPTION 'لا يمكن تعديل بنود جلسة جرد مكتملة' USING ERRCODE = '22023';
        ELSE
            RAISE EXCEPTION 'لا يمكن تعديل بنود جلسة جرد ملغاة أو غير نشطة' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF NOT public.user_is_admin_or_manager(v_session.company_id) THEN
        RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية إدارة وتعبئة جلسات الجرد' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.audit_items (session_id, product_id, expected_quantity, company_id, created_by)
    SELECT v_session.id, p.id, COALESCE(ps.quantity, 0), v_session.company_id, v_user_id
    FROM public.products p
    LEFT JOIN public.product_stock ps
        ON ps.product_id = p.id AND ps.warehouse_id = v_session.warehouse_id
    WHERE p.company_id = v_session.company_id
      AND p.deleted_at IS NULL
    ON CONFLICT (session_id, product_id)
    DO UPDATE SET expected_quantity = EXCLUDED.expected_quantity;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', p_session_id,
        'warehouse_id', v_session.warehouse_id,
        'populated_count', v_inserted_count
    );
END;
$function$;

-- 5. finalize_audit_session
CREATE OR REPLACE FUNCTION public.finalize_audit_session(p_session_id uuid, p_user_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session RECORD;
    v_item JSONB;
    v_new_qty NUMERIC;
    v_raw_qty NUMERIC;
    v_current_qty NUMERIC;
    v_diff NUMERIC;
    v_adj_count INT := 0;
    v_product RECORD;
    v_txn_type TEXT;
    v_effective_user_id UUID;
    v_unit_cost NUMERIC;
    v_line_cost NUMERIC;
    v_total_adj_gain NUMERIC := 0;
    v_total_adj_loss NUMERIC := 0;
    v_inv_account_id UUID;
    v_adj_account_id UUID;
    v_branch_id UUID;
    v_journal_id UUID;
    v_net_adj NUMERIC;
BEGIN
    v_effective_user_id := auth.uid();

    IF v_effective_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_session
    FROM public.audit_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'جلسة الجرد غير موجودة' USING ERRCODE = 'P0002';
    END IF;

    SELECT w.branch_id INTO v_branch_id
    FROM public.warehouses w
    WHERE w.id = v_session.warehouse_id AND w.company_id = v_session.company_id;

    PERFORM public.fn_assert_branch_access(v_session.company_id, v_branch_id);

    IF v_session.status <> 'active' THEN
        IF v_session.status = 'completed' THEN
            RETURN jsonb_build_object('status', 'already_completed', 'adjusted', 0);
        ELSE
            RAISE EXCEPTION 'لا يمكن اعتماد جلسة جرد ملغاة أو غير نشطة' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF NOT public.user_is_admin_or_manager(v_session.company_id) THEN
        RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية اعتماد وترحيل الجرد' USING ERRCODE = '42501';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'بنود الاعتماد غير صالحة' USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(p_items) > 10000 THEN
        RAISE EXCEPTION 'عدد بنود الاعتماد يتجاوز الحد المسموح (10000)' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        IF (v_item->>'counted_quantity') IS NULL OR (v_item->>'product_id') IS NULL THEN
            CONTINUE;
        END IF;

        v_raw_qty := (v_item->>'counted_quantity')::NUMERIC;

        IF v_raw_qty IS NULL
           OR v_raw_qty = 'NaN'::NUMERIC
           OR v_raw_qty = 'Infinity'::NUMERIC
           OR v_raw_qty = '-Infinity'::NUMERIC
           OR v_raw_qty < 0
           OR v_raw_qty > 1000000 THEN
            RAISE EXCEPTION 'كمية الجرد غير صالحة للمنتج %', (v_item->>'product_id') USING ERRCODE = '22023';
        END IF;

        SELECT id INTO v_product
        FROM public.audit_items
        WHERE session_id = p_session_id
          AND product_id = (v_item->>'product_id')::UUID;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'المنتج % غير مرصود في بنود جلسة الجرد', (v_item->>'product_id') USING ERRCODE = '22023';
        END IF;

        SELECT id INTO v_product
        FROM public.products
        WHERE id = (v_item->>'product_id')::UUID
          AND company_id = v_session.company_id
          AND deleted_at IS NULL;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'المنتج غير موجود أو لا ينتمي لمنشأة جلسة الجرد' USING ERRCODE = '22023';
        END IF;

        v_new_qty := v_raw_qty;

        UPDATE public.audit_items
        SET counted_quantity = v_new_qty
        WHERE session_id = p_session_id
          AND product_id = (v_item->>'product_id')::UUID;

        SELECT quantity INTO v_current_qty
        FROM public.product_stock
        WHERE company_id = v_session.company_id
          AND product_id = (v_item->>'product_id')::UUID
          AND warehouse_id = v_session.warehouse_id
        FOR UPDATE;

        IF NOT FOUND THEN
            v_current_qty := 0;
        END IF;

        v_diff := v_new_qty - v_current_qty;

        IF v_diff = 0 THEN
            INSERT INTO public.product_stock (product_id, warehouse_id, quantity, company_id, updated_by, updated_at)
            VALUES (
                (v_item->>'product_id')::UUID,
                v_session.warehouse_id,
                v_new_qty,
                v_session.company_id,
                v_effective_user_id,
                NOW()
            )
            ON CONFLICT (company_id, product_id, warehouse_id) DO NOTHING;
        ELSE
            SELECT id, purchase_price, cost_price INTO v_product
            FROM public.products
            WHERE id = (v_item->>'product_id')::UUID;

            v_unit_cost := COALESCE(NULLIF(v_product.cost_price, 0), v_product.purchase_price, 0);
            v_line_cost := ROUND(ABS(v_diff) * v_unit_cost, 4);
            v_txn_type := CASE WHEN v_diff > 0 THEN 'adj_in' ELSE 'adj_out' END;

            IF v_diff > 0 THEN
                v_total_adj_gain := v_total_adj_gain + v_line_cost;
            ELSE
                v_total_adj_loss := v_total_adj_loss + v_line_cost;
            END IF;

            INSERT INTO public.inventory_transactions (
                company_id, product_id, warehouse_id, quantity,
                unit_cost, total_cost, transaction_type,
                reference_type, reference_id, created_by
            ) VALUES (
                v_session.company_id,
                (v_item->>'product_id')::UUID,
                v_session.warehouse_id,
                ABS(v_diff),
                v_unit_cost,
                v_line_cost,
                v_txn_type,
                'stock_audit',
                p_session_id,
                v_effective_user_id
            );
        END IF;

        v_adj_count := v_adj_count + 1;
    END LOOP;

    v_net_adj := ROUND(v_total_adj_gain - v_total_adj_loss, 2);
    IF ABS(v_net_adj) > 0.01 THEN
        SELECT a.id INTO v_inv_account_id
        FROM public.accounts a
        WHERE a.company_id = v_session.company_id
          AND a.deleted_at IS NULL
          AND COALESCE(a.allow_posting, true) = true
          AND (a.code = '1200' OR a.code LIKE 'MZ-131%' OR a.code LIKE '131%')
        ORDER BY CASE WHEN a.code = '1200' THEN 0 ELSE 1 END, a.code
        LIMIT 1;

        SELECT a.id INTO v_adj_account_id
        FROM public.accounts a
        WHERE a.company_id = v_session.company_id
          AND a.deleted_at IS NULL
          AND COALESCE(a.allow_posting, true) = true
          AND (a.code = '5200' OR a.code = '5100' OR a.code LIKE '50%')
        ORDER BY CASE WHEN a.code = '5200' THEN 0 WHEN a.code = '5100' THEN 1 ELSE 2 END, a.code
        LIMIT 1;

        IF v_inv_account_id IS NOT NULL AND v_adj_account_id IS NOT NULL THEN
            PERFORM set_config('app.rpc_authorized', 'true', true);

            INSERT INTO public.journal_entries (
                company_id, branch_id, entry_date, description, reference_type, reference_id, status, created_by
            ) VALUES (
                v_session.company_id,
                v_branch_id,
                CURRENT_DATE,
                'تسوية فروقات الجرد المخزني',
                'stock_audit',
                p_session_id,
                'draft',
                v_effective_user_id
            ) RETURNING id INTO v_journal_id;

            IF v_net_adj > 0 THEN
                INSERT INTO public.journal_entry_lines (
                    journal_entry_id, account_id, debit_amount, credit_amount, description, company_id, branch_id
                ) VALUES
                    (v_journal_id, v_inv_account_id, v_net_adj, 0, 'فائض جرد مخزني', v_session.company_id, v_branch_id),
                    (v_journal_id, v_adj_account_id, 0, v_net_adj, 'فائض جرد مخزني', v_session.company_id, v_branch_id);
            ELSE
                INSERT INTO public.journal_entry_lines (
                    journal_entry_id, account_id, debit_amount, credit_amount, description, company_id, branch_id
                ) VALUES
                    (v_journal_id, v_adj_account_id, ABS(v_net_adj), 0, 'عجز جرد مخزني', v_session.company_id, v_branch_id),
                    (v_journal_id, v_inv_account_id, 0, ABS(v_net_adj), 'عجز جرد مخزني', v_session.company_id, v_branch_id);
            END IF;

            UPDATE public.journal_entries SET status = 'posted' WHERE id = v_journal_id;
        END IF;
    END IF;

    UPDATE public.audit_sessions
    SET status = 'completed',
        completed_at = NOW(),
        completed_by = v_effective_user_id
    WHERE id = p_session_id;

    UPDATE public.inventory_session_drafts
    SET items = '[]'::jsonb, updated_at = NOW()
    WHERE session_id = p_session_id;

    RETURN jsonb_build_object(
        'status', 'completed',
        'adjusted', v_adj_count,
        'journal_id', v_journal_id
    );
END;
$function$;

-- 6. reverse_audit_session (enforce branch access + match both 'stock_audit' and legacy 'audit')
CREATE OR REPLACE FUNCTION public.reverse_audit_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_session RECORD;
  v_item RECORD;
  v_count int := 0;
BEGIN
  SELECT s.*, w.branch_id AS warehouse_branch_id
  INTO v_session
  FROM public.audit_sessions s
  JOIN public.warehouses w ON w.id = s.warehouse_id AND w.company_id = s.company_id
  WHERE s.id = p_session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'audit_session_not_found: %', p_session_id USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.fn_assert_branch_access(v_session.company_id, v_session.warehouse_branch_id);

  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = v_session.company_id
      AND ucr.role IN ('owner','admin','accountant')
  ) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  IF v_session.status <> 'completed' THEN
    RAISE EXCEPTION 'لا يمكن عكس جلسة جرد غير منجزة (الحالة: %)', v_session.status;
  END IF;

  FOR v_item IN
    SELECT product_id, quantity, transaction_type, unit_cost
    FROM public.inventory_transactions
    WHERE reference_type IN ('stock_audit', 'audit')
      AND reference_id = p_session_id
  LOOP
    PERFORM public.fn_post_inventory_movement(
      v_session.company_id, v_item.product_id, v_session.warehouse_id, v_item.quantity,
      CASE WHEN v_item.transaction_type = 'adj_in' THEN 'adj_out' ELSE 'adj_in' END,
      'audit_reversal', p_session_id, auth.uid(), v_item.unit_cost
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.audit_sessions SET status='cancelled', updated_at=now() WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'session_id', p_session_id, 'movements_reversed', v_count);
END;
$function$;

-- 7. quick_adjust_stock_batch (enforce branch access per warehouse)
CREATE OR REPLACE FUNCTION public.quick_adjust_stock_batch(
    p_company_id uuid,
    p_items jsonb,
    p_notes text DEFAULT 'manual_batch_adjustment'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_user_id       uuid;
    v_company_id    uuid;
    v_item          record;
    v_product       record;
    v_warehouse     record;
    v_current_stock numeric;
    v_target_qty    numeric;
    v_diff          numeric;
    v_adjusted_count integer := 0;
    v_txn_type      text;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    v_company_id := public.verify_company_access(p_company_id);

    IF NOT (public.user_is_admin_or_manager(v_company_id) OR public.has_permission('inventory:adjust', v_company_id)) THEN
        RAISE EXCEPTION 'ليس لديك صلاحية تسوية المخزون' USING ERRCODE = '42501';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'قائمة أصناف التسوية فارغة' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN
        SELECT
            (x.val->>'product_id')::uuid AS product_id,
            (x.val->>'warehouse_id')::uuid AS warehouse_id,
            (x.val->>'quantity')::numeric AS quantity
        FROM jsonb_array_elements(p_items) AS x(val)
        ORDER BY 1, 2
    LOOP
        IF v_item.product_id IS NULL OR v_item.warehouse_id IS NULL THEN
            RAISE EXCEPTION 'معرف المنتج أو المستودع غير صالح' USING ERRCODE = '22023';
        END IF;

        IF v_item.quantity IS NULL OR v_item.quantity < 0 THEN
            RAISE EXCEPTION 'الكمية المستهدفة يجب أن تكون صفراً أو قيمة موجبة' USING ERRCODE = '22023';
        END IF;

        SELECT id, purchase_price, cost_price INTO v_product
        FROM public.products
        WHERE id = v_item.product_id AND company_id = v_company_id AND deleted_at IS NULL;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'المنتج غير موجود أو لا ينتمي للمنشأة: %', v_item.product_id USING ERRCODE = '22023';
        END IF;

        SELECT id, branch_id INTO v_warehouse
        FROM public.warehouses
        WHERE id = v_item.warehouse_id AND company_id = v_company_id AND deleted_at IS NULL;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'المستودع غير موجود أو لا ينتمي للمنشأة: %', v_item.warehouse_id USING ERRCODE = '22023';
        END IF;

        PERFORM public.fn_assert_branch_access(v_company_id, v_warehouse.branch_id);

        SELECT quantity INTO v_current_stock
        FROM public.product_stock
        WHERE product_id = v_item.product_id AND warehouse_id = v_item.warehouse_id AND company_id = v_company_id
        FOR UPDATE;

        IF NOT FOUND THEN
            v_current_stock := 0;
        END IF;

        v_target_qty := v_item.quantity;
        v_diff := v_target_qty - v_current_stock;

        IF v_diff <> 0 THEN
            v_txn_type := CASE WHEN v_diff > 0 THEN 'adj_in' ELSE 'adj_out' END;

            INSERT INTO public.inventory_transactions (
                company_id, product_id, warehouse_id, quantity,
                unit_cost, total_cost, transaction_type,
                reference_type, reference_id, created_by
            ) VALUES (
                v_company_id, v_item.product_id, v_item.warehouse_id, ABS(v_diff),
                COALESCE(v_product.cost_price, v_product.purchase_price, 0),
                ROUND(ABS(v_diff) * COALESCE(v_product.cost_price, v_product.purchase_price, 0), 4),
                v_txn_type, 'manual_adjustment', NULL, v_user_id
            );

            v_adjusted_count := v_adjusted_count + 1;
        END IF;
    END LOOP;

    BEGIN
        PERFORM public.audit_write(
            'stock_batch_adjusted',
            'product_stock',
            NULL,
            v_company_id,
            jsonb_build_object('reason', p_notes, 'item_count', jsonb_array_length(p_items))
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'company_id', v_company_id,
        'adjusted_count', v_adjusted_count
    );
END;
$function$;

-- 8. bulk_adjust_stock (enforce branch access on warehouse)
CREATE OR REPLACE FUNCTION public.bulk_adjust_stock(
    p_company_id uuid,
    p_warehouse_id uuid,
    p_adjustments jsonb,
    p_reason text DEFAULT 'تعديل يدوي'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item         jsonb;
  v_product_id   uuid;
  v_new_qty      numeric;
  v_current_qty  numeric;
  v_diff         numeric;
  v_tx_type      text;
  v_unit_cost    numeric;
  v_prod_cost    numeric;
  v_branch_id    uuid;
  v_adjusted     int := 0;
  v_skipped      int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.role IN ('owner','admin','accountant','manager')
  ) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  SELECT branch_id INTO v_branch_id
  FROM public.warehouses
  WHERE id = p_warehouse_id AND company_id = p_company_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'warehouse_not_found' USING ERRCODE = '22023';
  END IF;

  PERFORM public.fn_assert_branch_access(p_company_id, v_branch_id);

  FOR v_item IN
    SELECT elem FROM jsonb_array_elements(p_adjustments) AS elem
    ORDER BY (elem->>'product_id')
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_new_qty    := GREATEST(0, (v_item->>'new_quantity')::numeric);

    SELECT COALESCE(NULLIF(p.cost_price, 0), p.purchase_price, 0)
    INTO v_prod_cost
    FROM public.products p
    WHERE p.id = v_product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_not_found: %', v_product_id USING ERRCODE = '22023';
    END IF;

    v_current_qty := 0;
    v_unit_cost   := 0;

    SELECT COALESCE(ps.quantity, 0), COALESCE(ps.weighted_avg_cost, 0)
    INTO v_current_qty, v_unit_cost
    FROM public.product_stock ps
    WHERE ps.product_id = v_product_id
      AND ps.warehouse_id = p_warehouse_id
      AND ps.company_id = p_company_id
    FOR UPDATE;

    v_current_qty := COALESCE(v_current_qty, 0);
    v_unit_cost   := COALESCE(NULLIF(v_unit_cost, 0), v_prod_cost, 0);
    v_diff        := v_new_qty - v_current_qty;

    IF ABS(v_diff) < 0.001 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_tx_type := CASE WHEN v_diff > 0 THEN 'adj_in' ELSE 'adj_out' END;

    INSERT INTO public.inventory_transactions(
      company_id, product_id, warehouse_id, quantity,
      transaction_type, reference_type, created_by, unit_cost, total_cost
    ) VALUES (
      p_company_id, v_product_id, p_warehouse_id,
      ABS(v_diff),
      v_tx_type, 'bulk_adjustment', auth.uid(), v_unit_cost,
      ROUND(ABS(v_diff) * v_unit_cost, 4)
    );

    v_adjusted := v_adjusted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'adjusted_count', v_adjusted,
    'skipped_count',  v_skipped,
    'warehouse_id',   p_warehouse_id
  );
END;
$function$;

-- 9. adjust_stock_atomic (enforce branch access on warehouse)
CREATE OR REPLACE FUNCTION public.adjust_stock_atomic(
    p_company_id uuid,
    p_product_id uuid,
    p_warehouse_id uuid,
    p_target_quantity numeric,
    p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid        uuid := COALESCE(auth.uid(), p_user_id);
  v_branch_id  uuid;
  v_current    numeric := 0;
  v_adjustment numeric;
  v_unit_cost  numeric := 0;
  v_txn_type   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT branch_id INTO v_branch_id
  FROM public.warehouses
  WHERE id = p_warehouse_id AND company_id = p_company_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'warehouse_not_found' USING ERRCODE = '22023';
  END IF;

  PERFORM public.fn_assert_branch_access(p_company_id, v_branch_id);

  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_uid
      AND ucr.company_id = p_company_id
      AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية تعديل المخزون' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_target_quantity, -1) < 0 THEN
    RAISE EXCEPTION 'الكمية المستهدفة لا يمكن أن تكون سالبة';
  END IF;

  SELECT COALESCE(ps.quantity, 0), COALESCE(NULLIF(ps.weighted_avg_cost, 0), 0)
    INTO v_current, v_unit_cost
    FROM public.product_stock ps
   WHERE ps.company_id = p_company_id
     AND ps.product_id = p_product_id
     AND ps.warehouse_id = p_warehouse_id
   FOR UPDATE;

  IF NOT FOUND THEN
    v_current := 0;
    v_unit_cost := 0;
  END IF;

  IF v_unit_cost = 0 THEN
    SELECT COALESCE(NULLIF(cost_price, 0), purchase_price, 0) INTO v_unit_cost
    FROM public.products
    WHERE id = p_product_id AND company_id = p_company_id;
    v_unit_cost := COALESCE(v_unit_cost, 0);
  END IF;

  v_adjustment := p_target_quantity - v_current;

  IF v_adjustment <> 0 THEN
    v_txn_type := CASE WHEN v_adjustment > 0 THEN 'adj_in' ELSE 'adj_out' END;

    INSERT INTO public.inventory_transactions (
      company_id, created_by, product_id, warehouse_id, quantity,
      unit_cost, total_cost, transaction_type, reference_type
    ) VALUES (
      p_company_id, v_uid, p_product_id, p_warehouse_id, ABS(v_adjustment),
      v_unit_cost, ROUND(ABS(v_adjustment) * v_unit_cost, 4), v_txn_type, 'manual_update'
    );

    BEGIN
      PERFORM public.audit_write(
        'stock_adjusted',
        'inventory_transactions',
        p_product_id,
        p_company_id,
        jsonb_build_object('warehouse_id', p_warehouse_id, 'adjustment', v_adjustment, 'txn_type', v_txn_type)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'adjustment', v_adjustment, 'new_quantity', p_target_quantity);
END;
$function$;
