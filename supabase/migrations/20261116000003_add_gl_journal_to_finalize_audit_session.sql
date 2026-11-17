-- Add GL journal entry generation to finalize_audit_session for inventory discrepancies
CREATE OR REPLACE FUNCTION public.finalize_audit_session(
  p_session_id uuid,
  p_user_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
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

    IF v_session.status <> 'active' THEN
        IF v_session.status = 'completed' THEN
            RETURN jsonb_build_object('status', 'already_completed', 'adjusted', 0);
        ELSE
            RAISE EXCEPTION 'لا يمكن اعتماد جلسة جرد ملغاة أو غير نشطة' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF NOT (v_session.company_id IN (SELECT get_auth_companies()) AND user_is_admin_or_manager(v_session.company_id)) THEN
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
        WHERE product_id = (v_item->>'product_id')::UUID
          AND warehouse_id = v_session.warehouse_id
        FOR UPDATE;

        IF NOT FOUND THEN
            v_current_qty := 0;
        END IF;

        v_diff := v_new_qty - v_current_qty;

        INSERT INTO public.product_stock (product_id, warehouse_id, quantity, company_id, updated_by, updated_at)
        VALUES (
            (v_item->>'product_id')::UUID,
            v_session.warehouse_id,
            v_new_qty,
            v_session.company_id,
            v_effective_user_id,
            NOW()
        )
        ON CONFLICT (product_id, warehouse_id)
        DO UPDATE SET
            quantity = EXCLUDED.quantity,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW();

        IF v_diff <> 0 THEN
            SELECT id, purchase_price, cost_price INTO v_product
            FROM public.products
            WHERE id = (v_item->>'product_id')::UUID;

            v_unit_cost := COALESCE(v_product.cost_price, v_product.purchase_price, 0);
            v_line_cost := ROUND(ABS(v_diff) * v_unit_cost, 4);
            v_txn_type := CASE WHEN v_diff > 0 THEN 'adj_in' ELSE 'adj_out' END;

            IF v_diff > 0 THEN
                v_total_adj_gain := v_total_adj_gain + v_line_cost;
            ELSE
                v_total_adj_loss := v_total_adj_loss + v_line_cost;
            END IF;

            INSERT INTO public.inventory_transactions (
                company_id,
                product_id,
                warehouse_id,
                quantity,
                unit_cost,
                total_cost,
                transaction_type,
                reference_type,
                reference_id,
                created_by
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

    -- Post GL adjustment journal entry for net inventory audit variance
    v_net_adj := ROUND(v_total_adj_gain - v_total_adj_loss, 2);
    IF ABS(v_net_adj) > 0.01 THEN
        SELECT w.branch_id INTO v_branch_id
        FROM public.warehouses w
        WHERE w.id = v_session.warehouse_id;

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
                -- Inventory surplus: Dr Inventory, Cr Adjustment/COGS
                INSERT INTO public.journal_entry_lines (
                    journal_entry_id, account_id, debit_amount, credit_amount, description, company_id, branch_id
                ) VALUES
                    (v_journal_id, v_inv_account_id, v_net_adj, 0, 'فائض جرد مخزني', v_session.company_id, v_branch_id),
                    (v_journal_id, v_adj_account_id, 0, v_net_adj, 'فائض جرد مخزني', v_session.company_id, v_branch_id);
            ELSE
                -- Inventory shortage: Dr Adjustment/COGS, Cr Inventory
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

    DELETE FROM public.inventory_session_drafts WHERE session_id = p_session_id;

    RETURN jsonb_build_object(
        'status', 'completed',
        'adjusted', v_adj_count,
        'journal_id', v_journal_id
    );
END;
$function$;
