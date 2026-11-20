-- ============================================================================
-- Migration: 20261119000011_wave1_critical_accounting_stock_and_security_fixes
-- Purpose  : Wave 1 live database remediation on dagfjncoullstrhbjssr:
--   1. Add unique index (company_id, product_id, warehouse_id) on product_stock
--   2. Eliminate double stock mutation in commit_sales_invoice_v2 & finalize_audit_session
--   3. Add payments.idempotency_key + unify create_financial_bond to 18-arg atomic RPC
--   4. Harden void_invoice & void_bond authorization + row locks
--   5. Fix get_dashboard_summary OPEX filter ('51%') & remove broken
--      current_user IN ('postgres', 'supabase_admin') bypass across 4 summary RPCs
--   6. Align user_can_access_branch & get_auth_branches branch manager rules
--   7. Harden & grant incentive_* (including tier state reset in incentive_calculate_period),
--      get_admin_*, get_platform_system_metrics, fn_get_inventory_intelligence_*,
--      and revoke anon/PUBLIC on all business & admin RPCs
-- ============================================================================

-- ── 1. Unique index on product_stock for ON CONFLICT (company_id, product_id, warehouse_id) ──
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_stock_company_product_warehouse
  ON public.product_stock (company_id, product_id, warehouse_id);

-- ── 2. commit_sales_invoice_v2: single stock mutation via trigger + advance_payment sync ──
CREATE OR REPLACE FUNCTION public.commit_sales_invoice_v2(
  p_party_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_items jsonb,
  p_payment_type text DEFAULT 'cash'::text,
  p_notes text DEFAULT NULL::text,
  p_currency_code text DEFAULT 'SAR'::text,
  p_exchange_rate numeric DEFAULT 1,
  p_idempotency_key text DEFAULT NULL::text,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_payment_account_id uuid DEFAULT NULL::uuid,
  p_paid_amount numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_user_role text;
  v_invoice_id uuid;
  v_invoice_number text;
  v_item record;
  v_product_name text;
  v_product_sku text;
  v_db_price numeric;
  v_sale_cost numeric;
  v_unit_base numeric;
  v_min_allowed_price numeric;
  v_exchange_operator text;
  v_line_net numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_total_amount numeric := 0;
  v_total_tax numeric := 0;
  v_total_discount numeric := 0;
  v_warehouse_id uuid;
  v_party_name text;
  v_is_cash boolean;
  v_final_total numeric;
  v_actual_paid numeric;
  v_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_company_id FROM public.user_profiles WHERE id = v_user_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User not associated with any company' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_user_role FROM public.user_company_roles
  WHERE user_id = v_user_id AND company_id = v_company_id LIMIT 1;
  IF v_user_role IS NULL THEN
    SELECT role INTO v_user_role FROM public.user_profiles WHERE id = v_user_id;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_invoice_id FROM public.invoices
    WHERE company_id = v_company_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_invoice_id;
    END IF;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'يجب أن تحتوي الفاتورة على صنف واحد على الأقل';
  END IF;

  SELECT id INTO v_warehouse_id FROM public.warehouses
  WHERE company_id = v_company_id AND is_primary = true AND deleted_at IS NULL
  LIMIT 1;

  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
    WHERE company_id = v_company_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF p_party_id IS NOT NULL THEN
    SELECT name INTO v_party_name FROM public.parties WHERE id = p_party_id AND company_id = v_company_id;
  END IF;

  -- === PHASE 1: VALIDATE ITEMS & PRICES ===
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric,
      warehouse_id uuid, cost_price numeric, discount_amount numeric)
  LOOP
    IF v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'الكمية المدخلة غير صحيحة (%) للصنف', v_item.quantity;
    END IF;

    SELECT name_ar, sku, sale_price, cost_price
    INTO v_product_name, v_product_sku, v_db_price, v_sale_cost
    FROM public.products
    WHERE id = v_item.product_id AND company_id = v_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'الصنف المحدد غير مسجل في بيانات المنشأة';
    END IF;

    IF p_currency_code IS NULL OR p_currency_code = 'SAR' THEN
      v_unit_base := v_item.unit_price;
    ELSE
      SELECT exchange_operator INTO v_exchange_operator
      FROM public.supported_currencies
      WHERE code = p_currency_code
      LIMIT 1;
      v_exchange_operator := COALESCE(v_exchange_operator, 'multiply');
      IF v_exchange_operator = 'divide' AND p_exchange_rate > 0 THEN
        IF p_exchange_rate < 1 THEN
          v_unit_base := v_item.unit_price * p_exchange_rate;
        ELSE
          v_unit_base := v_item.unit_price / p_exchange_rate;
        END IF;
      ELSE
        v_unit_base := v_item.unit_price * p_exchange_rate;
      END IF;
    END IF;

    IF (p_currency_code IS NULL OR p_currency_code = 'SAR') AND v_db_price > 0 AND v_item.unit_price >= 1500 AND (v_item.unit_price / v_db_price) >= 25 THEN
      RAISE EXCEPTION 'currency_inversion_detected: سعر الوحدة المدخل (% ر.س) للصنف "%" أعلى من سعر الكتالوج (% ر.س) بأكثر من 25 ضعفاً. يبدو أن السعر مدخل بالريال اليمني ولكن تم حفظ العملة كالريال السعودي.',
        ROUND(v_item.unit_price, 2), COALESCE(v_product_name, v_product_sku), ROUND(v_db_price, 2)
        USING ERRCODE = '23514';
    END IF;

    IF COALESCE(v_user_role, 'viewer') NOT IN ('owner', 'admin') AND NOT is_super_admin() THEN
      v_min_allowed_price := v_db_price * 0.7;
      IF v_unit_base < v_min_allowed_price THEN
        RAISE EXCEPTION 'سعر البيع (% ر.س) أقل من الحد الأدنى المسموح به (% ر.س) للصنف "%"',
          ROUND(v_unit_base, 2), ROUND(v_min_allowed_price, 2), COALESCE(v_product_name, v_product_sku);
      END IF;
    END IF;

    IF v_item.tax_rate IS NOT NULL AND (v_item.tax_rate < 0 OR v_item.tax_rate > 100) THEN
      RAISE EXCEPTION 'نسبة الضريبة غير صحيحة (%) للصنف "%"', v_item.tax_rate, COALESCE(v_product_name, v_product_sku);
    END IF;

    v_line_net := GREATEST(0, v_item.quantity * v_item.unit_price - COALESCE(v_item.discount_amount, 0));
    v_line_tax := COALESCE(round(v_line_net * COALESCE(v_item.tax_rate, 0) / 100, 4), 0);

    v_total_amount := v_total_amount + v_line_net;
    v_total_discount := v_total_discount + COALESCE(v_item.discount_amount, 0);
    v_total_tax := v_total_tax + v_line_tax;
  END LOOP;

  -- === PHASE 2: GENERATE INVOICE NUMBER ===
  PERFORM pg_advisory_xact_lock(hashtext('invoice_number:' || v_company_id::text || ':sale'));
  v_invoice_number := public.generate_invoice_number(v_company_id, 'sale');

  v_is_cash := coalesce(p_payment_type, 'cash') <> 'credit';
  v_final_total := v_total_amount + v_total_tax;

  IF v_is_cash THEN
    v_actual_paid := v_final_total;
    v_status := 'paid';
  ELSE
    v_actual_paid := LEAST(v_final_total, GREATEST(0, COALESCE(p_paid_amount, 0)));
    IF v_actual_paid >= v_final_total THEN
      v_status := 'paid';
    ELSIF v_actual_paid > 0 THEN
      v_status := 'partially_paid';
    ELSE
      v_status := 'posted';
    END IF;
  END IF;

  -- === PHASE 3: CREATE INVOICE AS DRAFT ===
  INSERT INTO public.invoices (
    company_id, invoice_number, party_id, issue_date, due_date,
    total_amount, tax_amount, discount_amount, payment_method, payment_account_id, status, notes, type,
    created_by, currency_code, exchange_rate, idempotency_key, branch_id, paid_amount
  ) VALUES (
    v_company_id, v_invoice_number, p_party_id, p_invoice_date, p_due_date,
    v_final_total, v_total_tax, v_total_discount, p_payment_type, p_payment_account_id,
    'draft', p_notes, 'sale',
    v_user_id, p_currency_code, p_exchange_rate, p_idempotency_key, p_branch_id,
    0
  ) RETURNING id INTO v_invoice_id;

  -- === PHASE 4: CREATE INVOICE ITEMS + SINGLE STOCK LEDGER MUTATION (via trg_update_product_stock) ===
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric,
      warehouse_id uuid, cost_price numeric, discount_amount numeric)
  LOOP
    SELECT cost_price INTO v_sale_cost FROM public.products
    WHERE id = v_item.product_id AND company_id = v_company_id;

    v_line_net := GREATEST(0, v_item.quantity * v_item.unit_price - COALESCE(v_item.discount_amount, 0));
    v_line_tax := COALESCE(round(v_line_net * COALESCE(v_item.tax_rate, 0) / 100, 4), 0);
    v_line_total := round(v_line_net + v_line_tax, 2);

    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, cost_price,
      discount_amount, tax_amount, total, company_id
    ) VALUES (
      v_invoice_id, v_item.product_id, v_item.quantity, v_item.unit_price,
      COALESCE(v_item.cost_price, v_sale_cost, 0),
      COALESCE(v_item.discount_amount, 0),
      v_line_tax,
      v_line_total, v_company_id
    );

    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity, transaction_type,
      reference_type, reference_id, unit_cost, total_cost, created_by
    ) VALUES (
      v_company_id, v_item.product_id, COALESCE(v_item.warehouse_id, v_warehouse_id),
      -v_item.quantity, 'sales', 'sales_invoice', v_invoice_id,
      COALESCE(v_item.cost_price, v_sale_cost, 0),
      round(v_item.quantity * COALESCE(v_item.cost_price, v_sale_cost, 0), 4),
      v_user_id
    );
  END LOOP;

  -- === PHASE 5: POST INVOICE ===
  UPDATE public.invoices
  SET status = v_status,
      paid_amount = v_actual_paid,
      advance_payment = v_actual_paid
  WHERE id = v_invoice_id;

  RETURN v_invoice_id;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$;

-- ── 3. finalize_audit_session: company-scoped stock lock & single stock mutation ──
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

    IF NOT (v_session.company_id IN (SELECT public.get_auth_companies()) AND public.user_is_admin_or_manager(v_session.company_id)) THEN
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
            -- Guarantee baseline zero-stock row when absent without mutating existing balance
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

            v_unit_cost := COALESCE(v_product.cost_price, v_product.purchase_price, 0);
            v_line_cost := ROUND(ABS(v_diff) * v_unit_cost, 4);
            v_txn_type := CASE WHEN v_diff > 0 THEN 'adj_in' ELSE 'adj_out' END;

            IF v_diff > 0 THEN
                v_total_adj_gain := v_total_adj_gain + v_line_cost;
            ELSE
                v_total_adj_loss := v_total_adj_loss + v_line_cost;
            END IF;

            -- trg_update_product_stock mutates product_stock atomically by +ABS(v_diff) or -ABS(v_diff)
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

    DELETE FROM public.inventory_session_drafts WHERE session_id = p_session_id;

    RETURN jsonb_build_object(
        'status', 'completed',
        'adjusted', v_adj_count,
        'journal_id', v_journal_id
    );
END;
$function$;

