-- ============================================================================
-- Migration: 20261107000002_comprehensive_accounting_currency_and_branch_hardening.sql
-- Description:
--   Comprehensive Accounting, Multi-Currency (fn_to_base_amount), Multi-Branch
--   Warehouse/Cashbox Isolation, Weighted Average Cost (WAC) Negative-Stock
--   Protection, COGS (5100) Isolation, and RPC Ambiguity Cleanup.
--
--   1. Drop ambiguous legacy overloads:
--      - commit_purchase_invoice (13-arg overload)
--      - commit_purchase_return (8-arg and 9-arg overloads)
--      - report_cash_flow (3-arg overload)
--      - report_profit_loss (3-arg overload)
--   2. commit_expense_v2:
--      - Idempotency lock & deduplication on idempotency_key / voucher_number
--      - Exclude COGS (5100 / 51%) from fallback operational expense account
--      - Resolve branch-specific cashbox from fin_cashboxes before generic 101% fallback
--   3. post_manual_journal:
--      - Restore fn_to_base_amount(..., v_base_currency) instead of raw * p_exchange_rate
--        (fixes 410x inflation on manual journals in YER)
--   4. create_financial_bond:
--      - Use fn_to_base_amount(..., v_base_currency) for v_base_amount
--      - Keep single-source-of-truth paid_amount via trg_sync_paid_amount with
--        cross-currency allocation conversion when bond currency != invoice currency
--   5. commit_purchase_invoice (14-arg), commit_purchase_return (10-arg), & commit_sale_return:
--      - Per-branch primary warehouse resolution + per-item warehouse_id support
--      - Convert inventory_transactions.unit_cost & total_cost to base currency
--        via fn_to_base_amount so WAC is never polluted by raw YER unit costs
--      - Set advance_payment = v_actual_paid on purchase invoices
--   6. fn_update_weighted_avg_cost:
--      - Clamp negative old stock GREATEST(COALESCE(v_old_qty, 0), 0) before
--        computing weighted average cost
--   7. get_bonds_stats, get_expense_categories_summary, get_monthly_performance,
--      and get_sales_chart_data:
--      - Use fn_to_base_amount instead of raw * exchange_rate
--      - Remove GREATEST(0, ...) clamping on net revenues/purchases/expenses
--      - Exclude COGS (5100 / 51%) from operational expenses in get_monthly_performance
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1) Drop Ambiguous Function Overloads
-- ============================================================================
DROP FUNCTION IF EXISTS public.commit_purchase_invoice(uuid, uuid, uuid, jsonb, numeric, text, date, text, uuid, text, text, uuid, date);
DROP FUNCTION IF EXISTS public.commit_purchase_return(uuid, uuid, uuid, jsonb, text, text, numeric, uuid);
DROP FUNCTION IF EXISTS public.commit_purchase_return(uuid, uuid, uuid, jsonb, text, text, numeric, uuid, text);
DROP FUNCTION IF EXISTS public.report_cash_flow(uuid, date, date);
DROP FUNCTION IF EXISTS public.report_profit_loss(uuid, date, date);

