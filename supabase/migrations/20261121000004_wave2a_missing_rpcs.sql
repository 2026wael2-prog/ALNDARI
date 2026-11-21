-- ============================================================================
-- Migration: 20261121000004_wave2a_missing_rpcs.sql
-- Wave 2A: Deploy Missing Frontend-Expected RPCs (Quotations, Stock Init,
--          Requisition Numbering/Status, Currency Diffs, Cashbox Seeding/Migration)
-- ============================================================================

-- 1. Quotations idempotency_key column & unique index
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_quotations_company_idempotency
  ON public.quotations (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. Atomic create_quotation RPC
CREATE OR REPLACE FUNCTION public.create_quotation(
  p_company_id uuid,
  p_party_id uuid,
  p_issue_date date,
  p_valid_until date DEFAULT NULL::date,
  p_discount_amount numeric DEFAULT 0,
  p_currency_code text DEFAULT 'SAR'::text,
  p_exchange_rate numeric DEFAULT 1,
  p_notes text DEFAULT NULL::text,
  p_terms_and_conditions text DEFAULT NULL::text,
  p_delivery_terms text DEFAULT NULL::text,
  p_payment_terms text DEFAULT NULL::text,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_idem_key text := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
  v_quotation_id uuid;
  v_quotation_number text;
  v_year text := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_max_seq integer := 0;
  v_subtotal numeric := 0;
  v_discount numeric := GREATEST(0, COALESCE(p_discount_amount, 0));
  v_total numeric := 0;
  v_idx integer := 0;
  v_item record;
  v_line_total numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.fn_assert_company_access(p_company_id);

  IF v_idem_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('quotation:' || p_company_id::text || ':' || v_idem_key));
    SELECT id, quotation_number INTO v_quotation_id, v_quotation_number
    FROM public.quotations
    WHERE company_id = p_company_id AND idempotency_key = v_idem_key AND deleted_at IS NULL
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_quotation_id, 'quotation_number', v_quotation_number, 'is_duplicate', true);
    END IF;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'لا يمكن حفظ عرض سعر بدون أصناف — أضف صنفاً واحداً على الأقل';
  END IF;

  IF COALESCE(p_exchange_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'سعر الصرف يجب أن يكون أكبر من صفر';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, description text, quantity numeric, unit_price numeric, discount_percent numeric)
  LOOP
    IF COALESCE(v_item.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر';
    END IF;
    IF COALESCE(v_item.unit_price, -1) < 0 THEN
      RAISE EXCEPTION 'سعر الوحدة لا يمكن أن يكون سالباً';
    END IF;
    IF COALESCE(v_item.discount_percent, 0) < 0 OR COALESCE(v_item.discount_percent, 0) > 100 THEN
      RAISE EXCEPTION 'نسبة الخصم غير صالحة';
    END IF;
    v_line_total := ROUND(v_item.quantity * v_item.unit_price * (1 - COALESCE(v_item.discount_percent, 0) / 100), 2);
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'قيمة الخصم الإجمالي لا يمكن أن تتجاوز المجموع الفرعي';
  END IF;
  v_total := v_subtotal - v_discount;

  PERFORM pg_advisory_xact_lock(hashtext('quotation_num:' || p_company_id::text || ':sales'));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(quotation_number, '^.*-(\d+)$', '\1'), quotation_number)::integer), 0)
    INTO v_max_seq
  FROM public.quotations
  WHERE company_id = p_company_id
    AND type = 'sales'
    AND quotation_number LIKE 'QT-' || v_year || '-%';

  v_quotation_number := 'QT-' || v_year || '-' || LPAD((v_max_seq + 1)::text, 4, '0');

  INSERT INTO public.quotations (
    company_id, branch_id, quotation_number, type, status, party_id,
    issue_date, valid_until, subtotal, discount_amount, tax_amount, total_amount,
    currency_code, exchange_rate, notes, terms_and_conditions, delivery_terms, payment_terms,
    created_by, idempotency_key
  ) VALUES (
    p_company_id, p_branch_id, v_quotation_number, 'sales', 'draft', p_party_id,
    p_issue_date, p_valid_until, v_subtotal, v_discount, 0, v_total,
    COALESCE(NULLIF(TRIM(p_currency_code), ''), 'SAR'), COALESCE(p_exchange_rate, 1),
    p_notes, p_terms_and_conditions, p_delivery_terms, p_payment_terms,
    v_uid, v_idem_key
  ) RETURNING id INTO v_quotation_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, description text, quantity numeric, unit_price numeric, discount_percent numeric)
  LOOP
    v_line_total := ROUND(v_item.quantity * v_item.unit_price * (1 - COALESCE(v_item.discount_percent, 0) / 100), 2);
    INSERT INTO public.quotation_items (
      quotation_id, company_id, product_id, description, quantity, unit_price, discount_percent, total, sort_order
    ) VALUES (
      v_quotation_id, p_company_id, v_item.product_id, v_item.description,
      v_item.quantity, v_item.unit_price, COALESCE(v_item.discount_percent, 0), v_line_total, v_idx
    );
    v_idx := v_idx + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_quotation_id,
    'quotation_number', v_quotation_number,
    'total_amount', v_total
  );