-- ── 4. payments.idempotency_key + Unified 18-arg create_financial_bond ──
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_company_idempotency
  ON public.payments (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;

DROP FUNCTION IF EXISTS public.create_financial_bond(
  uuid, text, numeric, text, numeric, numeric, date, uuid, uuid, text, text, uuid, uuid, text, uuid
);

CREATE OR REPLACE FUNCTION public.create_financial_bond(
  p_company_id uuid,
  p_bond_type text,
  p_amount numeric,
  p_currency_code text DEFAULT 'SAR'::text,
  p_exchange_rate numeric DEFAULT 1.0,
  p_foreign_amount numeric DEFAULT NULL::numeric,
  p_date date DEFAULT CURRENT_DATE,
  p_cash_account_id uuid DEFAULT NULL::uuid,
  p_counterparty_id uuid DEFAULT NULL::uuid,
  p_counterparty_type text DEFAULT 'party'::text,
  p_description text DEFAULT ''::text,
  p_invoice_id uuid DEFAULT NULL::uuid,
  p_user_id uuid DEFAULT NULL::uuid,
  p_payment_method text DEFAULT 'cash'::text,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text,
  p_commission_amount numeric DEFAULT 0,
  p_commission_account_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_journal_id uuid;
  v_payment_id uuid;
  v_main_payment_number text;
  v_existing_payment record;
  v_counterparty_account_id uuid;
  v_party_type text;
  v_ref_type text;
  v_party_id uuid := NULL;
  v_base_amount numeric;
  v_foreign_amount numeric;
  v_effective_rate numeric;
  v_inv_currency text;
  v_remaining numeric;
  v_alloc_amount numeric;
  v_uid uuid := auth.uid();
  v_dr_account uuid;
  v_cr_account uuid;
  v_clean_idem text := NULLIF(btrim(p_idempotency_key), '');
  v_comm_amount numeric := COALESCE(p_commission_amount, 0);
  v_comm_payment_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'access_denied: يتطلب تسجيل الدخول' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_uid
      AND ucr.company_id = p_company_id
      AND ucr.role IN ('owner', 'admin', 'manager', 'accountant', 'cashier')
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية إنشاء سند مالي' USING ERRCODE = '42501';
  END IF;

  IF v_clean_idem IS NOT NULL THEN
    SELECT p.id, p.payment_number, p.amount, p.exchange_rate, p.currency_code
    INTO v_existing_payment
    FROM public.payments p
    WHERE p.company_id = p_company_id
      AND p.idempotency_key = v_clean_idem
      AND p.deleted_at IS NULL
    LIMIT 1;

    IF FOUND THEN
      SELECT je.id INTO v_journal_id
      FROM public.journal_entries je
      WHERE je.reference_id = v_existing_payment.id AND je.deleted_at IS NULL
      LIMIT 1;

      RETURN jsonb_build_object(
        'id', v_existing_payment.id,
        'payment_number', v_existing_payment.payment_number,
        'journal_id', v_journal_id,
        'base_amount', public.fn_to_base_amount(v_existing_payment.currency_code, v_existing_payment.amount, v_existing_payment.exchange_rate),
        'foreign_amount', v_existing_payment.amount,
        'exchange_rate', v_existing_payment.exchange_rate,
        'status', 'success',
        'idempotent_replay', true
      );
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_years
    WHERE company_id = p_company_id AND p_date BETWEEN start_date AND end_date AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'التاريخ يقع خارج سنة مالية مفتوحة';
  END IF;

  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب الصندوق / البنك إلزامي';
  END IF;
  PERFORM public.assert_account_belongs_to_company(p_cash_account_id, p_company_id, 'p_cash_account_id');

  IF v_comm_amount < 0 THEN
    RAISE EXCEPTION 'مبلغ العمولة غير صالح';
  END IF;
  IF v_comm_amount > 0 THEN
    IF p_commission_account_id IS NULL THEN
      RAISE EXCEPTION 'حساب مصروف العمولة إلزامي عند تحديد عمولة';
    END IF;
    PERFORM public.assert_account_belongs_to_company(p_commission_account_id, p_company_id, 'p_commission_account_id');
  END IF;

  v_effective_rate := COALESCE(NULLIF(p_exchange_rate, 0), 1.0);
  v_foreign_amount := COALESCE(NULLIF(p_foreign_amount, 0), p_amount);
  v_base_amount    := public.fn_to_base_amount(p_currency_code, v_foreign_amount, v_effective_rate);
  IF p_currency_code = (SELECT base_currency FROM public.companies WHERE id = p_company_id LIMIT 1) THEN
    v_base_amount := v_foreign_amount;
    v_effective_rate := 1.0;
  END IF;

  v_ref_type := CASE p_bond_type
    WHEN 'receipt' THEN 'receipt_bond'
    WHEN 'payment' THEN 'payment_bond'
    WHEN 'disbursement' THEN 'payment_bond'
    WHEN 'transfer' THEN 'transfer_bond'
    ELSE NULL
  END;
  IF v_ref_type IS NULL THEN
    RAISE EXCEPTION 'نوع السند غير صحيح: %', p_bond_type;
  END IF;

  IF p_bond_type = 'transfer' THEN
    PERFORM public.assert_account_belongs_to_company(p_counterparty_id, p_company_id, 'p_counterparty_id (transfer target account)');
    v_counterparty_account_id := p_counterparty_id;
  ELSIF p_counterparty_type = 'account' THEN
    PERFORM public.assert_account_belongs_to_company(p_counterparty_id, p_company_id, 'p_counterparty_id (account)');
    v_counterparty_account_id := p_counterparty_id;
  ELSE
    PERFORM public.assert_party_belongs_to_company(p_counterparty_id, p_company_id, 'p_counterparty_id (party)');
    v_party_id := p_counterparty_id;
    SELECT type INTO v_party_type FROM public.parties WHERE id = p_counterparty_id;
    IF v_party_type IS NULL THEN
      RAISE EXCEPTION 'الطرف التجاري غير موجود: %', p_counterparty_id;
    END IF;
  END IF;

  -- Inserting counterparty_account_id allows trg_auto_post_payment_journal (fn_auto_post_payment_journal)
  -- to auto-post both party and non-party bonds consistently in a single trigger pass.
  INSERT INTO public.payments(
    company_id, branch_id, party_id, counterparty_account_id, type, amount, currency_code, exchange_rate,
    payment_date, payment_method, account_id, reference_type, notes, status, created_by, idempotency_key
  ) VALUES (
    p_company_id, p_branch_id, v_party_id, v_counterparty_account_id,
    CASE WHEN p_bond_type = 'disbursement' THEN 'disbursement' ELSE p_bond_type END,
    v_foreign_amount, p_currency_code, v_effective_rate,
    p_date, p_payment_method, p_cash_account_id, v_ref_type, p_description, 'posted', v_uid, v_clean_idem
  ) RETURNING id, payment_number INTO v_payment_id, v_main_payment_number;

  SELECT id INTO v_journal_id
  FROM public.journal_entries
  WHERE reference_id = v_payment_id AND deleted_at IS NULL
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    IF v_party_id IS NOT NULL THEN
      RAISE EXCEPTION 'auto_post_failed: لم يتم ترحيل السند تلقائياً كما هو متوقع';
    END IF;

    INSERT INTO public.journal_entries(company_id, branch_id, entry_date, description, reference_type, reference_id, status, created_by)
    VALUES (p_company_id, p_branch_id, p_date, p_description, v_ref_type, v_payment_id, 'draft', v_uid)
    RETURNING id INTO v_journal_id;

    IF p_bond_type = 'receipt' THEN
      v_dr_account := p_cash_account_id;
      v_cr_account := v_counterparty_account_id;
    ELSIF p_bond_type = 'transfer' THEN
      v_dr_account := v_counterparty_account_id;
      v_cr_account := p_cash_account_id;
    ELSE
      v_dr_account := v_counterparty_account_id;
      v_cr_account := p_cash_account_id;
    END IF;

    INSERT INTO public.journal_entry_lines(journal_entry_id, account_id, party_id, debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount, company_id, branch_id)
    VALUES
      (v_journal_id, v_dr_account, NULL, v_base_amount, 0, p_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id),
      (v_journal_id, v_cr_account, NULL, 0, v_base_amount, p_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id);

    UPDATE public.journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  IF p_invoice_id IS NOT NULL THEN
    SELECT currency_code, total_amount - COALESCE(paid_amount, 0)
    INTO v_inv_currency, v_remaining
    FROM public.invoices
    WHERE id = p_invoice_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'الفاتورة المحددة غير موجودة ضمن شركة السند';
    END IF;

    IF COALESCE(v_inv_currency, 'SAR') <> COALESCE(p_currency_code, 'SAR') THEN
      RAISE EXCEPTION 'تعذر تخصيص السند: عملة السند (%) تختلف عن عملة الفاتورة (%). سجّل السند بنفس عملة الفاتورة أو اتركه بدون تخصيص',
        COALESCE(p_currency_code, 'SAR'), v_inv_currency;
    END IF;

    IF COALESCE(v_remaining, 0) <= 0 THEN
      RAISE EXCEPTION 'الفاتورة المحددة مسددة بالكامل - لا يمكن تخصيص سند إضافي لها';
    END IF;

    v_alloc_amount := LEAST(v_foreign_amount, v_remaining);

    IF v_alloc_amount > 0 THEN
      INSERT INTO public.payment_allocations(payment_id, invoice_id, amount, company_id)
      VALUES (v_payment_id, p_invoice_id, v_alloc_amount, p_company_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF v_comm_amount > 0 AND p_commission_account_id IS NOT NULL AND v_main_payment_number IS NOT NULL THEN
    INSERT INTO public.payments(
      company_id, branch_id, party_id, counterparty_account_id, payment_number,
      type, amount, currency_code, exchange_rate,
      payment_date, payment_method, account_id, reference_type, reference_id, notes, status, created_by
    ) VALUES (
      p_company_id, p_branch_id, NULL, p_commission_account_id, v_main_payment_number || ':comm',
      'disbursement', v_comm_amount, p_currency_code, v_effective_rate,
      p_date, p_payment_method, p_cash_account_id, 'payment_bond', v_payment_id,
      'عمولة سند: ' || COALESCE(NULLIF(p_description, ''), v_main_payment_number),
      'posted', v_uid
    ) RETURNING id INTO v_comm_payment_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_payment_id,
    'payment_number', v_main_payment_number,
    'journal_id', v_journal_id,
    'commission_payment_id', v_comm_payment_id,
    'base_amount', v_base_amount,
    'foreign_amount', v_foreign_amount,
    'exchange_rate', v_effective_rate,
    'status', 'success'
  );
END;
$function$;

-- ── 5. Harden void_invoice & void_bond ──
CREATE OR REPLACE FUNCTION public.void_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_invoice      RECORD;
  v_new_jes      uuid[];
  v_pay          RECORD;
  v_void_ref     text;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found: %', p_invoice_id;
  END IF;

  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = v_invoice.company_id
      AND ucr.role IN ('owner', 'admin', 'accountant')
  ) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  IF v_invoice.status = 'void' THEN
    RAISE EXCEPTION 'already_void: الفاتورة ملغية مسبقاً';
  END IF;

  IF v_invoice.status = 'draft' THEN
    UPDATE public.invoices SET status = 'void', updated_at = now() WHERE id = p_invoice_id;
    PERFORM public.audit_write(
      'invoice_voided', 'invoices', p_invoice_id, v_invoice.company_id,
      jsonb_build_object('invoice_number', v_invoice.invoice_number, 'reversal_journal_count', 0)
    );
    RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'note', 'draft_cancelled');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_years
    WHERE company_id = v_invoice.company_id
      AND CURRENT_DATE BETWEEN start_date AND end_date AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'fiscal_year_closed: لا يمكن إلغاء فاتورة في سنة مالية مغلقة';
  END IF;

  PERFORM public.fn_reverse_inventory_for_reference(
    p_invoice_id,
    ARRAY['invoice', 'sales_invoice', 'purchase_invoice', 'sale_return', 'sales_return', 'purchase_return'],
    'void_invoice'
  );

  v_new_jes := public.fn_reverse_journal_entries(
    p_invoice_id,
    ARRAY['sales_invoice', 'purchase_invoice', 'sale_return', 'sales_return', 'purchase_return', 'receipt_bond', 'payment_bond'],
    'invoice_void',
    'عكس: ' || v_invoice.invoice_number || ' - ',
    auth.uid(), v_invoice.company_id
  );

  FOR v_pay IN
    SELECT DISTINCT p.id, p.payment_number, p.type
    FROM public.payment_allocations pa
    JOIN public.payments p ON p.id = pa.payment_id
    WHERE pa.invoice_id = p_invoice_id
      AND pa.deleted_at IS NULL
      AND p.company_id = v_invoice.company_id
      AND p.deleted_at IS NULL
      AND p.status <> 'void'
  LOOP
    v_void_ref := CASE
      WHEN v_pay.type = 'receipt' THEN 'receipt_bond_void'
      WHEN v_pay.type = 'transfer' THEN 'transfer_bond_void'
      ELSE 'payment_bond_void'
    END;
    PERFORM public.fn_reverse_journal_entries(
      v_pay.id,
      ARRAY['receipt_bond', 'payment_bond', 'transfer_bond', 'payment'],
      v_void_ref,
      'عكس سند مرتبط بالفاتورة: ' || COALESCE(v_pay.payment_number, '') || ' - ',
      auth.uid(),
      v_invoice.company_id
    );
    UPDATE public.payments SET status = 'void', updated_at = now() WHERE id = v_pay.id;
  END LOOP;

  UPDATE public.invoices SET status = 'void', paid_amount = 0, updated_at = now() WHERE id = p_invoice_id;
  UPDATE public.payment_allocations SET deleted_at = now() WHERE invoice_id = p_invoice_id AND deleted_at IS NULL;

  PERFORM public.audit_write(
    'invoice_voided', 'invoices', p_invoice_id, v_invoice.company_id,
    jsonb_build_object('invoice_number', v_invoice.invoice_number, 'reversal_journal_count', coalesce(array_length(v_new_jes, 1), 0))
  );

  RETURN jsonb_build_object(
    'success', true, 'invoice_id', p_invoice_id, 'invoice_number', v_invoice.invoice_number,
    'reversal_journal_ids', v_new_jes
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.void_bond(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment record;
  v_comm    record;
  v_new_jes uuid[];
  v_void_ref_type text;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_payment IS NULL OR v_payment.status = 'void' THEN
    RAISE EXCEPTION 'Payment not found or already voided';
  END IF;

  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = v_payment.company_id
      AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية إلغاء هذا السند' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_years
    WHERE company_id = v_payment.company_id
      AND v_payment.payment_date BETWEEN start_date AND end_date
      AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'لا يمكن إلغاء سند في سنة مالية مغلقة';
  END IF;

  v_void_ref_type := CASE
    WHEN v_payment.type = 'receipt' THEN 'receipt_bond_void'
    WHEN v_payment.type = 'transfer' THEN 'transfer_bond_void'
    ELSE 'payment_bond_void'
  END;

  v_new_jes := public.fn_reverse_journal_entries(
    p_payment_id,
    ARRAY['receipt_bond', 'payment_bond', 'transfer_bond', 'payment'],
    v_void_ref_type,
    'عكس سند: ' || COALESCE(v_payment.payment_number, '') || ' - ',
    auth.uid(),
    v_payment.company_id
  );

  UPDATE public.payments SET status = 'void', updated_at = now() WHERE id = p_payment_id;

  IF v_payment.payment_number IS NOT NULL THEN
    FOR v_comm IN
      SELECT * FROM public.payments
      WHERE company_id = v_payment.company_id
        AND payment_number = v_payment.payment_number || ':comm'
        AND status <> 'void'
        AND deleted_at IS NULL
      FOR UPDATE
    LOOP
      PERFORM public.fn_reverse_journal_entries(
        v_comm.id,
        ARRAY['receipt_bond', 'payment_bond', 'transfer_bond', 'payment'],
        'payment_bond_void',
        'عكس عمولة سند: ' || COALESCE(v_comm.payment_number, '') || ' - ',
        auth.uid(),
        v_comm.company_id
      );
      UPDATE public.payments SET status = 'void', updated_at = now() WHERE id = v_comm.id;
    END LOOP;
  END IF;

  BEGIN
    PERFORM public.audit_write(
      'bond_voided', 'payments', p_payment_id, v_payment.company_id,
      jsonb_build_object(
        'payment_number', v_payment.payment_number,
        'type', v_payment.type,
        'amount', v_payment.amount,
        'reversal_journal_ids', v_new_jes
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$;

-- ── 6. Align user_can_access_branch & get_auth_branches ──
CREATE OR REPLACE FUNCTION public.user_can_access_branch(p_company_id uuid, p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = auth.uid()
        AND ucr.company_id = p_company_id
        AND (
          p_branch_id IS NULL
          OR ucr.role IN ('owner', 'admin')
          OR ucr.branch_id IS NULL
          OR ucr.branch_id = p_branch_id
        )
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_auth_branches(p_company_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT b.id
  FROM public.branches b
  WHERE b.company_id = p_company_id
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        WHERE ucr.user_id = auth.uid()
          AND ucr.company_id = p_company_id
          AND (
            ucr.role IN ('owner', 'admin')
            OR ucr.branch_id IS NULL
            OR ucr.branch_id = b.id
          )
      )
    );
$function$;

-- ── 7. Summary & Reporting RPCs: Fix OPEX ('51%') and remove broken current_user bypass ──
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    vc uuid;
    v_auth_branches uuid[];
    v_target_branch uuid;
    v_claims text := current_setting('request.jwt.claims', true);
    v_is_privileged boolean;
    v_total_debts NUMERIC := 0;
    v_total_supplier_debts NUMERIC := 0;
    v_total_cogs NUMERIC := 0;
    v_res jsonb;
BEGIN
    vc := public.verify_company_access(p_company_id);

    v_is_privileged := public.is_super_admin()
      OR (v_claims IS NOT NULL AND btrim(v_claims) <> '' AND left(btrim(v_claims), 1) = '{' AND (v_claims::jsonb ->> 'role') = 'service_role')
      OR ((v_claims IS NULL OR btrim(v_claims) = '') AND session_user IN ('postgres', 'supabase_admin'));

    SELECT array_agg(b) INTO v_auth_branches
    FROM public.get_auth_branches(vc) b;

    IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
        IF v_is_privileged THEN
            SELECT array_agg(id) INTO v_auth_branches FROM public.branches WHERE company_id = vc;
        END IF;
    END IF;

    IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
        RETURN jsonb_build_object(
            'total_sales', 0, 'total_purchases', 0, 'total_expenses', 0,
            'total_cogs', 0, 'gross_profit', 0,
            'receipt_bonds', 0, 'payment_bonds', 0, 'total_debts', 0,
            'total_supplier_debts', 0, 'invoice_count', 0
        );
    END IF;

    IF p_branch_id IS NOT NULL THEN
        IF NOT (p_branch_id = ANY(v_auth_branches)) AND NOT v_is_privileged THEN
            RAISE EXCEPTION 'غير مصرح بالوصول إلى بيانات هذا الفرع' USING ERRCODE = '42501';
        END IF;
        v_target_branch := p_branch_id;
    END IF;

    SELECT COALESCE(ROUND(SUM(pb.balance), 2), 0)
    INTO v_total_debts
    FROM public.party_balances pb
    JOIN public.parties pt ON pt.id = pb.party_id
    WHERE pb.company_id = vc
      AND pt.deleted_at IS NULL
      AND pt.type IN ('customer', 'both')
      AND pb.balance > 0
      AND pt.name NOT ILIKE '%صندوق الفايض%'
      AND pt.name NOT ILIKE '%معالجة فوارق%'
      AND (
        (v_target_branch IS NOT NULL AND pt.branch_id = v_target_branch)
        OR (v_target_branch IS NULL AND (pt.branch_id = ANY(v_auth_branches) OR pt.branch_id IS NULL))
      );

    SELECT COALESCE(ROUND(SUM(ABS(pb.balance)), 2), 0)
    INTO v_total_supplier_debts
    FROM public.party_balances pb
    JOIN public.parties pt ON pt.id = pb.party_id
    WHERE pb.company_id = vc
      AND pt.deleted_at IS NULL
      AND pt.type IN ('supplier', 'both')
      AND pb.balance < 0
      AND pt.name NOT ILIKE '%صندوق الفايض%'
      AND pt.name NOT ILIKE '%معالجة فوارق%'
      AND (
        (v_target_branch IS NOT NULL AND pt.branch_id = v_target_branch)
        OR (v_target_branch IS NULL AND (pt.branch_id = ANY(v_auth_branches) OR pt.branch_id IS NULL))
      );

    SELECT COALESCE(ROUND(SUM(
      CASE
        WHEN i.type = 'sale' THEN
          CASE WHEN COALESCE(ii.cost_price, 0) > 0
               THEN public.fn_to_base_amount(i.currency_code, ii.cost_price, i.exchange_rate)
               ELSE COALESCE(NULLIF(p.cost_price, 0), NULLIF(p.purchase_price, 0), 0)
          END * COALESCE(ii.quantity, 0)
        WHEN i.type IN ('sale_return', 'return_sale') THEN
          -CASE WHEN COALESCE(ii.cost_price, 0) > 0
                THEN public.fn_to_base_amount(i.currency_code, ii.cost_price, i.exchange_rate)
                ELSE COALESCE(NULLIF(p.cost_price, 0), NULLIF(p.purchase_price, 0), 0)
           END * COALESCE(ii.quantity, 0)
        ELSE 0
      END
    ), 2), 0)
    INTO v_total_cogs
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    LEFT JOIN public.products p ON p.id = ii.product_id
    WHERE i.company_id = vc
      AND i.deleted_at IS NULL
      AND i.status IN ('posted','paid','confirmed','partially_paid')
      AND i.type IN ('sale', 'sale_return', 'return_sale')
      AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
      AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
      AND (
        (v_target_branch IS NOT NULL AND i.branch_id = v_target_branch)
        OR (v_target_branch IS NULL AND (i.branch_id = ANY(v_auth_branches) OR i.branch_id IS NULL))
      );

    WITH inv_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'sale' AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          WHEN i.type IN ('sale_return', 'return_sale') AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            -1 * public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          ELSE 0
        END), 2), 0) AS total_sales,

        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'purchase' AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          WHEN i.type IN ('purchase_return', 'return_purchase') AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            -1 * public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          ELSE 0
        END), 2), 0) AS total_purchases,

        COUNT(*) FILTER (
          WHERE i.type = 'sale' AND i.status NOT IN ('draft', 'void')
            AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
            AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
        ) AS invoice_count
      FROM public.invoices i
      WHERE i.company_id = vc
        AND i.deleted_at IS NULL
        AND (
          (v_target_branch IS NOT NULL AND i.branch_id = v_target_branch)
          OR (v_target_branch IS NULL AND (i.branch_id = ANY(v_auth_branches) OR i.branch_id IS NULL))
        )
    ),
    pay_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE
          WHEN p.type = 'receipt'
               AND (p_date_from IS NULL OR p.payment_date >= p_date_from)
               AND (p_date_to IS NULL OR p.payment_date <= p_date_to) THEN
            public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)
          ELSE 0
        END), 2), 0) AS receipt_bonds,
        COALESCE(ROUND(SUM(CASE
          WHEN p.type IN ('disbursement', 'payment')
               AND (p_date_from IS NULL OR p.payment_date >= p_date_from)
               AND (p_date_to IS NULL OR p.payment_date <= p_date_to) THEN
            public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)
          ELSE 0
        END), 2), 0) AS payment_bonds
      FROM public.payments p
      WHERE p.company_id = vc AND p.status = 'posted' AND p.deleted_at IS NULL
        AND (
          (v_target_branch IS NOT NULL AND p.branch_id = v_target_branch)
          OR (v_target_branch IS NULL AND (p.branch_id = ANY(v_auth_branches) OR p.branch_id IS NULL))
        )
    ),
    exp_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE
          WHEN a.code LIKE 'MZ-3%' OR (a.type = 'expense' AND a.code NOT LIKE 'MZ-5%' AND a.code NOT LIKE '51%' AND a.code NOT LIKE '312%') THEN
            jel.debit_amount - jel.credit_amount
          ELSE 0
        END), 2), 0) AS total_expenses
      FROM public.journal_entry_lines jel
      JOIN public.accounts a ON a.id = jel.account_id
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      WHERE a.company_id = vc
        AND a.deleted_at IS NULL
        AND jel.deleted_at IS NULL
        AND je.deleted_at IS NULL
        AND je.status = 'posted'
        AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
        AND (p_date_to IS NULL OR je.entry_date <= p_date_to)
        AND (
          (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
          OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
        )
    )
    SELECT jsonb_build_object(
      'total_sales', inv.total_sales,
      'total_purchases', inv.total_purchases,
      'total_expenses', exp.total_expenses,
      'total_cogs', v_total_cogs,
      'gross_profit', ROUND(inv.total_sales - v_total_cogs, 2),
      'receipt_bonds', pay.receipt_bonds,
      'payment_bonds', pay.payment_bonds,
      'total_debts', v_total_debts,
      'total_supplier_debts', v_total_supplier_debts,
      'invoice_count', inv.invoice_count
    ) INTO v_res
    FROM inv_summary inv
    CROSS JOIN pay_summary pay
    CROSS JOIN exp_summary exp;

    RETURN v_res;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_sales_stats_summary(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  vc uuid;
  v_auth_branches uuid[];
  v_target_branch uuid;
  v_claims text := current_setting('request.jwt.claims', true);
  v_is_privileged boolean;
  v_invoice_count bigint := 0;
  v_return_count bigint := 0;
  v_gross_sales numeric := 0;
  v_total_returns numeric := 0;
  v_total_discount numeric := 0;
  v_net_sales numeric := 0;
  v_cash_sales numeric := 0;
  v_credit_sales numeric := 0;
  v_credit_returns numeric := 0;
  v_credit_inline_paid numeric := 0;
  v_payments_receipts numeric := 0;
  v_gl_ar_credits_extra numeric := 0;
  v_receipt_bonds_collected numeric := 0;
  v_total_collected numeric := 0;
  v_total_remaining_credit numeric := 0;
  v_avg_sale numeric := 0;
  v_last_30_sales numeric := 0;
  v_prev_30_sales numeric := 0;
  v_monthly_growth numeric := NULL;
  v_today date := CURRENT_DATE;
BEGIN
  vc := public.verify_company_access(p_company_id);

  v_is_privileged := public.is_super_admin()
    OR (v_claims IS NOT NULL AND btrim(v_claims) <> '' AND left(btrim(v_claims), 1) = '{' AND (v_claims::jsonb ->> 'role') = 'service_role')
    OR ((v_claims IS NULL OR btrim(v_claims) = '') AND session_user IN ('postgres', 'supabase_admin'));

  SELECT array_agg(b) INTO v_auth_branches
  FROM public.get_auth_branches(vc) b;

  IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
    IF v_is_privileged THEN
      SELECT array_agg(id) INTO v_auth_branches FROM public.branches WHERE company_id = vc;
    END IF;
  END IF;

  IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
    RETURN jsonb_build_object(
      'invoice_count', 0, 'return_count', 0,
      'gross_sales', 0, 'total_returns', 0, 'total_discount', 0,
      'net_sales', 0, 'cash_sales', 0, 'credit_sales', 0,
      'receipt_bonds_collected', 0, 'total_collected', 0,
      'total_remaining_credit', 0, 'avg_sale', 0, 'monthly_growth', NULL
    );
  END IF;

  IF p_branch_id IS NOT NULL THEN
    IF NOT (p_branch_id = ANY(v_auth_branches)) AND NOT v_is_privileged THEN
      RAISE EXCEPTION 'غير مصرح بالوصول إلى بيانات هذا الفرع' USING ERRCODE = '42501';
    END IF;
    v_target_branch := p_branch_id;
  END IF;

  WITH inv_norm AS (
    SELECT
      i.type,
      i.issue_date,
      COALESCE(LOWER(TRIM(i.payment_method)), 'cash') AS method,
      CASE
        WHEN i.total_amount IS NULL OR i.total_amount = 0 THEN 0::numeric
        WHEN UPPER(TRIM(COALESCE(i.currency_code, 'SAR'))) = 'SAR' THEN ROUND(i.total_amount, 4)
        WHEN UPPER(TRIM(i.currency_code)) = 'YER' AND COALESCE(i.exchange_rate, 1) < 1 THEN ROUND(i.total_amount, 4)
        WHEN COALESCE(i.exchange_rate, 1) <= 0 THEN ROUND(i.total_amount, 4)
        WHEN COALESCE(i.exchange_rate, 1) < 1 THEN ROUND(i.total_amount * i.exchange_rate, 4)
        WHEN UPPER(TRIM(i.currency_code)) = 'YER' THEN ROUND(i.total_amount / i.exchange_rate, 4)
        ELSE ROUND(i.total_amount * i.exchange_rate, 4)
      END AS base_amt,
      CASE
        WHEN COALESCE(i.paid_amount, 0) <= 0 OR COALESCE(i.total_amount, 0) <= 0 THEN 0::numeric
        WHEN UPPER(TRIM(COALESCE(i.currency_code, 'SAR'))) = 'SAR' THEN ROUND(LEAST(i.total_amount, i.paid_amount), 4)
        WHEN UPPER(TRIM(i.currency_code)) = 'YER' AND COALESCE(i.exchange_rate, 1) < 1 THEN ROUND(LEAST(i.total_amount, i.paid_amount), 4)
        WHEN COALESCE(i.exchange_rate, 1) <= 0 THEN ROUND(LEAST(i.total_amount, i.paid_amount), 4)
        WHEN COALESCE(i.exchange_rate, 1) < 1 THEN ROUND(LEAST(i.total_amount, i.paid_amount) * i.exchange_rate, 4)
        WHEN UPPER(TRIM(i.currency_code)) = 'YER' THEN ROUND(LEAST(i.total_amount, i.paid_amount) / i.exchange_rate, 4)
        ELSE ROUND(LEAST(i.total_amount, i.paid_amount) * i.exchange_rate, 4)
      END AS base_paid,
      CASE
        WHEN i.discount_amount IS NULL OR i.discount_amount = 0 THEN 0::numeric
        WHEN UPPER(TRIM(COALESCE(i.currency_code, 'SAR'))) = 'SAR' THEN ROUND(i.discount_amount, 4)
        WHEN UPPER(TRIM(i.currency_code)) = 'YER' AND COALESCE(i.exchange_rate, 1) < 1 THEN ROUND(i.discount_amount, 4)
        WHEN COALESCE(i.exchange_rate, 1) <= 0 THEN ROUND(i.discount_amount, 4)
        WHEN COALESCE(i.exchange_rate, 1) < 1 THEN ROUND(i.discount_amount * i.exchange_rate, 4)
        WHEN UPPER(TRIM(i.currency_code)) = 'YER' THEN ROUND(i.discount_amount / i.exchange_rate, 4)
        ELSE ROUND(i.discount_amount * i.exchange_rate, 4)
      END AS base_disc
    FROM public.invoices i
    WHERE i.company_id = vc
      AND i.deleted_at IS NULL
      AND i.type IN ('sale', 'sale_return', 'return_sale')
      AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
      AND (
        (v_target_branch IS NOT NULL AND i.branch_id = v_target_branch)
        OR (v_target_branch IS NULL AND (i.branch_id = ANY(v_auth_branches) OR i.branch_id IS NULL))
      )
      AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
      AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
  )
  SELECT
    COUNT(*) FILTER (WHERE type = 'sale'),
    COUNT(*) FILTER (WHERE type IN ('sale_return', 'return_sale')),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'sale'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type IN ('sale_return', 'return_sale')), 2), 0),
    COALESCE(ROUND(SUM(base_disc) FILTER (WHERE type = 'sale'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'sale' AND method = 'cash'), 2), 0)
      - COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type IN ('sale_return', 'return_sale') AND method = 'cash'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'sale' AND method <> 'cash'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type IN ('sale_return', 'return_sale') AND method <> 'cash'), 2), 0),
    COALESCE(ROUND(SUM(base_paid) FILTER (WHERE type = 'sale' AND method <> 'cash'), 2), 0),
    COALESCE(SUM(CASE
      WHEN issue_date >= (v_today - 30) AND type = 'sale' THEN base_amt
      WHEN issue_date >= (v_today - 30) AND type IN ('sale_return', 'return_sale') THEN -base_amt
      ELSE 0
    END), 0),
    COALESCE(SUM(CASE
      WHEN issue_date >= (v_today - 60) AND issue_date < (v_today - 30) AND type = 'sale' THEN base_amt
      WHEN issue_date >= (v_today - 60) AND issue_date < (v_today - 30) AND type IN ('sale_return', 'return_sale') THEN -base_amt
      ELSE 0
    END), 0)
  INTO
    v_invoice_count,
    v_return_count,
    v_gross_sales,
    v_total_returns,
    v_total_discount,
    v_cash_sales,
    v_credit_sales,
    v_credit_returns,
    v_credit_inline_paid,
    v_last_30_sales,
    v_prev_30_sales
  FROM inv_norm;

  v_net_sales := ROUND(v_gross_sales - v_total_returns, 2);
  v_avg_sale := CASE WHEN v_invoice_count > 0 THEN ROUND(v_net_sales / v_invoice_count, 2) ELSE 0 END;

  IF p_date_from IS NOT NULL OR p_date_to IS NOT NULL THEN
    SELECT
      COALESCE(SUM(CASE
        WHEN i.issue_date >= (v_today - 30) AND i.type = 'sale' THEN
          CASE
            WHEN i.total_amount IS NULL OR i.total_amount = 0 THEN 0::numeric
            WHEN UPPER(TRIM(COALESCE(i.currency_code, 'SAR'))) = 'SAR' THEN ROUND(i.total_amount, 4)
            WHEN UPPER(TRIM(i.currency_code)) = 'YER' AND COALESCE(i.exchange_rate, 1) < 1 THEN ROUND(i.total_amount, 4)
            WHEN COALESCE(i.exchange_rate, 1) <= 0 THEN ROUND(i.total_amount, 4)
            WHEN COALESCE(i.exchange_rate, 1) < 1 THEN ROUND(i.total_amount * i.exchange_rate, 4)
            WHEN UPPER(TRIM(i.currency_code)) = 'YER' THEN ROUND(i.total_amount / i.exchange_rate, 4)
            ELSE ROUND(i.total_amount * i.exchange_rate, 4)
          END
        WHEN i.issue_date >= (v_today - 30) AND i.type IN ('sale_return', 'return_sale') THEN
          -CASE
            WHEN i.total_amount IS NULL OR i.total_amount = 0 THEN 0::numeric
            WHEN UPPER(TRIM(COALESCE(i.currency_code, 'SAR'))) = 'SAR' THEN ROUND(i.total_amount, 4)
            WHEN UPPER(TRIM(i.currency_code)) = 'YER' AND COALESCE(i.exchange_rate, 1) < 1 THEN ROUND(i.total_amount, 4)
            WHEN COALESCE(i.exchange_rate, 1) <= 0 THEN ROUND(i.total_amount, 4)
            WHEN COALESCE(i.exchange_rate, 1) < 1 THEN ROUND(i.total_amount * i.exchange_rate, 4)
            WHEN UPPER(TRIM(i.currency_code)) = 'YER' THEN ROUND(i.total_amount / i.exchange_rate, 4)
            ELSE ROUND(i.total_amount * i.exchange_rate, 4)
          END
        ELSE 0
      END), 0),
      COALESCE(SUM(CASE
        WHEN i.issue_date >= (v_today - 60) AND i.issue_date < (v_today - 30) AND i.type = 'sale' THEN
          CASE
            WHEN i.total_amount IS NULL OR i.total_amount = 0 THEN 0::numeric
            WHEN UPPER(TRIM(COALESCE(i.currency_code, 'SAR'))) = 'SAR' THEN ROUND(i.total_amount, 4)
            WHEN UPPER(TRIM(i.currency_code)) = 'YER' AND COALESCE(i.exchange_rate, 1) < 1 THEN ROUND(i.total_amount, 4)
            WHEN COALESCE(i.exchange_rate, 1) <= 0 THEN ROUND(i.total_amount, 4)
            WHEN COALESCE(i.exchange_rate, 1) < 1 THEN ROUND(i.total_amount * i.exchange_rate, 4)
            WHEN UPPER(TRIM(i.currency_code)) = 'YER' THEN ROUND(i.total_amount / i.exchange_rate, 4)
            ELSE ROUND(i.total_amount * i.exchange_rate, 4)
          END
        WHEN i.issue_date >= (v_today - 60) AND i.issue_date < (v_today - 30) AND i.type IN ('sale_return', 'return_sale') THEN
          -CASE
            WHEN i.total_amount IS NULL OR i.total_amount = 0 THEN 0::numeric
            WHEN UPPER(TRIM(COALESCE(i.currency_code, 'SAR'))) = 'SAR' THEN ROUND(i.total_amount, 4)
            WHEN UPPER(TRIM(i.currency_code)) = 'YER' AND COALESCE(i.exchange_rate, 1) < 1 THEN ROUND(i.total_amount, 4)
            WHEN COALESCE(i.exchange_rate, 1) <= 0 THEN ROUND(i.total_amount, 4)
            WHEN COALESCE(i.exchange_rate, 1) < 1 THEN ROUND(i.total_amount * i.exchange_rate, 4)
            WHEN UPPER(TRIM(i.currency_code)) = 'YER' THEN ROUND(i.total_amount / i.exchange_rate, 4)
            ELSE ROUND(i.total_amount * i.exchange_rate, 4)
          END
        ELSE 0
      END), 0)
    INTO v_last_30_sales, v_prev_30_sales
    FROM public.invoices i
    WHERE i.company_id = vc
      AND i.deleted_at IS NULL
      AND i.type IN ('sale', 'sale_return', 'return_sale')
      AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
      AND i.issue_date >= (v_today - 60)
      AND (
        (v_target_branch IS NOT NULL AND i.branch_id = v_target_branch)
        OR (v_target_branch IS NULL AND (i.branch_id = ANY(v_auth_branches) OR i.branch_id IS NULL))
      );
  END IF;

  SELECT COALESCE(ROUND(SUM(
    CASE
      WHEN p.amount IS NULL OR p.amount = 0 THEN 0::numeric
      WHEN UPPER(TRIM(COALESCE(p.currency_code, 'SAR'))) = 'SAR' THEN ROUND(p.amount, 4)
      WHEN COALESCE(p.exchange_rate, 1) <= 0 THEN ROUND(p.amount, 4)
      WHEN COALESCE(p.exchange_rate, 1) < 1 THEN ROUND(p.amount * p.exchange_rate, 4)
      WHEN UPPER(TRIM(p.currency_code)) = 'YER' THEN ROUND(p.amount / p.exchange_rate, 4)
      ELSE ROUND(p.amount * p.exchange_rate, 4)
    END
  ), 2), 0)
  INTO v_payments_receipts
  FROM public.payments p
  JOIN public.parties pt ON pt.id = p.party_id
  WHERE p.company_id = vc
    AND p.deleted_at IS NULL
    AND p.status = 'posted'
    AND p.type = 'receipt'
    AND pt.deleted_at IS NULL
    AND pt.type IN ('customer', 'both')
    AND pt.name NOT ILIKE '%صندوق الفايض%'
    AND pt.name NOT ILIKE '%معالجة فوارق%'
    AND (
      (v_target_branch IS NOT NULL AND p.branch_id = v_target_branch)
      OR (v_target_branch IS NULL AND (p.branch_id = ANY(v_auth_branches) OR p.branch_id IS NULL))
    )
    AND (p_date_from IS NULL OR p.payment_date >= p_date_from)
    AND (p_date_to IS NULL OR p.payment_date <= p_date_to);

  SELECT COALESCE(ROUND(SUM(jel.credit_amount), 2), 0)
  INTO v_gl_ar_credits_extra
  FROM public.journal_entries je
  JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE je.company_id = vc
    AND jel.company_id = vc
    AND a.company_id = vc
    AND a.deleted_at IS NULL
    AND (a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%')
    AND a.name_ar NOT ILIKE '%صندوق الفايض%'
    AND a.name_ar NOT ILIKE '%معالجة فوارق%'
    AND jel.deleted_at IS NULL
    AND je.deleted_at IS NULL
    AND je.status = 'posted'
    AND je.reference_type IN ('voucher', 'other', 'manual', 'settlement', 'receipt_bond')
    AND NOT EXISTS (
      SELECT 1 FROM public.payments p2
      WHERE p2.id = je.reference_id AND p2.deleted_at IS NULL
    )
    AND (
      (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
      OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
    )
    AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
    AND (p_date_to IS NULL OR je.entry_date <= p_date_to);

  v_receipt_bonds_collected := ROUND(v_payments_receipts + v_gl_ar_credits_extra, 2);
  v_total_collected := ROUND(GREATEST(0, v_cash_sales) + v_credit_inline_paid + v_receipt_bonds_collected, 2);

  IF p_date_from IS NULL AND p_date_to IS NULL THEN
    SELECT COALESCE(ROUND(SUM(pb.balance), 2), 0)
    INTO v_total_remaining_credit
    FROM public.party_balances pb
    JOIN public.parties pt ON pt.id = pb.party_id
    WHERE pb.company_id = vc
      AND pt.deleted_at IS NULL
      AND pt.type IN ('customer', 'both')
      AND pb.balance > 0
      AND pt.name NOT ILIKE '%صندوق الفايض%'
      AND pt.name NOT ILIKE '%معالجة فوارق%'
      AND (
        (v_target_branch IS NOT NULL AND pt.branch_id = v_target_branch)
        OR (v_target_branch IS NULL AND (pt.branch_id = ANY(v_auth_branches) OR pt.branch_id IS NULL))
      );
  ELSE
    v_total_remaining_credit := GREATEST(0, ROUND(v_credit_sales - v_credit_returns - v_credit_inline_paid - v_receipt_bonds_collected, 2));
  END IF;

  IF v_prev_30_sales > 0 THEN
    v_monthly_growth := ROUND(((v_last_30_sales - v_prev_30_sales) / v_prev_30_sales) * 100, 2);
  END IF;

  RETURN jsonb_build_object(
    'invoice_count', v_invoice_count,
    'return_count', v_return_count,
    'gross_sales', v_gross_sales,
    'total_returns', v_total_returns,
    'total_discount', v_total_discount,
    'net_sales', v_net_sales,
    'cash_sales', GREATEST(0, v_cash_sales),
    'credit_sales', v_credit_sales,
    'receipt_bonds_collected', v_receipt_bonds_collected,
    'total_collected', v_total_collected,
    'total_remaining_credit', v_total_remaining_credit,
    'avg_sale', v_avg_sale,
    'monthly_growth', v_monthly_growth
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_purchases_stats_summary(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_currency text DEFAULT NULL::text,
  p_payment_method text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  vc uuid;
  v_auth_branches uuid[];
  v_target_branch uuid;
  v_claims text := current_setting('request.jwt.claims', true);
  v_is_privileged boolean;
  v_curr_filter text;
  v_method_filter text;
  v_invoice_count bigint := 0;
  v_return_count bigint := 0;
  v_pending_payment_count bigint := 0;
  v_gross_purchases numeric := 0;
  v_total_returns numeric := 0;
  v_total_discount numeric := 0;
  v_net_purchases numeric := 0;
  v_cash_purchases numeric := 0;
  v_credit_purchases numeric := 0;
  v_credit_returns numeric := 0;
  v_credit_inline_paid numeric := 0;
  v_total_purchases_sar numeric := 0;
  v_total_purchases_yer numeric := 0;
  v_cash_purchases_sar numeric := 0;
  v_cash_purchases_yer numeric := 0;
  v_credit_purchases_sar numeric := 0;
  v_credit_purchases_yer numeric := 0;
  v_payments_bonds_paid numeric := 0;
  v_gl_ap_debits_extra numeric := 0;
  v_supplier_bonds_paid numeric := 0;
  v_total_paid numeric := 0;
  v_total_debt numeric := 0;
  v_yer_net_base numeric := 0;
  v_total_debt_sar numeric := 0;
  v_total_debt_yer numeric := 0;
BEGIN
  vc := public.verify_company_access(p_company_id);

  v_is_privileged := public.is_super_admin()
    OR (v_claims IS NOT NULL AND btrim(v_claims) <> '' AND left(btrim(v_claims), 1) = '{' AND (v_claims::jsonb ->> 'role') = 'service_role')
    OR ((v_claims IS NULL OR btrim(v_claims) = '') AND session_user IN ('postgres', 'supabase_admin'));

  SELECT array_agg(b) INTO v_auth_branches
  FROM public.get_auth_branches(vc) b;

  IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
    IF v_is_privileged THEN
      SELECT array_agg(id) INTO v_auth_branches FROM public.branches WHERE company_id = vc;
    END IF;
  END IF;

  IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
    RETURN jsonb_build_object(
      'invoice_count', 0, 'return_count', 0, 'pending_payment_count', 0,
      'gross_purchases', 0, 'total_returns', 0, 'total_discount', 0,
      'net_purchases', 0, 'cash_purchases', 0, 'credit_purchases', 0,
      'supplier_bonds_paid', 0, 'total_paid', 0, 'total_debt', 0,
      'total_purchases_sar', 0, 'total_purchases_yer', 0,
      'total_debt_sar', 0, 'total_debt_yer', 0,
      'cash_purchases_sar', 0, 'cash_purchases_yer', 0,
      'credit_purchases_sar', 0, 'credit_purchases_yer', 0
    );
  END IF;

  IF p_branch_id IS NOT NULL THEN
    IF NOT (p_branch_id = ANY(v_auth_branches)) AND NOT v_is_privileged THEN
      RAISE EXCEPTION 'غير مصرح بالوصول إلى بيانات هذا الفرع' USING ERRCODE = '42501';
    END IF;
    v_target_branch := p_branch_id;
  END IF;

  v_curr_filter := NULLIF(UPPER(TRIM(COALESCE(p_currency, ''))), '');
  IF v_curr_filter = 'ALL' THEN v_curr_filter := NULL; END IF;

  v_method_filter := NULLIF(LOWER(TRIM(COALESCE(p_payment_method, ''))), '');
  IF v_method_filter = 'all' THEN v_method_filter := NULL; END IF;

  WITH inv_norm AS (
    SELECT
      i.type,
      COALESCE(LOWER(TRIM(i.payment_method)), 'cash') AS method,
      UPPER(TRIM(COALESCE(i.currency_code, 'SAR'))) AS curr,
      i.status,
      i.total_amount,
      COALESCE(i.paid_amount, 0) AS paid_amount,
      public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate) AS base_amt,
      public.fn_invoice_to_base_amount(
        i.currency_code,
        LEAST(COALESCE(i.total_amount, 0), GREATEST(0, COALESCE(i.paid_amount, 0))),
        i.exchange_rate
      ) AS base_paid,
      public.fn_invoice_to_base_amount(i.currency_code, COALESCE(i.discount_amount, 0), i.exchange_rate) AS base_disc,
      CASE
        WHEN UPPER(TRIM(COALESCE(i.currency_code, 'SAR'))) = 'YER'
             AND COALESCE(i.exchange_rate, 1) > 0 AND i.exchange_rate < 1
          THEN ROUND(i.total_amount / i.exchange_rate, 2)
        ELSE COALESCE(i.total_amount, 0)
      END AS nominal_yer_amt
    FROM public.invoices i
    WHERE i.company_id = vc
      AND i.deleted_at IS NULL
      AND i.type IN ('purchase', 'purchase_return', 'return_purchase')
      AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
      AND (
        (v_target_branch IS NOT NULL AND i.branch_id = v_target_branch)
        OR (v_target_branch IS NULL AND (i.branch_id = ANY(v_auth_branches) OR i.branch_id IS NULL))
      )
      AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
      AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
      AND (v_curr_filter IS NULL OR UPPER(TRIM(COALESCE(i.currency_code, 'SAR'))) = v_curr_filter)
      AND (v_method_filter IS NULL OR COALESCE(LOWER(TRIM(i.payment_method)), 'cash') = v_method_filter)
  )
  SELECT
    COUNT(*) FILTER (WHERE type = 'purchase'),
    COUNT(*) FILTER (WHERE type IN ('purchase_return', 'return_purchase')),
    COUNT(*) FILTER (
      WHERE type = 'purchase'
        AND method <> 'cash'
        AND (total_amount - paid_amount) > 0.01
    ),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'purchase'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type IN ('purchase_return', 'return_purchase')), 2), 0),
    COALESCE(ROUND(SUM(base_disc) FILTER (WHERE type = 'purchase'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'purchase' AND method = 'cash'), 2), 0)
      - COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type IN ('purchase_return', 'return_purchase') AND method = 'cash'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'purchase' AND method <> 'cash'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type IN ('purchase_return', 'return_purchase') AND method <> 'cash'), 2), 0),
    COALESCE(ROUND(SUM(base_paid) FILTER (WHERE type = 'purchase' AND method <> 'cash'), 2), 0),
    COALESCE(ROUND(SUM(
      CASE
        WHEN type = 'purchase' AND curr = 'SAR' THEN base_amt
        WHEN type IN ('purchase_return', 'return_purchase') AND curr = 'SAR' THEN -base_amt
        ELSE 0
      END
    ), 2), 0),
    COALESCE(ROUND(SUM(
      CASE
        WHEN type = 'purchase' AND curr = 'YER' THEN nominal_yer_amt
        WHEN type IN ('purchase_return', 'return_purchase') AND curr = 'YER' THEN -nominal_yer_amt
        ELSE 0
      END
    ), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'purchase' AND curr = 'SAR' AND method = 'cash'), 2), 0),
    COALESCE(ROUND(SUM(nominal_yer_amt) FILTER (WHERE type = 'purchase' AND curr = 'YER' AND method = 'cash'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'purchase' AND curr = 'SAR' AND method <> 'cash'), 2), 0),
    COALESCE(ROUND(SUM(nominal_yer_amt) FILTER (WHERE type = 'purchase' AND curr = 'YER' AND method <> 'cash'), 2), 0)
  INTO
    v_invoice_count,
    v_return_count,
    v_pending_payment_count,
    v_gross_purchases,
    v_total_returns,
    v_total_discount,
    v_cash_purchases,
    v_credit_purchases,
    v_credit_returns,
    v_credit_inline_paid,
    v_total_purchases_sar,
    v_total_purchases_yer,
    v_cash_purchases_sar,
    v_cash_purchases_yer,
    v_credit_purchases_sar,
    v_credit_purchases_yer
  FROM inv_norm;

  v_net_purchases := ROUND(v_gross_purchases - v_total_returns, 2);

  IF COALESCE(v_method_filter, 'credit') <> 'cash' THEN
    SELECT COALESCE(ROUND(SUM(public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)), 2), 0)
    INTO v_payments_bonds_paid
    FROM public.payments p
    JOIN public.parties pt ON pt.id = p.party_id
    WHERE p.company_id = vc
      AND p.deleted_at IS NULL
      AND p.status = 'posted'
      AND p.type IN ('disbursement', 'payment')
      AND pt.deleted_at IS NULL
      AND pt.type IN ('supplier', 'both')
      AND pt.name NOT ILIKE '%صندوق الفايض%'
      AND pt.name NOT ILIKE '%معالجة فوارق%'
      AND (
        (v_target_branch IS NOT NULL AND p.branch_id = v_target_branch)
        OR (v_target_branch IS NULL AND (p.branch_id = ANY(v_auth_branches) OR p.branch_id IS NULL))
      )
      AND (p_date_from IS NULL OR p.payment_date >= p_date_from)
      AND (p_date_to IS NULL OR p.payment_date <= p_date_to)
      AND (v_curr_filter IS NULL OR UPPER(TRIM(COALESCE(p.currency_code, 'SAR'))) = v_curr_filter);

    SELECT COALESCE(ROUND(SUM(jel.debit_amount), 2), 0)
    INTO v_gl_ap_debits_extra
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.accounts a ON a.id = jel.account_id
    WHERE je.company_id = vc
      AND a.company_id = vc
      AND a.deleted_at IS NULL
      AND (a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%')
      AND a.name_ar NOT ILIKE '%صندوق الفايض%'
      AND a.name_ar NOT ILIKE '%معالجة فوارق%'
      AND jel.deleted_at IS NULL
      AND je.deleted_at IS NULL
      AND je.status = 'posted'
      AND je.reference_type IN ('voucher', 'other', 'manual', 'settlement', 'payment_bond')
      AND NOT EXISTS (
        SELECT 1 FROM public.payments p2
        WHERE p2.id = je.reference_id AND p2.deleted_at IS NULL
      )
      AND (
        (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
        OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
      )
      AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
      AND (p_date_to IS NULL OR je.entry_date <= p_date_to)
      AND (v_curr_filter IS NULL OR UPPER(TRIM(COALESCE(jel.currency_code, 'SAR'))) = v_curr_filter);
  END IF;

  v_supplier_bonds_paid := ROUND(v_payments_bonds_paid + v_gl_ap_debits_extra, 2);
  v_total_paid := ROUND(GREATEST(0, v_cash_purchases) + v_credit_inline_paid + v_supplier_bonds_paid, 2);

  IF v_method_filter = 'cash' THEN
    v_total_debt := 0;
    v_pending_payment_count := 0;
    v_total_debt_sar := 0;
    v_total_debt_yer := 0;
  ELSIF v_curr_filter IS NULL AND v_method_filter IS NULL AND p_date_from IS NULL AND p_date_to IS NULL THEN
    SELECT COALESCE(ROUND(SUM(ABS(pb.balance)), 2), 0)
    INTO v_total_debt
    FROM public.party_balances pb
    JOIN public.parties pt ON pt.id = pb.party_id
    WHERE pb.company_id = vc
      AND pt.deleted_at IS NULL
      AND pt.type IN ('supplier', 'both')
      AND pb.balance < 0
      AND pt.name NOT ILIKE '%صندوق الفايض%'
      AND pt.name NOT ILIKE '%معالجة فوارق%'
      AND (
        (v_target_branch IS NOT NULL AND pt.branch_id = v_target_branch)
        OR (v_target_branch IS NULL AND (pt.branch_id = ANY(v_auth_branches) OR pt.branch_id IS NULL))
      );

    v_total_debt_sar := v_total_debt;
    v_total_debt_yer := 0;
  ELSE
    v_total_debt := GREATEST(0, ROUND(v_credit_purchases - v_credit_returns - v_credit_inline_paid - v_supplier_bonds_paid, 2));
    IF v_curr_filter = 'YER' THEN
      v_total_debt_sar := 0;
      v_total_debt_yer := v_total_debt;
    ELSE
      v_total_debt_sar := v_total_debt;
      v_total_debt_yer := 0;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'invoice_count', v_invoice_count,
    'return_count', v_return_count,
    'pending_payment_count', v_pending_payment_count,
    'gross_purchases', v_gross_purchases,
    'total_returns', v_total_returns,
    'total_discount', v_total_discount,
    'net_purchases', v_net_purchases,
    'cash_purchases', GREATEST(0, v_cash_purchases),
    'credit_purchases', v_credit_purchases,
    'supplier_bonds_paid', v_supplier_bonds_paid,
    'total_paid', v_total_paid,
    'total_debt', v_total_debt,
    'total_purchases_sar', v_total_purchases_sar,
    'total_purchases_yer', v_total_purchases_yer,
    'total_debt_sar', v_total_debt_sar,
    'total_debt_yer', v_total_debt_yer,
    'cash_purchases_sar', v_cash_purchases_sar,
    'cash_purchases_yer', v_cash_purchases_yer,
    'credit_purchases_sar', v_credit_purchases_sar,
    'credit_purchases_yer', v_credit_purchases_yer
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_debt_followup_dashboard(
  p_company_id uuid,
  p_due_soon_days integer DEFAULT 7,
  p_critical_days integer DEFAULT 30,
  p_reminder_window_days integer DEFAULT 3,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT NULL::integer
)
RETURNS TABLE(
  party_id uuid,
  party_name text,
  party_phone text,
  category text,
  credit_limit numeric,
  currency_code text,
  outstanding_balance numeric,
  overdue_amount numeric,
  oldest_due_date date,
  next_due_date date,
  days_overdue integer,
  classification text,
  reminder_status text,
  last_reminded_at timestamp with time zone,
  last_contact_date timestamp with time zone,
  has_broken_promise boolean,
  pending_promise_count bigint,
  pending_promise_amount numeric,
  pending_promise_date date,
  invoice_count bigint,
  opening_balance numeric,
  escalation_stage text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_allowed_branches uuid[];
    v_target_branches uuid[];
    v_claims text := current_setting('request.jwt.claims', true);
    v_is_super boolean;
    v_has_all_branches boolean := false;
    v_stage_call integer;
    v_stage_visit integer;
    v_stage_legal integer;
    v_effective_limit integer;
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    v_effective_limit := COALESCE(p_limit, 100);

    SELECT c.stage_call_days, c.stage_visit_days, c.stage_legal_days
      INTO v_stage_call, v_stage_visit, v_stage_legal
      FROM public.debt_followup_config c
     WHERE c.company_id = p_company_id
     LIMIT 1;

    v_stage_call  := COALESCE(v_stage_call, 30);
    v_stage_visit := COALESCE(v_stage_visit, 60);
    v_stage_legal := COALESCE(v_stage_legal, 90);

    v_is_super := public.is_super_admin()
      OR (v_claims IS NOT NULL AND btrim(v_claims) <> '' AND left(btrim(v_claims), 1) = '{' AND (v_claims::jsonb ->> 'role') = 'service_role')
      OR ((v_claims IS NULL OR btrim(v_claims) = '') AND session_user IN ('postgres', 'supabase_admin'));

    SELECT ARRAY_AGG(b) INTO v_allowed_branches FROM public.get_auth_branches(p_company_id) AS b;

    IF v_allowed_branches IS NULL OR ARRAY_LENGTH(v_allowed_branches, 1) = 0 THEN
        IF v_is_super THEN
            SELECT ARRAY_AGG(id) INTO v_allowed_branches FROM public.branches WHERE company_id = p_company_id;
        ELSE
            RETURN;
        END IF;
    END IF;

    IF p_branch_id IS NOT NULL THEN
        IF NOT (p_branch_id = ANY(v_allowed_branches)) AND NOT v_is_super THEN
            RETURN;
        END IF;
        v_target_branches := ARRAY[p_branch_id];
    ELSE
        v_target_branches := v_allowed_branches;
        SELECT (COUNT(*) = (SELECT COUNT(*) FROM public.branches WHERE company_id = p_company_id))
        INTO v_has_all_branches
        FROM unnest(v_allowed_branches);
    END IF;

    RETURN QUERY
    WITH ar_accounts AS (
        SELECT a.id
          FROM public.accounts a
         WHERE a.company_id = p_company_id
           AND a.deleted_at IS NULL
           AND (a.code LIKE '121%' OR a.code LIKE 'MZ-121%' OR a.code LIKE '1100%')
    ),
    ledger_debts AS (
        SELECT jel.party_id,
               jel.currency_code::text AS cur,
               sum(
                 CASE
                   WHEN upper(TRIM(BOTH FROM jel.currency_code)) <> 'SAR'
                     THEN COALESCE(NULLIF(jel.foreign_amount, 0), abs(jel.debit_amount - jel.credit_amount))
                          * CASE WHEN jel.debit_amount >= jel.credit_amount THEN 1 ELSE -1 END
                   ELSE jel.debit_amount - jel.credit_amount
                 END
               )::numeric AS outstanding
          FROM public.journal_entry_lines jel
          JOIN public.journal_entries je ON je.id = jel.journal_entry_id
         WHERE jel.company_id = p_company_id
           AND je.company_id = p_company_id
           AND jel.deleted_at IS NULL
           AND jel.party_id IS NOT NULL
           AND jel.currency_code IS NOT NULL
           AND je.status = 'posted'
           AND je.deleted_at IS NULL
           AND jel.account_id IN (SELECT id FROM ar_accounts)
         GROUP BY jel.party_id, jel.currency_code
    ),
    invoice_aging AS (
        SELECT i.party_id,
               SUM(CASE WHEN i.due_date < v_today
                        THEN i.total_amount - COALESCE(i.paid_amount, 0) ELSE 0 END) AS overdue_amount,
               MIN(i.due_date) FILTER (WHERE i.due_date < v_today) AS oldest_due_date,
               MIN(i.due_date) FILTER (WHERE i.due_date >= v_today) AS next_due_date,
               COUNT(*) AS invoice_count
          FROM public.invoices i
         WHERE i.company_id = p_company_id
           AND i.type = 'sale'
           AND i.status IN ('posted', 'confirmed', 'partially_paid')
           AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0
           AND i.deleted_at IS NULL
           AND i.party_id IS NOT NULL
           AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
           AND (p_branch_id IS NOT NULL OR v_is_super OR v_has_all_branches OR i.branch_id = ANY(v_target_branches))
         GROUP BY i.party_id
    ),
    opening_balances AS (
        SELECT ob.party_id,
               ob.currency_code::text AS cur,
               sum(CASE WHEN ob.direction = 'debit' THEN ob.amount ELSE -ob.amount END) AS opening_amount
          FROM public.party_opening_balances ob
         WHERE ob.company_id = p_company_id
           AND (p_branch_id IS NULL OR ob.branch_id = p_branch_id)
           AND (p_branch_id IS NOT NULL OR v_is_super OR v_has_all_branches OR ob.branch_id = ANY(v_target_branches))
         GROUP BY ob.party_id, ob.currency_code
    ),
    combined AS (
        SELECT COALESCE(ld.party_id, ob.party_id) AS party_id,
               COALESCE(ld.cur, ob.cur) AS cur,
               COALESCE(ld.outstanding, 0) + COALESCE(ob.opening_amount, 0) AS outstanding_balance,
               COALESCE(ag.overdue_amount, 0) AS overdue_amount,
               ag.oldest_due_date,
               ag.next_due_date,
               COALESCE(ag.invoice_count, 0) AS invoice_count,
               COALESCE(ob.opening_amount, 0) AS opening_balance
          FROM ledger_debts ld
          FULL OUTER JOIN opening_balances ob ON ob.party_id = ld.party_id AND ob.cur = ld.cur
          LEFT JOIN invoice_aging ag ON ag.party_id = COALESCE(ld.party_id, ob.party_id)
    ),
    ranked_candidates AS (
        SELECT c.party_id,
               p.name::TEXT AS party_name,
               p.phone::TEXT AS party_phone,
               COALESCE(pc.name, '---')::TEXT AS category,
               p.credit_limit,
               c.cur AS currency_code,
               c.outstanding_balance,
               c.overdue_amount,
               c.oldest_due_date,
               c.next_due_date,
               CASE WHEN c.oldest_due_date IS NOT NULL THEN (v_today - c.oldest_due_date) ELSE 0 END AS days_overdue,
               CASE
                   WHEN c.oldest_due_date IS NOT NULL AND (v_today - c.oldest_due_date) >= p_critical_days THEN 'critical'
                   WHEN c.oldest_due_date IS NOT NULL AND c.oldest_due_date < v_today THEN 'overdue'
                   WHEN c.next_due_date = v_today THEN 'due_today'
                   WHEN c.next_due_date IS NOT NULL AND c.next_due_date <= v_today + p_due_soon_days THEN 'due_soon'
                   ELSE 'current'
               END AS classification,
               c.invoice_count,
               c.opening_balance
          FROM combined c
          JOIN public.parties p ON p.id = c.party_id AND p.deleted_at IS NULL AND p.is_collectible
            AND (p_branch_id IS NULL OR p.branch_id = p_branch_id OR p.branch_id IS NULL)
          LEFT JOIN public.party_categories pc ON pc.id = p.category_id
         WHERE c.outstanding_balance > 0
         ORDER BY c.outstanding_balance DESC NULLS LAST
         LIMIT v_effective_limit
    )
    SELECT rc.party_id, rc.party_name, rc.party_phone, rc.category, rc.credit_limit,
           rc.currency_code, rc.outstanding_balance,
           LEAST(rc.overdue_amount, rc.outstanding_balance) AS overdue_amount,
           rc.oldest_due_date, rc.next_due_date, rc.days_overdue, rc.classification,
           CASE
               WHEN lr.last_reminded_at IS NOT NULL
                    AND lr.last_reminded_at >= NOW() - make_interval(days => p_reminder_window_days)
                    THEN 'reminded'
               ELSE 'needs_reminder'
           END AS reminder_status,
           lr.last_reminded_at, lc.last_contact_date,
           COALESCE(ps.has_broken_promise, false) AS has_broken_promise,
           COALESCE(ps.pending_promise_count, 0) AS pending_promise_count,
           COALESCE(ps.pending_promise_amount, 0) AS pending_promise_amount,
           ps.pending_promise_date,
           rc.invoice_count, rc.opening_balance,
           CASE
               WHEN rc.days_overdue >= v_stage_legal THEN 'legal'
               WHEN rc.days_overdue >= v_stage_visit THEN 'visit'
               WHEN rc.days_overdue >= v_stage_call  THEN 'call'
               WHEN rc.days_overdue >  p_critical_days THEN 'reminder'
               ELSE 'monitor'
           END AS escalation_stage
      FROM ranked_candidates rc
      LEFT JOIN LATERAL (
          SELECT BOOL_OR(pp.status = 'broken') AS has_broken_promise,
                 COUNT(*) FILTER (WHERE pp.status = 'pending') AS pending_promise_count,
                 SUM(pp.amount) FILTER (WHERE pp.status = 'pending') AS pending_promise_amount,
                 MIN(pp.promise_date) FILTER (WHERE pp.status = 'pending') AS pending_promise_date
            FROM public.debt_payment_promises pp
           WHERE pp.company_id = p_company_id AND pp.party_id = rc.party_id
      ) ps ON true
      LEFT JOIN LATERAL (
          SELECT ml.created_at AS last_reminded_at
            FROM public.debt_message_log ml
           WHERE ml.company_id = p_company_id AND ml.party_id = rc.party_id AND ml.status = 'sent'
           ORDER BY ml.created_at DESC LIMIT 1
      ) lr ON true
      LEFT JOIN LATERAL (
          SELECT ca.created_at AS last_contact_date
            FROM public.customer_activities ca
           WHERE ca.company_id = p_company_id AND ca.customer_id = rc.party_id
           ORDER BY ca.created_at DESC LIMIT 1
      ) lc ON true
     ORDER BY rc.outstanding_balance DESC NULLS LAST, rc.days_overdue DESC NULLS LAST;
END;
$function$;

-- ── 8. incentive_calculate_period: company-scoped auth + tier state reset ──
CREATE OR REPLACE FUNCTION public.incentive_calculate_period(
  p_company_id uuid,
  p_period_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_period record;
  v_actor uuid;
  v_count integer := 0;
  v_user record;
  v_invoice record;
  v_rule record;
  v_tier record;
  v_tier_id uuid;
  v_calc_id uuid;
  v_gross_sales numeric(16,2);
  v_net_sales numeric(16,2);
  v_gross_profit numeric(16,2);
  v_collected numeric(16,2);
  v_invoice_count integer;
  v_customer_count integer;
  v_target_value numeric(14,2);
  v_target_pct numeric(7,2);
  v_base numeric(16,2);
  v_rule_amount numeric(16,2);
  v_base_commission numeric(16,2);
  v_bonus numeric(16,2);
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  IF NOT (public.user_is_admin_or_manager(p_company_id) OR public.has_permission('commission:calculate', p_company_id)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_period
  FROM public.incentive_periods
  WHERE id = p_period_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'period_not_found';
  END IF;

  PERFORM public.incentive_assert_period_allows(p_period_id, 'calculate');
  v_actor := public.incentive_actor(p_company_id);

  IF EXISTS (
    SELECT 1 FROM public.incentive_calculations
    WHERE company_id = p_company_id
      AND period_id = p_period_id
      AND status IN ('approved','partially_paid','paid','cancelled','reversed')
  ) THEN
    RAISE EXCEPTION 'period_has_immutable_calculations';
  END IF;

  UPDATE public.incentive_periods
     SET state = 'calculating', updated_at = now()
   WHERE id = p_period_id AND company_id = p_company_id;

  DELETE FROM public.incentive_calculations
   WHERE company_id = p_company_id
     AND period_id = p_period_id
     AND status IN ('draft','calculated','eligible');

  FOR v_user IN
    SELECT DISTINCT a.user_id, a.plan_id
    FROM public.incentive_assignments a
    JOIN public.incentive_plans p ON p.id = a.plan_id
      AND p.company_id = p_company_id
      AND p.status = 'active'
      AND p.deleted_at IS NULL
    WHERE a.company_id = p_company_id
      AND a.status = 'active'
      AND a.effective_from <= v_period.period_end
      AND (a.effective_to IS NULL OR a.effective_to >= v_period.period_start)
  LOOP
    SELECT
      COALESCE(SUM(COALESCE(i.subtotal, i.total_amount, 0) * l.allocation_pct / 100), 0),
      COALESCE(SUM(COALESCE(i.total_amount, 0) * l.allocation_pct / 100), 0),
      COALESCE(SUM(COALESCE(ii_metrics.gross_profit, 0) * l.allocation_pct / 100), 0),
      COALESCE(SUM(COALESCE(i.paid_amount, 0) * l.allocation_pct / 100), 0),
      COUNT(DISTINCT i.id),
      COUNT(DISTINCT i.party_id)
    INTO v_gross_sales, v_net_sales, v_gross_profit, v_collected,
         v_invoice_count, v_customer_count
    FROM public.incentive_engineer_links l
    JOIN public.invoices i ON i.id = l.invoice_id
      AND i.company_id = p_company_id
      AND i.type = 'sale'
      AND i.status NOT IN ('cancelled','void')
      AND i.deleted_at IS NULL
      AND i.issue_date BETWEEN v_period.period_start AND v_period.period_end
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(COALESCE(ii.total, 0) - COALESCE(ii.cost_price, 0) * COALESCE(ii.quantity, 0)), 0) AS gross_profit
      FROM public.invoice_items ii
      WHERE ii.invoice_id = i.id AND ii.company_id = p_company_id
    ) ii_metrics ON true
    WHERE l.company_id = p_company_id
      AND l.user_id = v_user.user_id
      AND l.status = 'assigned'
      AND l.allocation_status = 'assigned';

    IF v_invoice_count = 0 THEN
      CONTINUE;
    END IF;

    SELECT t.target_value
      INTO v_target_value
    FROM public.incentive_targets t
    WHERE t.company_id = p_company_id
      AND t.target_scope = 'employee'
      AND t.user_id = v_user.user_id
      AND t.status = 'active'
      AND t.period_start <= v_period.period_end
      AND t.period_end >= v_period.period_start
    ORDER BY t.period_start DESC
    LIMIT 1;

    v_target_pct := CASE
      WHEN COALESCE(v_target_value, 0) > 0 THEN ROUND((v_net_sales / v_target_value) * 100, 2)
      ELSE NULL
    END;
    v_base_commission := 0;
    v_bonus := 0;

    INSERT INTO public.incentive_calculations (
      company_id, period_id, plan_id, user_id,
      gross_sales, net_sales, gross_profit, collected_amount,
      invoice_count, customer_count, target_value, target_achievement_pct,
      base_commission, bonus_amount, adjustment_amount, deduction_amount,
      total_commission, currency_code, status, calculated_at, calculated_by
    )
    SELECT p_company_id, p_period_id, v_user.plan_id, v_user.user_id,
      v_gross_sales, v_net_sales, v_gross_profit, v_collected,
      v_invoice_count, v_customer_count, v_target_value, v_target_pct,
      0, 0, 0, 0, 0, p.currency_code, 'calculated', now(), v_actor
    FROM public.incentive_plans p
    WHERE p.id = v_user.plan_id
    RETURNING id INTO v_calc_id;

    FOR v_rule IN
      SELECT * FROM public.incentive_rules
      WHERE company_id = p_company_id
        AND plan_id = v_user.plan_id
        AND is_active = true
        AND deleted_at IS NULL
      ORDER BY priority, created_at, id
    LOOP
      v_tier := NULL;
      v_tier_id := NULL;
      v_base := CASE v_rule.rule_type
        WHEN 'sales' THEN v_gross_sales
        WHEN 'profit' THEN v_gross_profit
        WHEN 'collection' THEN v_collected
        WHEN 'invoice_count' THEN v_invoice_count
        WHEN 'customer_count' THEN v_customer_count
        WHEN 'target_achievement' THEN COALESCE(v_target_pct, 0)
        ELSE v_net_sales
      END;
      v_rule_amount := 0;

      IF v_rule.calculation_method = 'percentage' THEN
        v_rule_amount := ROUND(v_base * COALESCE(v_rule.rate, 0) / 100, 2);
      ELSIF v_rule.calculation_method = 'fixed_amount' THEN
        v_rule_amount := COALESCE(v_rule.fixed_amount, 0);
      ELSE
        SELECT * INTO v_tier
        FROM public.incentive_tiers
        WHERE company_id = p_company_id
          AND plan_id = v_user.plan_id
          AND (rule_id = v_rule.id OR rule_id IS NULL)
          AND v_base >= from_amount
          AND (to_amount IS NULL OR v_base <= to_amount)
        ORDER BY tier_order DESC
        LIMIT 1;
        IF FOUND THEN
          v_tier_id := v_tier.id;
          v_rule_amount := COALESCE(ROUND(v_base * v_tier.rate / 100, 2), v_tier.fixed_bonus, 0);
        END IF;
      END IF;

      IF v_rule_amount <> 0 THEN
        IF v_rule.rule_type = 'target_achievement' OR v_rule.calculation_method = 'tiered' THEN
          v_bonus := v_bonus + v_rule_amount;
        ELSE
          v_base_commission := v_base_commission + v_rule_amount;
        END IF;
        INSERT INTO public.incentive_calculation_lines (
          calculation_id, company_id, source_type, source_id, rule_id,
          tier_id, description, base_amount, rate, calculated_amount, currency_code
        )
        SELECT v_calc_id, p_company_id,
          CASE WHEN v_rule.rule_type = 'target_achievement' THEN 'target_bonus' ELSE 'invoice_sale' END,
          NULL, v_rule.id, v_tier_id, v_rule.name, v_base, v_rule.rate,
          v_rule_amount, p.currency_code
        FROM public.incentive_plans p
        WHERE p.id = v_user.plan_id;
      END IF;
    END LOOP;

    UPDATE public.incentive_calculations
       SET base_commission = v_base_commission,
           bonus_amount = v_bonus,
           total_commission = v_base_commission + v_bonus,
           updated_at = now()
     WHERE id = v_calc_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.incentive_periods
     SET state = 'calculated', calculated_at = now(), updated_at = now()
   WHERE id = p_period_id AND company_id = p_company_id;

  PERFORM public.incentive_log_audit(
    p_company_id,
    'CALCULATE',
    'incentive_period',
    p_period_id,
    jsonb_build_object('calculation_count', v_count, 'period_state', 'calculated')
  );

  RETURN v_count;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.incentive_periods
       SET state = 'open', updated_at = now()
     WHERE id = p_period_id AND company_id = p_company_id AND state = 'calculating';
    RAISE;
END;
$function$;

-- ── 9. Harden remaining 16 user-facing incentive_* RPCs with tenant assertion & p_company_id guards ──
DO $$
DECLARE
  v_rec RECORD;
  v_def text;
  v_target_names text[] := ARRAY[
    'incentive_apply_adjustment',
    'incentive_approve_invoice_allocation',
    'incentive_create_assignment',
    'incentive_create_engineer_link',
    'incentive_create_plan',
    'incentive_create_rule',
    'incentive_create_target',
    'incentive_deactivate_assignment',
    'incentive_deactivate_target',
    'incentive_detect_pending_invoices',
    'incentive_mark_pending_resolved',
    'incentive_open_period',
    'incentive_period_transition',
    'incentive_record_payment',
    'incentive_revoke_engineer_link',
    'incentive_update_plan',
    'incentive_void_calculation'
  ];
  v_marker text := E'AS $function$';
  v_pos int;
  v_head text;
  v_body text;
BEGIN
  FOR v_rec IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(v_target_names)
      AND p.proname <> 'incentive_calculate_period'
  LOOP
    v_def := pg_get_functiondef(v_rec.oid);

    -- Scope zero-arg helpers to p_company_id (POSIX ERE compatible, no lookbehinds)
    v_def := regexp_replace(
      v_def,
      '\m(public\.)?user_is_admin_or_manager\(\s*\)',
      'public.user_is_admin_or_manager(p_company_id)',
      'gi'
    );
    v_def := regexp_replace(
      v_def,
      '\m(public\.)?has_permission\(\s*([^,)]+)\s*\)',
      'public.has_permission(\2, p_company_id)',
      'gi'
    );

    -- Inject fn_assert_company_access(p_company_id) immediately after opening BEGIN of function body
    IF position('fn_assert_company_access(p_company_id)' IN v_def) = 0 THEN
      v_pos := position(v_marker IN v_def);
      IF v_pos = 0 THEN
        RAISE EXCEPTION 'Missing AS $function$ marker in %', v_rec.proname;
      END IF;
      v_head := left(v_def, v_pos + length(v_marker) - 1);
      v_body := substr(v_def, v_pos + length(v_marker));
      v_body := regexp_replace(
        v_body,
        E'(\\r?\\n)[ \\t]*BEGIN[ \\t]*(\\r?\\n)',
        E'\\1BEGIN\\2  PERFORM public.fn_assert_company_access(p_company_id);\\2',
        'i'
      );
      v_def := v_head || v_body;
    END IF;

    IF position('fn_assert_company_access(p_company_id)' IN v_def) = 0 THEN
      RAISE EXCEPTION 'Failed to inject fn_assert_company_access(p_company_id) into %', v_rec.proname;
    END IF;

    EXECUTE v_def;
  END LOOP;
END;
$$;

-- ── 10. Clean up RPC privileges (REVOKE from PUBLIC/anon, GRANT to authenticated/service_role) ──
DO $$
DECLARE
  v_fn RECORD;
  v_auth_rpcs text[] := ARRAY[
    -- Restored & hardened user-facing RPCs
    'get_admin_companies_count',
    'get_admin_companies_list',
    'get_admin_users_count',
    'get_admin_users_list',
    'get_platform_system_metrics',
    'fn_get_inventory_intelligence_products_page',
    'fn_get_inventory_intelligence_snapshot',
    'fn_get_inventory_intelligence_summary',
    -- Incentive RPCs
    'incentive_apply_adjustment',
    'incentive_approve_invoice_allocation',
    'incentive_calculate_period',
    'incentive_check_allocation_complete',
    'incentive_create_assignment',
    'incentive_create_engineer_link',
    'incentive_create_plan',
    'incentive_create_rule',
    'incentive_create_target',
    'incentive_deactivate_assignment',
    'incentive_deactivate_target',
    'incentive_detect_pending_invoices',
    'incentive_mark_pending_resolved',
    'incentive_open_period',
    'incentive_period_transition',
    'incentive_record_payment',
    'incentive_revoke_engineer_link',
    'incentive_update_plan',
    'incentive_void_calculation',
    -- Business & Dashboard RPCs (strip PUBLIC/anon)
    'commit_sales_invoice_v2',
    'create_financial_bond',
    'finalize_audit_session',
    'fn_process_cross_branch_sale',
    'get_daily_drawer_summary',
    'get_dashboard_bundle',
    'get_dashboard_summary',
    'get_debt_followup_dashboard',
    'get_purchases_stats_summary',
    'get_sales_stats_summary',
    'post_manual_journal',
    'process_sales_return',
    'void_bond',
    'void_invoice',
    -- Branch / RLS helper functions used in client policies
    'user_can_access_branch',
    'get_auth_branches',
    'user_is_admin_or_manager',
    'user_can_manage_debts'
  ];
  v_internal_rpcs text[] := ARRAY[
    'incentive_actor',
    'incentive_assert_period_allows',
    'incentive_detect_pending_invoices_system',
    'incentive_log_audit',
    'fn_run_scheduled_inventory_intelligence'
  ];
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(v_auth_rpcs)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', v_fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', v_fn.sig);
  END LOOP;

  FOR v_fn IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(v_internal_rpcs)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated;', v_fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', v_fn.sig);
  END LOOP;
END;
$$;