-- ============================================================================
-- 2) commit_expense_v2 — Idempotency, Branch Cashbox & COGS (5100) Isolation
-- ============================================================================
CREATE OR REPLACE FUNCTION public.commit_expense_v2(p_company_id uuid, p_user_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_expense_id uuid;
  v_voucher_number text;
  v_idempotency_key text;
  v_category_id uuid;
  v_amount numeric;
  v_base_amount numeric;
  v_base_currency text;
  v_currency_code text;
  v_exchange_rate numeric;
  v_date date;
  v_description text;
  v_payment_method text;
  v_branch_id uuid;
  v_fiscal_year_id uuid;
  v_cash_account_id uuid;
  v_expense_account_id uuid;
  v_entry_id uuid;
  v_raw_cat text;
  v_raw_branch text;
  v_raw_amount text;
  v_raw_rate text;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id_required: معرف المنشأة مطلوب';
  END IF;

  PERFORM public.verify_company_access(p_company_id);

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'عذراً، يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
  END IF;

  -- Idempotency guard via advisory lock on idempotency_key or voucher_number
  v_idempotency_key := NULLIF(TRIM(COALESCE(p_data->>'idempotency_key', '')), '');
  v_voucher_number  := NULLIF(TRIM(COALESCE(p_data->>'voucher_number', '')), '');

  IF v_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('expense_idem:' || p_company_id::text || ':' || v_idempotency_key)::bigint
    );
  END IF;

  IF v_voucher_number IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('expense_voucher:' || p_company_id::text || ':' || v_voucher_number)::bigint
    );
    SELECT e.id, e.amount, e.currency_code, e.exchange_rate
      INTO v_expense_id, v_amount, v_currency_code, v_exchange_rate
      FROM public.expenses e
     WHERE e.company_id = p_company_id
       AND e.voucher_number = v_voucher_number
       AND e.deleted_at IS NULL
     LIMIT 1;

    IF v_expense_id IS NOT NULL THEN
      SELECT je.id INTO v_entry_id
        FROM public.journal_entries je
       WHERE je.company_id = p_company_id
         AND je.reference_type = 'expense'
         AND je.reference_id = v_expense_id
         AND je.deleted_at IS NULL
       LIMIT 1;

      RETURN jsonb_build_object(
        'id', v_expense_id,
        'expense_id', v_expense_id,
        'voucher_number', v_voucher_number,
        'journal_entry_id', v_entry_id,
        'amount', v_amount,
        'currency_code', v_currency_code,
        'exchange_rate', v_exchange_rate,
        'status', 'posted',
        'idempotent_replay', true
      );
    END IF;
  END IF;

  -- Base currency of company
  SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency
    FROM public.companies c
   WHERE c.id = p_company_id
   LIMIT 1;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  -- 1) Category resolution
  v_raw_cat := TRIM(COALESCE(p_data->>'category_id', ''));
  IF v_raw_cat <> '' AND v_raw_cat ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_category_id := v_raw_cat::uuid;
  ELSE
    v_category_id := NULL;
  END IF;

  IF v_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.expense_categories ec
    WHERE ec.id = v_category_id AND ec.company_id = p_company_id AND ec.deleted_at IS NULL
  ) THEN
    v_category_id := NULL;
  END IF;

  IF v_category_id IS NULL THEN
    SELECT ec.id INTO v_category_id FROM public.expense_categories ec
    WHERE ec.company_id = p_company_id AND ec.deleted_at IS NULL
    ORDER BY ec.is_system DESC, ec.created_at ASC
    LIMIT 1;

    IF v_category_id IS NULL THEN
      INSERT INTO public.expense_categories (company_id, name, is_system)
      VALUES (p_company_id, 'مصروفات عامة', true)
      RETURNING id INTO v_category_id;
    END IF;
  END IF;

  -- 2) Amount validation
  v_raw_amount := REPLACE(REPLACE(COALESCE(p_data->>'amount', '0'), ',', '.'), ' ', '');
  v_amount := COALESCE(NULLIF(v_raw_amount, '')::numeric, 0);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: مبلغ المصروف يجب أن يكون أكبر من الصفر';
  END IF;

  -- 3) Currency & exchange rate
  v_currency_code := UPPER(COALESCE(NULLIF(TRIM(p_data->>'currency_code'), ''), NULLIF(TRIM(p_data->>'currency'), ''), v_base_currency));

  v_raw_rate := REPLACE(TRIM(COALESCE(p_data->>'exchange_rate', '')), ',', '.');
  IF v_raw_rate <> '' AND v_raw_rate ~ '^[0-9]+(\.[0-9]+)?$' THEN
    v_exchange_rate := v_raw_rate::numeric;
  ELSE
    v_exchange_rate := NULL;
  END IF;

  IF v_currency_code = v_base_currency THEN
    v_exchange_rate := 1;
  ELSIF v_exchange_rate IS NULL OR v_exchange_rate <= 0 THEN
    SELECT er.rate_to_base INTO v_exchange_rate
    FROM public.exchange_rates er
    WHERE er.company_id = p_company_id AND er.currency_code = v_currency_code
    ORDER BY er.effective_date DESC, er.created_at DESC
    LIMIT 1;
    v_exchange_rate := COALESCE(NULLIF(v_exchange_rate, 0), 1);
  END IF;

  -- 4) Base amount conversion
  v_base_amount := public.fn_to_base_amount(v_currency_code, v_amount, v_exchange_rate, v_base_currency);

  -- 5) Date & Branch
  BEGIN
    v_date := COALESCE(
      NULLIF(p_data->>'expense_date', '')::date,
      NULLIF(p_data->>'date', '')::date,
      CURRENT_DATE
    );
  EXCEPTION WHEN OTHERS THEN
    v_date := CURRENT_DATE;
  END;

  v_description := COALESCE(NULLIF(TRIM(p_data->>'description'), ''), 'مصروف نثري');
  v_payment_method := COALESCE(NULLIF(TRIM(p_data->>'payment_method'), ''), 'cash');

  v_raw_branch := TRIM(COALESCE(p_data->>'branch_id', ''));
  IF v_raw_branch <> '' AND v_raw_branch ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_branch_id := v_raw_branch::uuid;
  ELSE
    v_branch_id := NULL;
  END IF;

  -- 6) Open fiscal year
  SELECT fy.id INTO v_fiscal_year_id FROM public.fiscal_years fy
  WHERE fy.company_id = p_company_id AND fy.is_closed = false
    AND v_date BETWEEN fy.start_date AND fy.end_date
  LIMIT 1;

  -- 7) Voucher number
  IF v_voucher_number IS NULL OR v_voucher_number = '' THEN
    IF v_idempotency_key IS NOT NULL THEN
      v_voucher_number := 'EXP-' || to_char(v_date, 'YYYYMMDD') || '-' ||
        UPPER(SUBSTRING(md5(v_idempotency_key), 1, 6));
    ELSE
      v_voucher_number := 'EXP-' || to_char(v_date, 'YYYYMMDD') || '-' ||
        UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 4));
    END IF;
  END IF;

  -- 8) Insert expense
  INSERT INTO public.expenses (
    company_id, category_id, voucher_number, description,
    amount, currency_code, exchange_rate, expense_date,
    status, payment_method, created_by, branch_id
  ) VALUES (
    p_company_id, v_category_id, v_voucher_number, v_description,
    v_amount, v_currency_code, v_exchange_rate, v_date,
    'posted', v_payment_method, v_uid, v_branch_id
  ) RETURNING id INTO v_expense_id;

  -- 9) Resolve Expense Account (excluding COGS 5100 / 51%)
  SELECT a.id INTO v_expense_account_id
  FROM public.expense_categories ec
  JOIN public.accounts a ON a.id = ec.account_id
  WHERE ec.id = v_category_id
    AND a.company_id = p_company_id
    AND a.code <> '5100'
    AND a.code NOT LIKE '51%'
    AND a.allow_posting = true
    AND a.is_active = true
    AND a.deleted_at IS NULL;

  IF v_expense_account_id IS NULL THEN
    SELECT a.id INTO v_expense_account_id FROM public.accounts a
    WHERE a.company_id = p_company_id
      AND (a.type = 'expense' OR a.code LIKE '5%')
      AND a.code <> '5100'
      AND a.code NOT LIKE '51%'
      AND a.allow_posting = true
      AND a.is_active = true
      AND a.deleted_at IS NULL
    ORDER BY CASE WHEN a.code LIKE '52%' THEN 0 WHEN a.code LIKE '5%' THEN 1 ELSE 2 END, a.code
    LIMIT 1;
  END IF;

  -- 10) Resolve Cash/Bank Account (prefer branch cashbox in fin_cashboxes first)
  IF v_payment_method IN ('bank', 'card', 'transfer') THEN
    SELECT a.id INTO v_cash_account_id FROM public.accounts a
    WHERE a.company_id = p_company_id
      AND (a.code LIKE '102%' OR a.code LIKE '1102%')
      AND a.allow_posting = true
      AND a.is_active = true
      AND a.deleted_at IS NULL
    ORDER BY CASE WHEN a.currency_code = v_currency_code THEN 0 ELSE 1 END, a.code
    LIMIT 1;
  END IF;

  IF v_cash_account_id IS NULL AND v_branch_id IS NOT NULL THEN
    SELECT a.id INTO v_cash_account_id
    FROM public.fin_cashboxes fc
    JOIN public.accounts a ON a.id = fc.account_id
    WHERE fc.company_id = p_company_id
      AND fc.branch_id = v_branch_id
      AND COALESCE(fc.is_active, true) = true
      AND a.company_id = p_company_id
      AND a.allow_posting = true
      AND a.is_active = true
      AND a.deleted_at IS NULL
    ORDER BY CASE WHEN COALESCE(fc.currency_code, a.currency_code) = v_currency_code THEN 0 ELSE 1 END,
             fc.is_default DESC NULLS LAST, a.code
    LIMIT 1;
  END IF;

  IF v_cash_account_id IS NULL THEN
    SELECT a.id INTO v_cash_account_id FROM public.accounts a
    WHERE a.company_id = p_company_id
      AND (a.code LIKE '101%' OR a.code LIKE '1101%' OR (a.type = 'asset' AND (a.name_ar LIKE '%صندوق%' OR a.name_ar LIKE '%نقد%' OR a.name_ar LIKE '%كاش%')))
      AND a.allow_posting = true
      AND a.is_active = true
      AND a.deleted_at IS NULL
    ORDER BY CASE WHEN a.currency_code = v_currency_code THEN 0 ELSE 1 END, a.code
    LIMIT 1;
  END IF;

  IF v_cash_account_id IS NULL THEN
    SELECT a.id INTO v_cash_account_id FROM public.accounts a
    WHERE a.company_id = p_company_id
      AND a.type = 'asset'
      AND a.allow_posting = true
      AND a.is_active = true
      AND a.deleted_at IS NULL
    ORDER BY a.code
    LIMIT 1;
  END IF;

  -- 11) Post Journal Entry (draft-first -> lines -> posted)
  IF v_cash_account_id IS NOT NULL AND v_expense_account_id IS NOT NULL THEN
    INSERT INTO public.journal_entries (
      company_id, entry_date, description,
      reference_type, reference_id, status, created_by, branch_id, fiscal_year_id
    ) VALUES (
      p_company_id, v_date, v_description,
      'expense', v_expense_id, 'draft', v_uid, v_branch_id, v_fiscal_year_id
    ) RETURNING id INTO v_entry_id;

    INSERT INTO public.journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount,
      description, currency_code, exchange_rate, foreign_amount, company_id, branch_id
    ) VALUES (
      v_entry_id, v_expense_account_id, v_base_amount, 0,
      v_description, v_currency_code, v_exchange_rate, v_amount, p_company_id, v_branch_id
    );

    INSERT INTO public.journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount,
      description, currency_code, exchange_rate, foreign_amount, company_id, branch_id
    ) VALUES (
      v_entry_id, v_cash_account_id, 0, v_base_amount,
      v_description, v_currency_code, v_exchange_rate, v_amount, p_company_id, v_branch_id
    );

    UPDATE public.journal_entries
    SET status = 'posted'
    WHERE id = v_entry_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_expense_id,
    'expense_id', v_expense_id,
    'voucher_number', v_voucher_number,
    'journal_entry_id', v_entry_id,
    'amount', v_amount,
    'base_amount', v_base_amount,
    'currency_code', v_currency_code,
    'exchange_rate', v_exchange_rate,
    'status', 'posted'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.commit_expense_v2(uuid, uuid, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_expense_v2(uuid, uuid, jsonb) TO authenticated, service_role;

-- ============================================================================
-- 3) post_manual_journal — Restore fn_to_base_amount (prevents 410x YER error)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.post_manual_journal(
  p_company_id uuid,
  p_user_id uuid,
  p_date date,
  p_description text,
  p_lines jsonb,
  p_currency_code text DEFAULT 'SAR'::text,
  p_exchange_rate numeric DEFAULT 1,
  p_reference_type text DEFAULT NULL::text,
  p_branch_id uuid DEFAULT NULL::uuid
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_journal_id    uuid;
  v_line          RECORD;
  v_base_currency text;
  v_base_debit    numeric;
  v_base_credit   numeric;
  v_foreign_amt   numeric;
  v_total_debit   numeric := 0;
  v_total_credit  numeric := 0;
  v_created_by    uuid;
  v_fiscal_year_id uuid;
BEGIN
  PERFORM public.verify_company_access(p_company_id);

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.role IN ('owner','admin','accountant','manager')
  ) THEN
    RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية ترحيل القيود المحاسبية لهذه المنشأة' USING ERRCODE = '42501';
  END IF;

  IF p_exchange_rate IS NULL OR p_exchange_rate <= 0 THEN
    RAISE EXCEPTION 'سعر صرف غير صالح: يجب أن يكون أكبر من صفر';
  END IF;

  SELECT fy.id INTO v_fiscal_year_id
  FROM public.fiscal_years fy
  WHERE fy.company_id = p_company_id
    AND p_date BETWEEN fy.start_date AND fy.end_date
    AND fy.is_closed = false
  LIMIT 1;

  IF v_fiscal_year_id IS NULL THEN
    RAISE EXCEPTION 'لا توجد سنة مالية مفتوحة تغطي تاريخ القيد المحدد';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'لا يمكن ترحيل قيد بدون أسطر';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency
    FROM public.companies c
   WHERE c.id = p_company_id
   LIMIT 1;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines)
    AS x(debit numeric, credit numeric)
  LOOP
    v_total_debit  := v_total_debit  + public.fn_to_base_amount(p_currency_code, COALESCE(v_line.debit,  0), p_exchange_rate, v_base_currency);
    v_total_credit := v_total_credit + public.fn_to_base_amount(p_currency_code, COALESCE(v_line.credit, 0), p_exchange_rate, v_base_currency);
  END LOOP;

  IF v_total_debit <= 0 THEN
    RAISE EXCEPTION 'لا يمكن ترحيل قيد بقيمة صفرية: إجمالي المدين = %', v_total_debit;
  END IF;

  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION 'القيد غير متوازن: المدين (%) لا يساوي الدائن (%)', v_total_debit, v_total_credit;
  END IF;

  v_created_by := COALESCE(auth.uid(), p_user_id);

  INSERT INTO public.journal_entries(
    company_id, branch_id, fiscal_year_id, entry_date, description, reference_type, status, created_by
  ) VALUES (
    p_company_id, p_branch_id, v_fiscal_year_id, p_date, p_description,
    COALESCE(p_reference_type, 'manual'), 'draft', v_created_by
  ) RETURNING id INTO v_journal_id;

  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines)
    AS x(account_id uuid, party_id uuid, debit numeric, credit numeric, description text)
  LOOP
    PERFORM public.assert_account_belongs_to_company(v_line.account_id, p_company_id, 'line.account_id');
    v_base_debit  := public.fn_to_base_amount(p_currency_code, COALESCE(v_line.debit,  0), p_exchange_rate, v_base_currency);
    v_base_credit := public.fn_to_base_amount(p_currency_code, COALESCE(v_line.credit, 0), p_exchange_rate, v_base_currency);
    v_foreign_amt := GREATEST(COALESCE(v_line.debit, 0), COALESCE(v_line.credit, 0));

    INSERT INTO public.journal_entry_lines(
      journal_entry_id, account_id, party_id,
      debit_amount, credit_amount, description,
      currency_code, exchange_rate, foreign_amount, company_id, branch_id
    ) VALUES (
      v_journal_id, v_line.account_id, v_line.party_id,
      v_base_debit, v_base_credit,
      COALESCE(v_line.description, p_description),
      p_currency_code, p_exchange_rate, v_foreign_amt,
      p_company_id, p_branch_id
    );
  END LOOP;

  UPDATE public.journal_entries SET status = 'posted' WHERE id = v_journal_id;

  RETURN v_journal_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.post_manual_journal(uuid, uuid, date, text, jsonb, text, numeric, text, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_manual_journal(uuid, uuid, date, text, jsonb, text, numeric, text, uuid) TO authenticated, service_role;

-- ============================================================================
-- 4) create_financial_bond — fn_to_base_amount & Cross-Currency Invoice Allocation
-- ============================================================================
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
  p_branch_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_journal_id uuid;
  v_payment_id uuid;
  v_counterparty_account_id uuid;
  v_party_type text;
  v_ref_type text;
  v_party_id uuid := NULL;
  v_base_currency text;
  v_base_amount numeric;
  v_foreign_amount numeric;
  v_effective_rate numeric;
  v_uid uuid := auth.uid();