END;
$function$;

-- 3. Atomic initialize_product_stock_atomic RPC
CREATE OR REPLACE FUNCTION public.initialize_product_stock_atomic(
  p_company_id uuid,
  p_product_id uuid,
  p_warehouse_id uuid,
  p_quantity numeric,
  p_unit_cost numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_qty numeric := COALESCE(p_quantity, 0);
  v_cost numeric := GREATEST(0, COALESCE(p_unit_cost, 0));
  v_tx_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.fn_assert_company_access(p_company_id);

  IF v_qty < 0 THEN
    RAISE EXCEPTION 'الكمية الافتتاحية لا يمكن أن تكون سالبة';
  END IF;

  INSERT INTO public.inventory_transactions (
    company_id, created_by, product_id, warehouse_id,
    quantity, unit_cost, total_cost, transaction_type, reference_type
  ) VALUES (
    p_company_id, v_uid, p_product_id, p_warehouse_id,
    v_qty, v_cost, ROUND(v_qty * v_cost, 4), 'initial', 'opening_balance'
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('id', v_tx_id, 'quantity', v_qty, 'total_cost', ROUND(v_qty * v_cost, 4));
END;
$function$;

-- 4. Requisition numbering & status RPCs
CREATE OR REPLACE FUNCTION public.get_next_requisition_number(p_company_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_next bigint;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  PERFORM pg_advisory_xact_lock(hashtext('prc_pr_number:' || p_company_id::text));

  SELECT COALESCE(MAX((regexp_match(pr_number, '([0-9]+)$'))[1]::bigint), 0) + 1
    INTO v_next
  FROM public.prc_purchase_requests
  WHERE company_id = p_company_id
    AND pr_number ~ ('^PR-' || TO_CHAR(now(), 'YYYYMM') || '-[0-9]+$');

  RETURN 'PR-' || TO_CHAR(now(), 'YYYYMM') || '-' || LPAD(v_next::text, 4, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_sales_requisition_status(p_pr_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company_id uuid;
  v_old_status text;
  v_pr_number text;
  v_new_status text;
BEGIN
  v_new_status := LOWER(TRIM(COALESCE(p_status, '')));
  IF v_new_status NOT IN ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'converted_to_rfq', 'converted_to_po', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_status: unsupported status %', p_status;
  END IF;

  SELECT company_id, status, pr_number
    INTO v_company_id, v_old_status, v_pr_number
    FROM public.prc_purchase_requests
   WHERE pr_id = p_pr_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'requisition_not_found: no requisition with this id';
  END IF;

  PERFORM public.fn_assert_company_access(v_company_id);

  IF v_old_status IN ('converted_to_rfq', 'converted_to_po', 'cancelled') AND v_new_status <> v_old_status THEN
    RAISE EXCEPTION 'invalid_transition: % -> % is not allowed on a converted or cancelled requisition', v_old_status, v_new_status;
  END IF;

  UPDATE public.prc_purchase_requests
     SET status     = v_new_status,
         sent_at    = CASE WHEN v_new_status <> 'draft' THEN COALESCE(sent_at, now()) ELSE sent_at END,
         updated_by = COALESCE(auth.uid(), updated_by),
         updated_at = now()
   WHERE pr_id = p_pr_id;

  BEGIN
    PERFORM public.audit_write(
      'requisition_status_changed',
      'prc_purchase_requests',
      p_pr_id,
      v_company_id,
      jsonb_build_object('pr_number', v_pr_number, 'from', v_old_status, 'to', v_new_status)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'id', p_pr_id, 'pr_number', v_pr_number, 'status', v_new_status);
END;
$function$;

-- 5. Cashbox Migration & Seeding RPCs
CREATE OR REPLACE FUNCTION public.migrate_cashbox_balances_atomic(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_main_id uuid;
  v_sar_id uuid;
  v_main_balance numeric := 0;
  v_amount numeric;
  v_is_debit boolean;
  v_journal_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_uid AND ucr.company_id = p_company_id
      AND ucr.role IN ('owner', 'admin', 'accountant')
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية ترحيل أرصدة الصناديق' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_main_id
  FROM public.accounts
  WHERE company_id = p_company_id AND code = '1010' AND deleted_at IS NULL
  LIMIT 1;
  IF v_main_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على الصندوق الرئيسي';
  END IF;

  SELECT id INTO v_sar_id
  FROM public.accounts
  WHERE company_id = p_company_id AND parent_id = v_main_id AND currency_code = 'SAR' AND deleted_at IS NULL
  LIMIT 1;
  IF v_sar_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على صندوق الكاش السعودي. قم بتقسيم الصندوق أولاً.';
  END IF;

  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
    INTO v_main_balance
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.company_id = p_company_id
    AND jel.account_id = v_main_id
    AND jel.deleted_at IS NULL
    AND je.status = 'posted'
    AND je.deleted_at IS NULL;

  IF v_main_balance = 0 THEN
    RETURN jsonb_build_object('migrated', false, 'message', 'لا يوجد رصيد لنقله في الصندوق الرئيسي.');
  END IF;

  v_amount := ABS(v_main_balance);
  v_is_debit := v_main_balance > 0;

  v_journal_id := public.post_manual_journal(
    p_company_id := p_company_id,
    p_user_id := v_uid,
    p_date := CURRENT_DATE,
    p_description := 'نقل رصيد الصندوق الرئيسي إلى صندوق الكاش السعودي',
    p_lines := jsonb_build_array(
      jsonb_build_object(
        'account_id', v_sar_id,
        'debit', CASE WHEN v_is_debit THEN v_amount ELSE 0 END,
        'credit', CASE WHEN v_is_debit THEN 0 ELSE v_amount END,
        'description', 'نقل رصيد الكاش - السعودي'
      ),
      jsonb_build_object(
        'account_id', v_main_id,
        'debit', CASE WHEN v_is_debit THEN 0 ELSE v_amount END,
        'credit', CASE WHEN v_is_debit THEN v_amount ELSE 0 END,
        'description', 'نقل رصيد الكاش - من الصندوق الرئيسي'
      )
    ),
    p_currency_code := 'SAR',
    p_exchange_rate := 1,
    p_reference_type := 'cashbox_split'
  );

  RETURN jsonb_build_object(
    'migrated', true,
    'journal_id', v_journal_id,
    'amount', v_amount,
    'message', 'تم نقل رصيد الصندوق الرئيسي إلى صندوق الكاش السعودي عبر قيد محاسبي متوازن.'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.seed_sub_cashboxes_atomic(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_main_id uuid;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  IF NOT public.is_super_admin() AND NOT public.user_is_admin_or_manager(p_company_id) THEN
    RAISE EXCEPTION 'access_denied: يتطلب صلاحية مدير أو مالك' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_main_id
  FROM public.accounts
  WHERE company_id = p_company_id AND code = '1010' AND deleted_at IS NULL
  LIMIT 1;

  IF v_main_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على الصندوق الرئيسي (1010)';
  END IF;

  INSERT INTO public.accounts (company_id, code, name_ar, type, currency_code, parent_id, is_system)
  SELECT p_company_id, v.code, v.name_ar, 'asset', v.currency_code, v_main_id, true
  FROM (VALUES
    ('101001', 'صندوق الكاش - ريال سعودي', 'SAR'),
    ('101002', 'صندوق الكاش - ريال يمني', 'YER'),
    ('101003', 'صندوق الكاش - دولار أمريكي', 'USD'),
    ('101004', 'صندوق الكاش - ريال عماني', 'OMR'),
    ('101005', 'صندوق الكاش - يوان صيني', 'CNY')
  ) AS v(code, name_ar, currency_code)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.company_id = p_company_id
      AND a.parent_id = v_main_id
      AND a.currency_code = v.currency_code
      AND a.deleted_at IS NULL
  );

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.seed_yemeni_exchanges_atomic(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_parent_id uuid;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  IF NOT public.is_super_admin() AND NOT public.user_is_admin_or_manager(p_company_id) THEN
    RAISE EXCEPTION 'access_denied: يتطلب صلاحية مدير أو مالك' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_parent_id
  FROM public.accounts
  WHERE company_id = p_company_id AND code = '1030' AND deleted_at IS NULL
  LIMIT 1;

  IF v_parent_id IS NULL THEN
    INSERT INTO public.accounts (company_id, code, name_ar, type, currency_code, is_system)
    VALUES (p_company_id, '1030', 'شركات الصرافة', 'asset', 'SAR', true)
    RETURNING id INTO v_parent_id;
  END IF;

  INSERT INTO public.accounts (company_id, code, name_ar, type, currency_code, parent_id, is_system)
  SELECT p_company_id, v.code, v.name_ar, 'asset', 'SAR', v_parent_id, false
  FROM (VALUES
    ('103001', 'شركة الكريمي للصرافة'),
    ('103002', 'النجم للصرافة والتحويلات'),
    ('103003', 'الامتياز للصرافة'),
    ('103004', 'الياباني للصرافة')
  ) AS v(code, name_ar)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.company_id = p_company_id
      AND a.code = v.code
      AND a.deleted_at IS NULL
  );

  RETURN true;
END;
$function$;

-- 6. Server-Side Currency Diffs & Unrealized FX Gain/Loss Report RPC
CREATE OR REPLACE FUNCTION public.get_currency_diffs_report(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  currency_code text,
  balance numeric,
  unrealized_gain numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_base_currency text;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency
  FROM public.companies c
  WHERE c.id = p_company_id
  LIMIT 1;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  RETURN QUERY
  WITH latest_rates AS (
    SELECT DISTINCT ON (er.currency_code)
      er.currency_code,
      er.rate_to_base
    FROM public.exchange_rates er
    WHERE er.company_id = p_company_id
    ORDER BY er.currency_code, er.effective_date DESC NULLS LAST, er.created_at DESC NULLS LAST
  ),
  foreign_accounts AS (
    SELECT a.id, a.name_ar, a.currency_code
    FROM public.accounts a
    WHERE a.company_id = p_company_id
      AND a.deleted_at IS NULL
      AND a.currency_code IS NOT NULL
      AND a.currency_code <> v_base_currency
  ),
  line_aggs AS (
    SELECT
      jel.account_id,
      SUM(
        CASE WHEN COALESCE(jel.debit_amount, 0) >= COALESCE(jel.credit_amount, 0) THEN 1 ELSE -1 END *
        CASE
          WHEN COALESCE(jel.foreign_amount, 0) > 0 THEN jel.foreign_amount
          WHEN COALESCE(jel.exchange_rate, 1) > 0 AND COALESCE(jel.exchange_rate, 1) <> 1 THEN
            CASE
              WHEN COALESCE(sc.exchange_operator, CASE WHEN fa.currency_code IN ('YER','CNY') THEN 'divide' ELSE 'multiply' END) = 'divide'
                THEN ABS(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) *
                     CASE WHEN jel.exchange_rate < 1 THEN 1.0 / jel.exchange_rate ELSE jel.exchange_rate END
              ELSE ABS(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) / jel.exchange_rate
            END
          ELSE ABS(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0))
        END
      ) AS foreign_balance,
      SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) AS book_value_base
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN foreign_accounts fa ON fa.id = jel.account_id
    LEFT JOIN public.supported_currencies sc ON sc.code = fa.currency_code
    WHERE jel.company_id = p_company_id
      AND jel.deleted_at IS NULL
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
      AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id)
    GROUP BY jel.account_id
  )
  SELECT
    fa.id,
    fa.name_ar AS name,
    fa.currency_code,
    COALESCE(la.foreign_balance, 0)::numeric(14,2) AS balance,
    CASE
      WHEN lr.rate_to_base IS NOT NULL AND lr.rate_to_base > 0 THEN
        ROUND(
          public.fn_to_base_amount(fa.currency_code, COALESCE(la.foreign_balance, 0), lr.rate_to_base, v_base_currency)
          - COALESCE(la.book_value_base, 0),
          2
        )
      ELSE 0::numeric
    END AS unrealized_gain
  FROM foreign_accounts fa
  LEFT JOIN line_aggs la ON la.account_id = fa.id
  LEFT JOIN latest_rates lr ON lr.currency_code = fa.currency_code
  ORDER BY fa.currency_code, fa.name_ar;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_quotation(uuid, uuid, date, date, numeric, text, numeric, text, text, text, text, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_quotation(uuid, uuid, date, date, numeric, text, numeric, text, text, text, text, uuid, jsonb, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.initialize_product_stock_atomic(uuid, uuid, uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.initialize_product_stock_atomic(uuid, uuid, uuid, numeric, numeric) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_next_requisition_number(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_next_requisition_number(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_sales_requisition_status(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_sales_requisition_status(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.migrate_cashbox_balances_atomic(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.migrate_cashbox_balances_atomic(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.seed_sub_cashboxes_atomic(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.seed_sub_cashboxes_atomic(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.seed_yemeni_exchanges_atomic(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.seed_yemeni_exchanges_atomic(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_currency_diffs_report(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_currency_diffs_report(uuid, uuid) TO authenticated, service_role;