BEGIN
  PERFORM public.verify_company_access(p_company_id);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'عذراً، يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
  END IF;

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr WHERE ucr.user_id = v_uid AND ucr.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية إصدار السندات المالية لهذه المنشأة' USING ERRCODE = '42501';
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

  SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency
    FROM public.companies c
   WHERE c.id = p_company_id
   LIMIT 1;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  v_effective_rate := COALESCE(NULLIF(p_exchange_rate, 0), 1.0);
  v_foreign_amount := COALESCE(NULLIF(p_foreign_amount, 0), p_amount);
  IF UPPER(TRIM(COALESCE(p_currency_code, v_base_currency))) = v_base_currency THEN
    v_effective_rate := 1.0;
    v_base_amount := ROUND(v_foreign_amount, 4);
  ELSE
    v_base_amount := public.fn_to_base_amount(p_currency_code, v_foreign_amount, v_effective_rate, v_base_currency);
  END IF;

  v_ref_type := CASE p_bond_type
    WHEN 'receipt' THEN 'receipt_bond'
    WHEN 'payment' THEN 'payment_bond'
    WHEN 'disbursement' THEN 'payment_bond'
    WHEN 'transfer' THEN 'internal_transfer'
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

  -- 1) Insert payment record
  INSERT INTO public.payments(
    company_id, branch_id, party_id, counterparty_account_id, type, amount, currency_code, exchange_rate,
    payment_date, payment_method, account_id, reference_type, notes, status, created_by
  ) VALUES (
    p_company_id, p_branch_id, v_party_id,
    CASE WHEN v_party_id IS NULL THEN v_counterparty_account_id ELSE NULL END,
    CASE WHEN p_bond_type = 'receipt' THEN 'receipt'
         WHEN p_bond_type = 'transfer' THEN 'transfer'
         ELSE 'disbursement' END,
    v_foreign_amount, p_currency_code, v_effective_rate,
    p_date, p_payment_method, p_cash_account_id, v_ref_type, p_description, 'posted', v_uid
  ) RETURNING id INTO v_payment_id;

  -- 2) Verify auto-posted journal entry from trigger
  SELECT id INTO v_journal_id FROM public.journal_entries
   WHERE reference_id = v_payment_id AND deleted_at IS NULL
   ORDER BY created_at LIMIT 1;

  IF v_journal_id IS NULL THEN
    IF v_party_id IS NOT NULL THEN
      RAISE EXCEPTION 'auto_post_failed: لم يتم ترحيل السند تلقائياً كما هو متوقع';
    END IF;

    INSERT INTO public.journal_entries(company_id, branch_id, entry_date, description, reference_type, reference_id, status, created_by)
    VALUES (p_company_id, p_branch_id, p_date, p_description,
            CASE WHEN p_bond_type = 'transfer' THEN 'transfer_bond' ELSE 'payment_bond' END,
            v_payment_id, 'draft', v_uid)
    RETURNING id INTO v_journal_id;

    IF p_bond_type = 'receipt' THEN
      INSERT INTO public.journal_entry_lines(journal_entry_id, account_id, party_id, debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount, company_id, branch_id)
      VALUES
        (v_journal_id, p_cash_account_id, NULL, v_base_amount, 0, p_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id),
        (v_journal_id, v_counterparty_account_id, NULL, 0, v_base_amount, p_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id);
    ELSE
      INSERT INTO public.journal_entry_lines(journal_entry_id, account_id, party_id, debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount, company_id, branch_id)
      VALUES
        (v_journal_id, v_counterparty_account_id, NULL, v_base_amount, 0, p_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id),
        (v_journal_id, p_cash_account_id, NULL, 0, v_base_amount, p_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id);
    END IF;

    UPDATE public.journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  -- 3) Atomic Invoice Allocation (supports cross-currency conversion & single-source trigger sync)
  IF p_invoice_id IS NOT NULL THEN
    DECLARE
      v_locked_id uuid;
      v_inv_currency text;
      v_inv_rate numeric;
      v_alloc_amount numeric;
      v_remaining numeric;
    BEGIN
      SELECT i.id, COALESCE(NULLIF(TRIM(i.currency_code), ''), v_base_currency), COALESCE(NULLIF(i.exchange_rate, 0), 1)
        INTO v_locked_id, v_inv_currency, v_inv_rate
        FROM public.invoices i
       WHERE i.id = p_invoice_id AND i.company_id = p_company_id AND i.deleted_at IS NULL
       FOR UPDATE;

      IF v_locked_id IS NULL THEN
        RAISE EXCEPTION 'الفاتورة المحددة غير موجودة أو لا تتبع هذه المنشأة.' USING ERRCODE = '22023';
      END IF;

      -- Convert bond amount into invoice currency when currencies differ
      IF UPPER(TRIM(COALESCE(p_currency_code, v_base_currency))) = UPPER(v_inv_currency) THEN
        v_alloc_amount := v_foreign_amount;
      ELSIF UPPER(v_inv_currency) = v_base_currency THEN
        v_alloc_amount := v_base_amount;
      ELSIF UPPER(v_inv_currency) = 'YER' AND v_inv_rate > 1 THEN
        v_alloc_amount := ROUND(v_base_amount * v_inv_rate, 4);
      ELSIF v_inv_rate > 0 THEN
        v_alloc_amount := ROUND(v_base_amount / v_inv_rate, 4);
      ELSE
        v_alloc_amount := v_foreign_amount;
      END IF;

      SELECT ROUND(i.total_amount - COALESCE(i.paid_amount, 0), 4) INTO v_remaining
      FROM public.invoices i WHERE i.id = p_invoice_id;

      IF ROUND(v_alloc_amount, 4) > v_remaining + 0.01 THEN
        RAISE EXCEPTION 'المبلغ المخصص (%) يتجاوز المتبقي على الفاتورة (%); عدّل المبلغ أو أزل ربط الفاتورة.',
          ROUND(v_alloc_amount, 2), ROUND(v_remaining, 2) USING ERRCODE = '22003';
      END IF;

      INSERT INTO public.payment_allocations(payment_id, invoice_id, amount, company_id)
      VALUES (v_payment_id, p_invoice_id, v_alloc_amount, p_company_id) ON CONFLICT DO NOTHING;

      -- paid_amount is updated automatically by trg_sync_paid_amount
      UPDATE public.invoices SET updated_at = now()
      WHERE id = p_invoice_id AND company_id = p_company_id;
    END;
  END IF;

  RETURN jsonb_build_object(
    'id', v_payment_id,
    'payment_number', (SELECT payment_number FROM public.payments WHERE id = v_payment_id),
    'journal_id', v_journal_id,
    'base_amount', v_base_amount,
    'foreign_amount', v_foreign_amount,
    'exchange_rate', v_effective_rate,
    'status', 'success'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_financial_bond(uuid, text, numeric, text, numeric, numeric, date, uuid, uuid, text, text, uuid, uuid, text, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_financial_bond(uuid, text, numeric, text, numeric, numeric, date, uuid, uuid, text, text, uuid, uuid, text, uuid) TO authenticated, service_role;

-- ============================================================================
-- 5) commit_purchase_invoice (14-arg), commit_purchase_return (10-arg) & commit_sale_return
-- ============================================================================
CREATE OR REPLACE FUNCTION public.commit_purchase_invoice(
  p_company_id uuid,
  p_user_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_exchange_rate numeric DEFAULT 1.0,
  p_currency text DEFAULT 'SAR'::text,
  p_issue_date date DEFAULT CURRENT_DATE,
  p_payment_method text DEFAULT 'credit'::text,
  p_payment_account_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text,
  p_invoice_number text DEFAULT NULL::text,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_due_date date DEFAULT NULL::date,
  p_paid_amount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid                  uuid := auth.uid();
  v_invoice_id           uuid;
  v_gen_number           text;
  v_base_currency        text;
  v_subtotal             numeric(14,4) := 0;
  v_tax_total            numeric(14,4) := 0;
  v_total                numeric(14,4) := 0;
  v_item                 jsonb;
  v_product              record;
  v_primary_wh_id        uuid;
  v_item_wh_id           uuid;
  v_journal_id           uuid;
  v_qty                  numeric;
  v_unit_cost            numeric;
  v_base_unit_cost       numeric;
  v_item_tax             numeric;
  v_item_discount        numeric;
  v_line_total           numeric;
  v_actual_paid          numeric;
  v_status               text;
BEGIN
  PERFORM public.verify_company_access(p_company_id);

  IF v_uid IS NULL OR (NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_uid AND ucr.company_id = p_company_id
  )) THEN
    RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية اعتماد فواتير المشتريات' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_years
    WHERE company_id = p_company_id
      AND p_issue_date BETWEEN start_date AND end_date
      AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'تاريخ الفاتورة يقع خارج سنة مالية مفتوحة';
  END IF;

  IF COALESCE(p_exchange_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'سعر الصرف يجب أن يكون أكبر من صفر';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency
    FROM public.companies c
   WHERE c.id = p_company_id
   LIMIT 1;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  -- Branch-scoped primary warehouse resolution
  SELECT id INTO v_primary_wh_id FROM public.warehouses
  WHERE company_id = p_company_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND is_primary = true
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_primary_wh_id IS NULL THEN
    SELECT id INTO v_primary_wh_id FROM public.warehouses
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF v_primary_wh_id IS NULL THEN
    SELECT id INTO v_primary_wh_id FROM public.warehouses
    WHERE company_id = p_company_id AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1;
  END IF;

  IF v_primary_wh_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد مستودع مُعرَّف للشركة/الفرع';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE company_id = p_company_id AND code = '2100' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'حساب الدائنين (2100) غير موجود';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE company_id = p_company_id AND code = '1200' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'حساب المخزون (1200) غير موجود';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('invoice_number:' || p_company_id::text || ':purchase'));

  v_gen_number := CASE
    WHEN p_invoice_number IS NOT NULL AND TRIM(p_invoice_number) != ''
    THEN p_invoice_number
    ELSE public.get_next_invoice_number(p_company_id, 'purchase')
  END;

  INSERT INTO public.invoices(
    company_id, branch_id, party_id, invoice_number, type, status,
    issue_date, due_date, notes, created_by, currency_code, exchange_rate,
    payment_method, payment_account_id, subtotal, tax_amount, total_amount, paid_amount, advance_payment
  ) VALUES (
    p_company_id, p_branch_id, p_supplier_id, v_gen_number, 'purchase', 'draft',
    p_issue_date, p_due_date, p_notes, v_uid, p_currency, p_exchange_rate,
    p_payment_method, p_payment_account_id, 0, 0, 0, 0, 0
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND company_id = p_company_id AND deleted_at IS NULL;
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'المنتج غير موجود: %', v_item->>'product_id';
    END IF;

    v_qty           := COALESCE((v_item->>'quantity')::numeric, 0);
    v_unit_cost     := COALESCE((v_item->>'unit_cost')::numeric, (v_item->>'unit_price')::numeric, v_product.purchase_price);
    v_item_tax      := COALESCE((v_item->>'tax_amount')::numeric, 0);
    v_item_discount := COALESCE((v_item->>'discount_amount')::numeric, 0);
    v_line_total    := ROUND((v_qty * v_unit_cost) - v_item_discount + v_item_tax, 4);

    IF v_qty <= 0 THEN RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر'; END IF;

    -- Per-item warehouse override (if valid for this company)
    v_item_wh_id := NULL;
    IF COALESCE(v_item->>'warehouse_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT w.id INTO v_item_wh_id
      FROM public.warehouses w
      WHERE w.id = (v_item->>'warehouse_id')::uuid
        AND w.company_id = p_company_id
        AND w.deleted_at IS NULL;
    END IF;
    v_item_wh_id := COALESCE(v_item_wh_id, v_primary_wh_id);

    -- Convert unit_cost to base currency for inventory valuation & WAC trigger
    v_base_unit_cost := public.fn_to_base_amount(p_currency, v_unit_cost, p_exchange_rate, v_base_currency);

    INSERT INTO public.invoice_items(
      invoice_id, product_id, description, quantity,
      unit_price, cost_price, discount_amount, tax_amount,
      tax_rate_id, total, company_id
    ) VALUES (
      v_invoice_id, v_product.id, v_product.name_ar, v_qty,
      v_unit_cost, v_base_unit_cost, v_item_discount, v_item_tax,
      NULLIF(v_item->>'tax_rate_id','')::uuid,
      v_line_total, p_company_id
    );

    INSERT INTO public.inventory_transactions(
      company_id, product_id, warehouse_id, quantity,
      transaction_type, reference_type, reference_id, created_by,
      unit_cost, total_cost
    ) VALUES (
      p_company_id, v_product.id, v_item_wh_id, v_qty,
      'purchase', 'invoice', v_invoice_id, v_uid,
      v_base_unit_cost, ROUND(v_qty * v_base_unit_cost, 4)
    );

    v_subtotal  := v_subtotal  + ROUND(v_qty * v_unit_cost - v_item_discount, 4);
    v_tax_total := v_tax_total + v_item_tax;
  END LOOP;

  v_total := v_subtotal + v_tax_total;

  IF COALESCE(p_payment_method, 'credit') <> 'credit' THEN
    v_actual_paid := v_total;
    v_status := 'posted';
  ELSE
    v_actual_paid := LEAST(v_total, GREATEST(0, COALESCE(p_paid_amount, 0)));
    IF v_actual_paid >= v_total THEN
      v_status := 'posted';
    ELSIF v_actual_paid > 0 THEN
      v_status := 'partially_paid';
    ELSE
      v_status := 'posted';
    END IF;
  END IF;

  UPDATE public.invoices
  SET subtotal = v_subtotal,
      tax_amount = v_tax_total,
      total_amount = v_total,
      paid_amount = v_actual_paid,
      advance_payment = v_actual_paid,
      status = v_status
  WHERE id = v_invoice_id;

  SELECT je.id INTO v_journal_id
  FROM public.journal_entries je
  WHERE je.reference_id = v_invoice_id
    AND je.reference_type = 'purchase_invoice'
    AND je.deleted_at IS NULL
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    RAISE EXCEPTION 'فشل الترحيل المحاسبي التلقائي لفاتورة الشراء % - لم يُنشأ أي قيد', v_gen_number;
  END IF;

  RETURN jsonb_build_object(
    'id',             v_invoice_id,
    'invoice_number', v_gen_number,
    'total_amount',   v_total,
    'tax_amount',     v_tax_total,
    'currency',       p_currency,
    'exchange_rate',  p_exchange_rate,
    'status',         v_status
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.commit_purchase_invoice(uuid, uuid, uuid, jsonb, numeric, text, date, text, uuid, text, text, uuid, date, numeric) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_purchase_invoice(uuid, uuid, uuid, jsonb, numeric, text, date, text, uuid, text, text, uuid, date, numeric) TO authenticated, service_role;

-- commit_purchase_return (single 10-arg signature with defaults)
CREATE OR REPLACE FUNCTION public.commit_purchase_return(
  p_company_id uuid,
  p_user_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_notes text,
  p_currency text,
  p_exchange_rate numeric,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_return_reason text DEFAULT NULL::text,
  p_reference_invoice_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid                  uuid := COALESCE(auth.uid(), p_user_id);
  v_invoice_id           uuid;
  v_invoice_number       text;
  v_journal_id           uuid;
  v_base_currency        text;
  v_subtotal             numeric := 0;
  v_total                numeric := 0;
  v_base_subtotal        numeric := 0;
  v_base_total           numeric := 0;
  v_payable_account_id   uuid;
  v_inventory_account_id uuid;
  v_primary_wh_id        uuid;
  v_item_wh_id           uuid;
  v_item                 jsonb;
  v_product              RECORD;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_years
    WHERE company_id = p_company_id
      AND CURRENT_DATE BETWEEN start_date AND end_date
      AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'التاريخ يقع خارج سنة مالية مفتوحة';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'لا توجد أصناف في مرتجع المشتريات';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency
    FROM public.companies c
   WHERE c.id = p_company_id
   LIMIT 1;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  SELECT id INTO v_payable_account_id FROM public.accounts
    WHERE company_id = p_company_id AND code = '2100' AND deleted_at IS NULL LIMIT 1;
  IF v_payable_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب ذمم الموردين (2100) غير موجود';
  END IF;

  SELECT id INTO v_inventory_account_id FROM public.accounts
    WHERE company_id = p_company_id AND code = '1200' AND deleted_at IS NULL LIMIT 1;
  IF v_inventory_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب المخزون (1200) غير موجود';
  END IF;

  -- Branch-scoped primary warehouse resolution
  SELECT id INTO v_primary_wh_id FROM public.warehouses
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND is_primary = true
      AND deleted_at IS NULL
    LIMIT 1;
  IF v_primary_wh_id IS NULL THEN
    SELECT id INTO v_primary_wh_id FROM public.warehouses
      WHERE company_id = p_company_id
        AND (p_branch_id IS NULL OR branch_id = p_branch_id)
        AND deleted_at IS NULL
      LIMIT 1;
  END IF;
  IF v_primary_wh_id IS NULL THEN
    SELECT id INTO v_primary_wh_id FROM public.warehouses
      WHERE company_id = p_company_id AND deleted_at IS NULL
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1;
  END IF;
  IF v_primary_wh_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد مستودع للفرع';
  END IF;

  SELECT COALESCE(prefix, 'PRET-') || LPAD((COALESCE(current_number, 0) + 1)::text, 5, '0')
    INTO v_invoice_number
  FROM public.numbering_sequences
  WHERE company_id = p_company_id AND document_type = 'purchase_return';

  IF v_invoice_number IS NULL THEN
    v_invoice_number := 'PRET-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM()*1000)::text, 3, '0');
  ELSE
    UPDATE public.numbering_sequences
      SET current_number = current_number + 1, updated_at = NOW()
      WHERE company_id = p_company_id AND document_type = 'purchase_return';
  END IF;

  INSERT INTO public.invoices(
    company_id, branch_id, type, invoice_number, party_id,
    issue_date, notes, status, currency_code, exchange_rate,
    subtotal, tax_amount, total_amount, created_by, return_reason,
    reference_invoice_id
  ) VALUES (
    p_company_id, p_branch_id, 'purchase_return', v_invoice_number, p_supplier_id,
    CURRENT_DATE, p_notes, 'draft', p_currency, p_exchange_rate,
    0, 0, 0, v_uid, p_return_reason,
    p_reference_invoice_id
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM public.products
      WHERE id = (v_item->>'product_id')::uuid
        AND company_id = p_company_id AND deleted_at IS NULL;
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'المنتج غير موجود: %', v_item->>'product_id';
    END IF;

    DECLARE
      v_qty            numeric := (v_item->>'quantity')::numeric;
      v_unit_cost      numeric := COALESCE((v_item->>'unit_cost')::numeric, (v_item->>'unit_price')::numeric, v_product.purchase_price);
      v_base_unit_cost numeric;
      v_discount       numeric := COALESCE((v_item->>'discount_amount')::numeric, 0);
      v_line_sub       numeric := (v_qty * v_unit_cost) - v_discount;
    BEGIN
      IF v_qty <= 0 THEN RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر'; END IF;

      IF p_reference_invoice_id IS NOT NULL THEN
        DECLARE
          v_orig_qty numeric := 0;
          v_prev_returned numeric := 0;
        BEGIN
          SELECT COALESCE(SUM(ii.quantity), 0) INTO v_orig_qty
          FROM public.invoice_items ii
          WHERE ii.invoice_id = p_reference_invoice_id AND ii.product_id = v_product.id;

          IF v_orig_qty > 0 THEN
            SELECT COALESCE(SUM(ret_ii.quantity), 0) INTO v_prev_returned
            FROM public.invoices ret_inv
            JOIN public.invoice_items ret_ii ON ret_ii.invoice_id = ret_inv.id
            WHERE ret_inv.reference_invoice_id = p_reference_invoice_id
              AND ret_inv.type IN ('purchase_return', 'return_purchase')
              AND ret_inv.status NOT IN ('void', 'cancelled')
              AND ret_inv.deleted_at IS NULL
              AND ret_ii.product_id = v_product.id;

            IF (v_qty + v_prev_returned) > v_orig_qty THEN
              RAISE EXCEPTION 'كمية الإرجاع المطلوبة (%) تتجاوز الكمية المتبقية القابلة للإرجاع (%) للمنتج "%"',
                v_qty, GREATEST(0, v_orig_qty - v_prev_returned), v_product.name_ar;
            END IF;
          END IF;
        END;
      END IF;

      v_item_wh_id := NULL;
      IF COALESCE(v_item->>'warehouse_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT w.id INTO v_item_wh_id
        FROM public.warehouses w
        WHERE w.id = (v_item->>'warehouse_id')::uuid
          AND w.company_id = p_company_id
          AND w.deleted_at IS NULL;
      END IF;
      v_item_wh_id := COALESCE(v_item_wh_id, v_primary_wh_id);

      v_base_unit_cost := public.fn_to_base_amount(p_currency, v_unit_cost, p_exchange_rate, v_base_currency);

      INSERT INTO public.invoice_items(
        invoice_id, product_id, description, quantity,
        unit_price, cost_price, discount_amount, tax_amount, total, company_id
      ) VALUES (
        v_invoice_id, v_product.id, v_product.name_ar, v_qty,
        v_unit_cost, v_base_unit_cost, v_discount, 0, v_line_sub, p_company_id
      );

      INSERT INTO public.inventory_transactions(
        company_id, product_id, warehouse_id, quantity,
        transaction_type, reference_type, reference_id, created_by,
        unit_cost, total_cost
      ) VALUES (
        p_company_id, v_product.id, v_item_wh_id, v_qty,
        'purchase_return', 'invoice', v_invoice_id, v_uid,
        v_base_unit_cost, ROUND(v_qty * v_base_unit_cost, 4)
      );

      v_subtotal := v_subtotal + v_line_sub;
    END;
  END LOOP;

  v_total := v_subtotal;
  UPDATE public.invoices SET subtotal = v_subtotal, tax_amount = 0, total_amount = v_total WHERE id = v_invoice_id;

  v_base_subtotal := public.fn_to_base_amount(p_currency, v_subtotal, p_exchange_rate, v_base_currency);
  v_base_total    := public.fn_to_base_amount(p_currency, v_total, p_exchange_rate, v_base_currency);

  INSERT INTO public.journal_entries(
    company_id, branch_id, entry_date, description, reference_type, reference_id, status, created_by
  ) VALUES (
    p_company_id, p_branch_id, CURRENT_DATE, 'مرتجع مشتريات ' || v_invoice_number,
    'purchase_return', v_invoice_id, 'draft', v_uid
  ) RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_entry_lines(
    journal_entry_id, account_id, party_id, debit_amount, credit_amount,
    description, currency_code, exchange_rate, foreign_amount, company_id, branch_id
  ) VALUES
    (v_journal_id, v_payable_account_id, p_supplier_id, v_base_total, 0,
     'تخفيض ذمم المورد - ' || v_invoice_number, p_currency, p_exchange_rate, v_total, p_company_id, p_branch_id),
    (v_journal_id, v_inventory_account_id, NULL, 0, v_base_subtotal,
     'خصم مخزون مرتجع - ' || v_invoice_number, p_currency, p_exchange_rate, v_subtotal, p_company_id, p_branch_id);

  UPDATE public.journal_entries SET status = 'posted' WHERE id = v_journal_id;
  UPDATE public.invoices SET status = 'posted' WHERE id = v_invoice_id;

  RETURN jsonb_build_object(
    'id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'total_base', v_base_total,
    'currency', p_currency,
    'status', 'posted'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.commit_purchase_return(uuid, uuid, uuid, jsonb, text, text, numeric, uuid, text, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_purchase_return(uuid, uuid, uuid, jsonb, text, text, numeric, uuid, text, uuid) TO authenticated, service_role;

-- commit_sale_return — branch warehouse resolution & fn_to_base_amount
CREATE OR REPLACE FUNCTION public.commit_sale_return(
  p_company_id uuid,
  p_user_id uuid,
  p_party_id uuid,
  p_items jsonb,
  p_exchange_rate numeric DEFAULT 1.0,
  p_currency text DEFAULT 'SAR'::text,
  p_reference_invoice_id uuid DEFAULT NULL::uuid,
  p_return_reason text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_branch_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid                  uuid := auth.uid();
  v_invoice_id           uuid;
  v_invoice_number       text;
  v_subtotal             numeric(14,4) := 0;
  v_total                numeric(14,4) := 0;
  v_cost_total           numeric(14,4) := 0;
  v_item                 jsonb;
  v_product              record;
  v_primary_wh_id        uuid;
  v_journal_id           uuid;
  v_qty                  numeric;
  v_unit_price           numeric;
  v_line_total           numeric;
  v_line_cost            numeric;
  v_original_cost        numeric;
  v_unit_cost_for_txn    numeric;
BEGIN
  PERFORM public.verify_company_access(p_company_id);
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_uid AND ucr.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_years
    WHERE company_id = p_company_id
      AND current_date BETWEEN start_date AND end_date
      AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'التاريخ يقع خارج سنة مالية مفتوحة';
  END IF;

  SELECT id INTO v_primary_wh_id FROM public.warehouses
  WHERE company_id = p_company_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND is_primary = true
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_primary_wh_id IS NULL THEN
    SELECT id INTO v_primary_wh_id FROM public.warehouses
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF v_primary_wh_id IS NULL THEN
    SELECT id INTO v_primary_wh_id FROM public.warehouses
    WHERE company_id = p_company_id AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE company_id = p_company_id AND code = '1100') THEN
    RAISE EXCEPTION 'حساب المدينون (1100) مفقود';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE company_id = p_company_id AND code = '4100') THEN
    RAISE EXCEPTION 'حساب الإيرادات (4100) مفقود';
  END IF;

  v_invoice_number := public.get_next_invoice_number(p_company_id, 'RSL');

  INSERT INTO public.invoices(
    company_id, party_id, invoice_number, type, status,
    notes, created_by, currency_code, exchange_rate,
    reference_invoice_id, return_reason,
    subtotal, tax_amount, total_amount, paid_amount, payment_method,
    branch_id
  ) VALUES (
    p_company_id, p_party_id, v_invoice_number, 'sale_return', 'draft',
    p_notes, v_uid, p_currency, p_exchange_rate,
    p_reference_invoice_id, p_return_reason,
    0, 0, 0, 0, 'credit',
    p_branch_id
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND company_id = p_company_id AND deleted_at IS NULL;
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'المنتج غير موجود: %', v_item->>'product_id';
    END IF;

    v_qty        := COALESCE((v_item->>'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_item->>'unit_price')::numeric, v_product.sale_price);
    v_line_total := ROUND(v_qty * v_unit_price, 4);

    v_original_cost := NULL;
    IF p_reference_invoice_id IS NOT NULL THEN
      SELECT ii.cost_price INTO v_original_cost FROM public.invoice_items ii
      WHERE ii.invoice_id = p_reference_invoice_id AND ii.product_id = v_product.id LIMIT 1;
    END IF;
    v_line_cost := ROUND(v_qty * COALESCE(v_original_cost, v_product.cost_price, 0), 4);
    v_unit_cost_for_txn := COALESCE(v_original_cost, v_product.cost_price, 0);

    INSERT INTO public.invoice_items(
      invoice_id, product_id, description, quantity,
      unit_price, cost_price, tax_amount, total, company_id
    ) VALUES (
      v_invoice_id, v_product.id, v_product.name_ar, v_qty,
      v_unit_price, COALESCE(v_original_cost, v_product.cost_price, 0),
      0, v_line_total, p_company_id
    );

    INSERT INTO public.inventory_transactions(
      company_id, product_id, warehouse_id, quantity,
      transaction_type, reference_type, reference_id, created_by,
      unit_cost, total_cost
    ) VALUES (
      p_company_id, v_product.id, v_primary_wh_id, v_qty,
      'sales_return', 'invoice', v_invoice_id, v_uid,
      v_unit_cost_for_txn, ROUND(v_qty * v_unit_cost_for_txn, 4)
    );

    v_subtotal   := v_subtotal   + v_line_total;
    v_cost_total := v_cost_total + v_line_cost;
  END LOOP;

  v_total := v_subtotal;

  UPDATE public.invoices SET subtotal = v_subtotal, tax_amount = 0, total_amount = v_total WHERE id = v_invoice_id;
  UPDATE public.invoices SET status = 'posted' WHERE id = v_invoice_id;

  SELECT je.id INTO v_journal_id
  FROM public.journal_entries je
  WHERE je.reference_id = v_invoice_id
    AND je.reference_type = 'sales_return'
    AND je.deleted_at IS NULL
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    RAISE EXCEPTION 'فشل الترحيل المحاسبي التلقائي لمرتجع المبيعات % - لم يُنشأ أي قيد', v_invoice_number;
  END IF;

  RETURN jsonb_build_object(
    'id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'total_base', public.fn_to_base_amount(p_currency, v_total, p_exchange_rate),
    'currency', p_currency,
    'status', 'posted'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.commit_sale_return(uuid, uuid, uuid, jsonb, numeric, text, uuid, text, text, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_sale_return(uuid, uuid, uuid, jsonb, numeric, text, uuid, text, text, uuid) TO authenticated, service_role;

-- ============================================================================
-- 6) fn_update_weighted_avg_cost — Clamp Negative Old Stock Before WAC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_update_weighted_avg_cost()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_qty numeric;
  v_effective_old_qty numeric;
  v_old_avg numeric;
  v_new_avg numeric;
BEGIN
  IF new.transaction_type = 'purchase' AND new.quantity > 0 THEN
    SELECT quantity, weighted_avg_cost INTO v_old_qty, v_old_avg
    FROM public.product_stock
    WHERE product_id = new.product_id AND warehouse_id = new.warehouse_id
    FOR UPDATE;

    -- Clamp negative stock to 0 when computing Weighted Average Cost so negative
    -- historical stock never distorts or inverts the new unit cost.
    v_effective_old_qty := GREATEST(COALESCE(v_old_qty, 0), 0);
    v_old_avg := GREATEST(COALESCE(v_old_avg, 0), 0);

    IF (v_effective_old_qty + new.quantity) <= 0 THEN
      v_new_avg := new.unit_cost;
    ELSE
      v_new_avg := ROUND(
        (v_effective_old_qty * v_old_avg + new.quantity * new.unit_cost)
        / (v_effective_old_qty + new.quantity), 4);
    END IF;

    UPDATE public.product_stock
    SET weighted_avg_cost = v_new_avg
    WHERE product_id = new.product_id AND warehouse_id = new.warehouse_id;

    UPDATE public.products
    SET cost_price = v_new_avg,
        purchase_price = new.unit_cost
    WHERE id = new.product_id;
  END IF;

  RETURN new;
END;
$function$;

-- ============================================================================
-- 7) Analytical & Reporting RPCs — Currency Unification, COGS Isolation, No Clamping
-- ============================================================================

-- 7.1) get_bonds_stats: Use fn_to_base_amount instead of raw amount * exchange_rate
CREATE OR REPLACE FUNCTION public.get_bonds_stats(p_company_id uuid, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base_currency text;
  v_total_amount numeric := 0;
  v_total_count int := 0;
  v_receipt_count int := 0;
  v_receipt_amount numeric := 0;
  v_payment_count int := 0;
  v_payment_amount numeric := 0;
  v_chart_data json;
  v_account_data json;
BEGIN
  PERFORM public.verify_company_access(p_company_id);
  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency
    FROM public.companies c
   WHERE c.id = p_company_id
   LIMIT 1;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  SELECT
    COALESCE(SUM(public.fn_to_base_amount(currency_code, amount, exchange_rate, v_base_currency)), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE type = 'receipt'),
    COALESCE(SUM(public.fn_to_base_amount(currency_code, amount, exchange_rate, v_base_currency)) FILTER (WHERE type = 'receipt'), 0),
    COUNT(*) FILTER (WHERE type = 'disbursement'),
    COALESCE(SUM(public.fn_to_base_amount(currency_code, amount, exchange_rate, v_base_currency)) FILTER (WHERE type = 'disbursement'), 0)
  INTO v_total_amount, v_total_count, v_receipt_count, v_receipt_amount, v_payment_count, v_payment_amount
  FROM public.payments
  WHERE company_id = p_company_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND status NOT IN ('void', 'cancelled')
    AND deleted_at IS NULL;

  WITH dates AS (
    SELECT date_trunc('day', NOW() - (n || ' days')::interval)::date AS d
    FROM generate_series(0, 29) n
  ),
  daily AS (
    SELECT
      d.d AS date,
      COALESCE(SUM(public.fn_to_base_amount(b.currency_code, b.amount, b.exchange_rate, v_base_currency)), 0) AS amount,
      COUNT(b.id) AS count
    FROM dates d
    LEFT JOIN public.payments b
      ON d.d = b.payment_date
     AND b.company_id = p_company_id
     AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
     AND b.status NOT IN ('void', 'cancelled')
     AND b.deleted_at IS NULL
    GROUP BY d.d
  )
  SELECT json_agg(json_build_object('date', date, 'amount', amount, 'count', count) ORDER BY date)
  INTO v_chart_data FROM daily;

  WITH acc AS (
    SELECT
      COALESCE(a.name_ar, 'غير محدد') AS name,
      COALESCE(SUM(public.fn_to_base_amount(py.currency_code, py.amount, py.exchange_rate, v_base_currency)), 0) AS amount,
      COUNT(*) AS count
    FROM public.payments py
    LEFT JOIN public.accounts a ON py.account_id = a.id
    WHERE py.company_id = p_company_id
      AND (p_branch_id IS NULL OR py.branch_id = p_branch_id)
      AND py.status NOT IN ('void', 'cancelled')
      AND py.deleted_at IS NULL
    GROUP BY a.name_ar
    ORDER BY amount DESC
    LIMIT 5
  )
  SELECT COALESCE(json_agg(json_build_object('name', name, 'amount', amount, 'count', count)), '[]'::json)
  INTO v_account_data FROM acc;

  RETURN json_build_object(
    'totalAmount', v_total_amount,
    'count', v_total_count,
    'chartData', COALESCE(v_chart_data, '[]'::json),
    'accountData', v_account_data,
    'totals', json_build_object(
      'receiptCount', v_receipt_count,
      'receiptAmount', v_receipt_amount,
      'paymentCount', v_payment_count,
      'paymentAmount', v_payment_amount,
      'netAmount', v_receipt_amount - v_payment_amount
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_bonds_stats(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_bonds_stats(uuid, uuid) TO authenticated, service_role;

-- 7.2) get_expense_categories_summary: Use fn_to_base_amount instead of e.amount * e.exchange_rate
CREATE OR REPLACE FUNCTION public.get_expense_categories_summary(
  p_company_id uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_branch_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(category_name text, total_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base_currency text;
BEGIN
  PERFORM public.verify_company_access(p_company_id);

  SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency
    FROM public.companies c
   WHERE c.id = p_company_id
   LIMIT 1;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  RETURN QUERY
  SELECT
    COALESCE(ec.name, 'غير مصنف') AS category_name,
    COALESCE(SUM(public.fn_to_base_amount(e.currency_code, e.amount, e.exchange_rate, v_base_currency)), 0)::NUMERIC AS total_amount
  FROM public.expenses e
  LEFT JOIN public.expense_categories ec ON ec.id = e.category_id
  WHERE e.company_id = p_company_id
    AND e.status NOT IN ('void', 'cancelled')
    AND e.deleted_at IS NULL
    AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
    AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
    AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
  GROUP BY ec.name
  ORDER BY total_amount DESC
  LIMIT 10;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_expense_categories_summary(uuid, date, date, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_expense_categories_summary(uuid, date, date, uuid) TO authenticated, service_role;

-- 7.3) get_monthly_performance: Exclude COGS (5100/51%), filter deleted_at, and remove GREATEST(0, ...) clamping
CREATE OR REPLACE FUNCTION public.get_monthly_performance(
  p_company_id uuid,
  p_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer,
  p_branch_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(month_index integer, month_name text, revenues numeric, expenses numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start DATE := make_date(p_year, 1, 1);
  v_end   DATE := make_date(p_year, 12, 31);
BEGIN
  PERFORM public.verify_company_access(p_company_id);

  RETURN QUERY
  WITH month_series AS (
    SELECT
      m AS month_idx,
      to_char(make_date(p_year, m + 1, 1), 'TMMonth') AS month_nm
    FROM generate_series(0, 11) AS m
  ),
  journal_agg AS (
    SELECT
      EXTRACT(MONTH FROM je.entry_date)::INT - 1 AS month_idx,
      a.type                                      AS account_type,
      SUM(
        CASE a.type
          WHEN 'revenue' THEN (jel.credit_amount - jel.debit_amount)
          WHEN 'expense' THEN (jel.debit_amount - jel.credit_amount)
          ELSE 0
        END
      ) AS net_amount
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.accounts a ON a.id = jel.account_id
    WHERE je.company_id = p_company_id
      AND je.entry_date BETWEEN v_start AND v_end
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
      AND jel.deleted_at IS NULL
      AND a.deleted_at IS NULL
      AND a.type IN ('revenue', 'expense')
      AND a.code <> '5100'
      AND a.code NOT LIKE '51%'
      AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id)
    GROUP BY EXTRACT(MONTH FROM je.entry_date), a.type
  )
  SELECT
    ms.month_idx,
    TRIM(ms.month_nm),
    COALESCE(SUM(CASE ja.account_type WHEN 'revenue' THEN ja.net_amount ELSE 0 END), 0)::NUMERIC AS revenues,
    COALESCE(SUM(CASE ja.account_type WHEN 'expense' THEN ja.net_amount ELSE 0 END), 0)::NUMERIC AS expenses
  FROM month_series ms
  LEFT JOIN journal_agg ja ON ja.month_idx = ms.month_idx
  GROUP BY ms.month_idx, ms.month_nm
  ORDER BY ms.month_idx;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_monthly_performance(uuid, integer, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_performance(uuid, integer, uuid) TO authenticated, service_role;

-- 7.4) get_sales_chart_data: Remove GREATEST(..., 0) clamping on purchases and expenses
CREATE OR REPLACE FUNCTION public.get_sales_chart_data(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
 RETURNS TABLE(name text, date date, value numeric, sales numeric, purchases numeric, expenses numeric, profit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  vc uuid;
  v_base_currency text;
  v_from date := COALESCE(p_date_from, (CURRENT_DATE - INTERVAL '30 days')::date);
  v_to date := COALESCE(p_date_to, CURRENT_DATE);
BEGIN
  vc := public.verify_company_access(p_company_id);

  SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency
    FROM public.companies c
   WHERE c.id = vc
   LIMIT 1;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  RETURN QUERY
  WITH days AS (
    SELECT d::date AS dt
    FROM generate_series(v_from, v_to, '1 day'::interval) d
  ),
  inv_daily AS (
    SELECT
      i.issue_date,
      COALESCE(SUM(CASE
        WHEN i.type = 'sale' THEN
          public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency)
        WHEN i.type IN ('sale_return', 'return_sale') THEN
          -1 * public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency)
        ELSE 0
      END), 0) AS daily_sales,
      COALESCE(SUM(CASE
        WHEN i.type = 'purchase' THEN
          public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency)
        WHEN i.type IN ('purchase_return', 'return_purchase') THEN
          -1 * public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency)
        ELSE 0
      END), 0) AS daily_purchases
    FROM public.invoices i
    WHERE i.company_id = vc
      AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
      AND i.issue_date BETWEEN v_from AND v_to
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
      AND i.deleted_at IS NULL
    GROUP BY i.issue_date
  ),
  exp_daily AS (
    SELECT
      e.expense_date,
      COALESCE(SUM(
        public.fn_to_base_amount(e.currency_code, e.amount, e.exchange_rate, v_base_currency)
      ), 0) AS daily_expenses
    FROM public.expenses e
    WHERE e.company_id = vc
      AND e.status IN ('posted', 'paid')
      AND e.expense_date BETWEEN v_from AND v_to
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
      AND e.deleted_at IS NULL
    GROUP BY e.expense_date
  )
  SELECT
    to_char(d.dt, 'YYYY-MM-DD') AS name,
    d.dt AS date,
    ROUND(COALESCE(inv.daily_sales, 0), 2) AS value,
    ROUND(COALESCE(inv.daily_sales, 0), 2) AS sales,
    ROUND(COALESCE(inv.daily_purchases, 0), 2) AS purchases,
    ROUND(COALESCE(exp.daily_expenses, 0), 2) AS expenses,
    ROUND(COALESCE(inv.daily_sales, 0) - COALESCE(inv.daily_purchases, 0) - COALESCE(exp.daily_expenses, 0), 2) AS profit
  FROM days d
  LEFT JOIN inv_daily inv ON inv.issue_date = d.dt
  LEFT JOIN exp_daily exp ON exp.expense_date = d.dt
  ORDER BY d.dt ASC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_sales_chart_data(uuid, uuid, date, date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sales_chart_data(uuid, uuid, date, date) TO authenticated, service_role;

COMMIT;

