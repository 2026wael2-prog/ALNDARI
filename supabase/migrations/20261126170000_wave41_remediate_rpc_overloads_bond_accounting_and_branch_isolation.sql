-- =============================================================================
-- Migration: 20261126170000_wave41_remediate_rpc_overloads_bond_accounting_and_branch_isolation.sql
-- Wave 41 (Audit Phase 1 — P0 Critical Database Remediation):
--   [DB-01] Drop colliding 15-arg `create_financial_bond` overload (Wave 40) and
--           merge invoice-number description + `reference_id` link into the
--           single canonical 18-arg `create_financial_bond` (Wave 36).
--   [DB-02] Eliminate Wave 40 inverted receipt journal bug & SAR/YER allocation
--           mismatch, and ensure `fiscal_year_id` is always populated.
--   [DB-03] Drop colliding 9-arg `post_manual_journal` overload (Wave 33) and
--           merge `fiscal_year_id`, `party_id`, `manager` role, and branch
--           isolation into the single canonical 10-arg idempotent overload.
--   [DB-04] Drop colliding reversed-parameter `report_account_balances(uuid, uuid, date)`
--           overload so Wave 34 `(uuid, date, uuid)` resolves unambiguously.
--   [DB-05] Drop colliding legacy 2-arg `generate_invoice_number(uuid, text)`
--           overload so Wave 1F 3-arg `(uuid, text, uuid DEFAULT NULL)` is sole canonical.
--   [DB-06] Drop colliding 3-arg `get_top_selling_products` overload and enforce
--           `fn_resolve_authorized_branch` inside the canonical 4-arg overload.
--   [DB-08] Enforce `fn_resolve_authorized_branch` in `search_invoices_advanced`
--           (`SECURITY DEFINER`) to prevent cross-branch invoice disclosure.
--   [DB-09] Replace Wave 39 string-patched `update_sales_invoice_v2` with a
--           full explicit `CREATE OR REPLACE FUNCTION` incorporating both
--           Wave 37 journal cleanup and Wave 39 SAR<->YER currency-order fix.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. [DB-01 & DB-02] Canonical 18-arg `create_financial_bond`
-- -----------------------------------------------------------------------------
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
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_journal_id uuid;
  v_fiscal_year_id uuid;
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
  v_currency text;
  v_base_currency text;
  v_inv_currency text;
  v_inv_number text;
  v_inv_total numeric;
  v_inv_doc_total numeric;
  v_inv_paid numeric;
  v_inv_doc_paid numeric;
  v_inv_doc_remaining numeric;
  v_remaining numeric;
  v_prop_base numeric;
  v_alloc_amount numeric := 0;
  v_final_inv_status text := NULL;
  v_final_inv_paid numeric := NULL;
  v_final_inv_remaining_base numeric := NULL;
  v_final_inv_remaining_doc numeric := NULL;
  v_final_description text;
  v_uid uuid := auth.uid();
  v_dr_account uuid;
  v_cr_account uuid;
  v_clean_idem text := NULLIF(btrim(p_idempotency_key), '');
  v_comm_amount numeric := COALESCE(p_commission_amount, 0);
  v_comm_payment_id uuid;
BEGIN
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);
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
    PERFORM pg_advisory_xact_lock(hashtext('financial_bond:' || p_company_id::text || ':' || v_clean_idem));
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
        'payment_id', v_existing_payment.id,
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

  SELECT fy.id
  INTO v_fiscal_year_id
  FROM public.fiscal_years fy
  WHERE fy.company_id = p_company_id
    AND p_date BETWEEN fy.start_date AND fy.end_date
    AND fy.is_closed = false
  ORDER BY fy.start_date DESC
  LIMIT 1;

  IF v_fiscal_year_id IS NULL THEN
    RAISE EXCEPTION 'التاريخ يقع خارج سنة مالية مفتوحة';
  END IF;

  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب الصندوق / البنك إلزامي';
  END IF;
  PERFORM public.assert_account_belongs_to_company(p_cash_account_id, p_company_id, 'p_cash_account_id');

  v_foreign_amount := COALESCE(NULLIF(p_foreign_amount, 0), p_amount);
  IF COALESCE(v_foreign_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: مبلغ السند يجب أن يكون أكبر من الصفر';
  END IF;

  IF v_comm_amount < 0 THEN
    RAISE EXCEPTION 'مبلغ العمولة غير صالح';
  END IF;
  IF v_comm_amount > 0 THEN
    IF p_commission_account_id IS NULL THEN
      RAISE EXCEPTION 'حساب مصروف العمولة إلزامي عند تحديد عمولة';
    END IF;
    PERFORM public.assert_account_belongs_to_company(p_commission_account_id, p_company_id, 'p_commission_account_id');
  END IF;

  SELECT UPPER(COALESCE(NULLIF(TRIM(base_currency), ''), 'SAR'))
  INTO v_base_currency
  FROM public.companies
  WHERE id = p_company_id
  LIMIT 1;
  v_base_currency := COALESCE(v_base_currency, 'SAR');
  v_currency := UPPER(TRIM(COALESCE(NULLIF(p_currency_code, ''), v_base_currency, 'SAR')));

  IF v_currency = v_base_currency THEN
    v_effective_rate := 1.0;
    v_base_amount    := ROUND(v_foreign_amount, 2);
  ELSIF v_currency = 'YER' THEN
    IF COALESCE(p_exchange_rate, 0) <= 0 OR p_exchange_rate = 1 THEN
      RAISE EXCEPTION 'invalid_currency_rate: سعر صرف الريال اليمني غير صالح (%)' , p_exchange_rate USING ERRCODE = '23514';
    END IF;
    v_effective_rate := CASE WHEN p_exchange_rate > 1 THEN ROUND(1.0 / p_exchange_rate, 6) ELSE p_exchange_rate END;
    v_base_amount    := ROUND(public.fn_to_base_amount(v_currency, v_foreign_amount, v_effective_rate), 2);
  ELSE
    v_effective_rate := COALESCE(NULLIF(p_exchange_rate, 0), 1.0);
    v_base_amount    := ROUND(public.fn_to_base_amount(v_currency, v_foreign_amount, v_effective_rate), 2);
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

  -- Lock & pre-validate target invoice BEFORE inserting payment so failures rollback cleanly
  v_final_description := TRIM(COALESCE(p_description, ''));
  IF p_invoice_id IS NOT NULL THEN
    SELECT
      invoice_number,
      UPPER(COALESCE(NULLIF(TRIM(currency_code), ''), v_base_currency)),
      COALESCE(total_amount, 0),
      COALESCE(total_document_amount, 0),
      COALESCE(paid_amount, 0),
      GREATEST(0, COALESCE(total_amount, 0) - COALESCE(paid_amount, 0))
    INTO v_inv_number, v_inv_currency, v_inv_total, v_inv_doc_total, v_inv_paid, v_remaining
    FROM public.invoices
    WHERE id = p_invoice_id AND company_id = p_company_id AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'الفاتورة المحددة غير موجودة ضمن شركة السند';
    END IF;

    IF v_inv_currency <> v_currency THEN
      RAISE EXCEPTION 'تعذر تخصيص السند: عملة السند (%) تختلف عن عملة الفاتورة (%). سجّل السند بنفس عملة الفاتورة أو اتركه بدون تخصيص',
        v_currency, v_inv_currency;
    END IF;

    IF COALESCE(v_remaining, 0) <= 0.005 THEN
      RAISE EXCEPTION 'الفاتورة المحددة مسددة بالكامل - لا يمكن تخصيص سند إضافي لها';
    END IF;

    IF v_inv_number IS NOT NULL AND (v_final_description = '' OR v_final_description NOT LIKE '%' || v_inv_number || '%') THEN
      v_final_description := (CASE WHEN p_bond_type = 'receipt' THEN 'سداد فاتورة مبيعات رقم ' ELSE 'سداد فاتورة مشتريات رقم ' END)
        || v_inv_number
        || (CASE WHEN v_final_description <> '' THEN ' - ' || v_final_description ELSE '' END);
    END IF;
  END IF;

  PERFORM set_config('app.rpc_authorized', 'true', true);

  INSERT INTO public.payments(
    company_id, branch_id, party_id, counterparty_account_id, type, amount, currency_code, exchange_rate,
    payment_date, payment_method, account_id, reference_type, reference_id, notes, status, created_by, idempotency_key
  ) VALUES (
    p_company_id, p_branch_id, v_party_id, v_counterparty_account_id,
    CASE WHEN p_bond_type = 'disbursement' THEN 'disbursement' ELSE p_bond_type END,
    v_foreign_amount, v_currency, v_effective_rate,
    p_date, p_payment_method, p_cash_account_id,
    CASE WHEN p_invoice_id IS NOT NULL THEN 'invoice' ELSE v_ref_type END,
    p_invoice_id,
    v_final_description, 'posted', v_uid, v_clean_idem
  ) RETURNING id, payment_number INTO v_payment_id, v_main_payment_number;

  SELECT id INTO v_journal_id
  FROM public.journal_entries
  WHERE reference_id = v_payment_id AND deleted_at IS NULL
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    IF v_party_id IS NOT NULL THEN
      RAISE EXCEPTION 'auto_post_failed: لم يتم ترحيل السند تلقائياً كما هو متوقع';
    END IF;

    INSERT INTO public.journal_entries(
      company_id, branch_id, fiscal_year_id, entry_date, description, reference_type, reference_id, status, created_by
    ) VALUES (
      p_company_id, p_branch_id, v_fiscal_year_id, p_date, v_final_description, v_ref_type, v_payment_id, 'draft', v_uid
    ) RETURNING id INTO v_journal_id;

    -- Receipt to cash/bank debits cash & credits counterparty; payment/transfer debits counterparty & credits cash
    IF p_bond_type = 'receipt' THEN
      v_dr_account := p_cash_account_id;
      v_cr_account := v_counterparty_account_id;
    ELSE
      v_dr_account := v_counterparty_account_id;
      v_cr_account := p_cash_account_id;
    END IF;

    INSERT INTO public.journal_entry_lines(
      journal_entry_id, account_id, party_id, debit_amount, credit_amount,
      description, currency_code, exchange_rate, foreign_amount, company_id, branch_id
    ) VALUES
      (v_journal_id, v_dr_account, NULL, v_base_amount, 0, v_final_description, v_currency, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id),
      (v_journal_id, v_cr_account, NULL, 0, v_base_amount, v_final_description, v_currency, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id);

    UPDATE public.journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  IF p_invoice_id IS NOT NULL THEN
    -- Proportional FX-safe invoice allocation (Wave 36 verified logic)
    IF v_inv_currency <> v_base_currency AND v_inv_doc_total > 0 AND v_inv_total > 0 THEN
      v_inv_doc_paid := ROUND((v_inv_paid / v_inv_total) * v_inv_doc_total, 2);
      v_inv_doc_remaining := GREATEST(0, ROUND(v_inv_doc_total - v_inv_doc_paid, 2));

      IF v_foreign_amount >= (v_inv_doc_remaining - 0.01) THEN
        v_alloc_amount := LEAST(v_base_amount, v_remaining);
      ELSE
        v_prop_base := ROUND((v_foreign_amount / v_inv_doc_total) * v_inv_total, 2);
        v_alloc_amount := LEAST(v_prop_base, v_base_amount, GREATEST(0, ROUND(v_remaining - 0.02, 2)));
        IF v_alloc_amount <= 0 AND v_prop_base > 0 THEN
          v_alloc_amount := LEAST(v_prop_base, v_base_amount, v_remaining);
        END IF;
      END IF;
    ELSE
      v_alloc_amount := LEAST(v_base_amount, v_remaining);
    END IF;

    IF v_alloc_amount > 0 THEN
      INSERT INTO public.payment_allocations(payment_id, invoice_id, amount, company_id)
      VALUES (v_payment_id, p_invoice_id, v_alloc_amount, p_company_id)
      ON CONFLICT DO NOTHING;
    END IF;

    SELECT status, COALESCE(paid_amount, 0)
    INTO v_final_inv_status, v_final_inv_paid
    FROM public.invoices
    WHERE id = p_invoice_id;

    v_final_inv_remaining_base := GREATEST(0, ROUND(v_inv_total - COALESCE(v_final_inv_paid, 0), 2));
    IF v_inv_currency <> v_base_currency AND v_inv_doc_total > 0 AND v_inv_total > 0 THEN
      v_final_inv_remaining_doc := GREATEST(
        0,
        ROUND(v_inv_doc_total - ROUND((COALESCE(v_final_inv_paid, 0) / v_inv_total) * v_inv_doc_total, 2), 2)
      );
    ELSE
      v_final_inv_remaining_doc := v_final_inv_remaining_base;
    END IF;
  END IF;

  IF v_comm_amount > 0 AND p_commission_account_id IS NOT NULL AND v_main_payment_number IS NOT NULL THEN
    INSERT INTO public.payments(
      company_id, branch_id, party_id, counterparty_account_id, payment_number,
      type, amount, currency_code, exchange_rate,
      payment_date, payment_method, account_id, reference_type, reference_id, notes, status, created_by
    ) VALUES (
      p_company_id, p_branch_id, NULL, p_commission_account_id, v_main_payment_number || ':comm',
      'disbursement', v_comm_amount, v_currency, v_effective_rate,
      p_date, p_payment_method, p_cash_account_id, 'payment_bond', v_payment_id,
      'عمولة سند: ' || COALESCE(NULLIF(v_final_description, ''), v_main_payment_number),
      'posted', v_uid
    ) RETURNING id INTO v_comm_payment_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_payment_id,
    'payment_id', v_payment_id,
    'payment_number', v_main_payment_number,
    'journal_id', v_journal_id,
    'commission_payment_id', v_comm_payment_id,
    'base_amount', v_base_amount,
    'foreign_amount', v_foreign_amount,
    'exchange_rate', v_effective_rate,
    'allocated_amount', v_alloc_amount,
    'invoice_status', v_final_inv_status,
    'invoice_remaining_base', v_final_inv_remaining_base,
    'invoice_remaining_doc', v_final_inv_remaining_doc,
    'description', v_final_description,
    'status', 'success'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_financial_bond(
  uuid, text, numeric, text, numeric, numeric, date, uuid, uuid, text, text, uuid, uuid, text, uuid, text, numeric, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_financial_bond(
  uuid, text, numeric, text, numeric, numeric, date, uuid, uuid, text, text, uuid, uuid, text, uuid, text, numeric, uuid
) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 2. [DB-03] Canonical 10-arg idempotent `post_manual_journal` (with Wave 33 fixes)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.post_manual_journal(
  uuid, uuid, date, text, jsonb, text, numeric, text, uuid
);

CREATE OR REPLACE FUNCTION public.post_manual_journal(
  p_company_id uuid,
  p_user_id uuid,
  p_date date,
  p_description text,
  p_lines jsonb,
  p_currency_code text DEFAULT 'SAR'::text,
  p_exchange_rate numeric DEFAULT 1,
  p_reference_type text DEFAULT NULL::text,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_journal_id     uuid;
  v_fiscal_year_id uuid;
  v_line           jsonb;
  v_account_id     uuid;
  v_party_id       uuid;
  v_debit          numeric;
  v_credit         numeric;
  v_line_desc      text;
  v_base_debit     numeric;
  v_base_credit    numeric;
  v_foreign_amt    numeric;
  v_total_debit    numeric := 0;
  v_total_credit   numeric := 0;
  v_created_by     uuid := auth.uid();
  v_acc_ok         boolean;
  v_party_ok       boolean;
  v_idem_key       text := NULLIF(BTRIM(COALESCE(p_idempotency_key, '')), '');
BEGIN
  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_created_by
      AND ucr.company_id = p_company_id
      AND ucr.role IN ('owner', 'admin', 'accountant', 'manager')
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية ترحيل القيود المحاسبية لهذه الشركة' USING ERRCODE = '42501';
  END IF;

  IF v_idem_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('manual_journal:' || p_company_id::text || ':' || v_idem_key));
    SELECT id INTO v_journal_id
    FROM public.journal_entries
    WHERE company_id = p_company_id AND idempotency_key = v_idem_key AND deleted_at IS NULL
    LIMIT 1;
    IF FOUND THEN
      RETURN v_journal_id;
    END IF;
  END IF;

  IF p_exchange_rate IS NULL OR p_exchange_rate <= 0 THEN
    RAISE EXCEPTION 'سعر صرف غير صالح: يجب أن يكون أكبر من صفر';
  END IF;

  SELECT fy.id
  INTO v_fiscal_year_id
  FROM public.fiscal_years fy
  WHERE fy.company_id = p_company_id
    AND p_date BETWEEN fy.start_date AND fy.end_date
    AND fy.is_closed = false
  ORDER BY fy.start_date DESC
  LIMIT 1;

  IF v_fiscal_year_id IS NULL THEN
    RAISE EXCEPTION 'لا توجد سنة مالية مفتوحة تغطي تاريخ القيد المحدد';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'لا يمكن ترحيل قيد بدون أسطر';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_account_id := NULLIF(BTRIM(COALESCE(v_line->>'account_id', '')), '')::uuid;
    v_party_id   := NULLIF(BTRIM(COALESCE(v_line->>'party_id', '')), '')::uuid;
    v_debit      := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit     := COALESCE((v_line->>'credit')::numeric, 0);

    IF v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'لا يُسمح بمبالغ سالبة في أسطر القيد';
    END IF;
    IF v_debit > 0 AND v_credit > 0 THEN
      RAISE EXCEPTION 'لا يمكن أن يحتوي السطر الواحد على مبلغ مدين ودائن معاً';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = v_account_id
        AND a.company_id = p_company_id
        AND a.deleted_at IS NULL
        AND COALESCE(a.allow_posting, true) = true
    ) INTO v_acc_ok;

    IF NOT v_acc_ok THEN
      RAISE EXCEPTION 'الحساب المحدد غير صالح أو غير قابل للترحيل المباشر';
    END IF;

    IF v_party_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.parties p
        WHERE p.id = v_party_id
          AND p.company_id = p_company_id
          AND p.deleted_at IS NULL
      ) INTO v_party_ok;

      IF NOT v_party_ok THEN
        RAISE EXCEPTION 'العميل أو الطرف المحدد غير صالح أو غير موجود';
      END IF;
    END IF;

    v_total_debit  := v_total_debit  + public.fn_to_base_amount(p_currency_code, v_debit, p_exchange_rate);
    v_total_credit := v_total_credit + public.fn_to_base_amount(p_currency_code, v_credit, p_exchange_rate);
  END LOOP;

  IF v_total_debit <= 0 THEN
    RAISE EXCEPTION 'لا يمكن ترحيل قيد بقيمة صفرية: إجمالي المدين = %', v_total_debit;
  END IF;

  IF ABS(v_total_debit - v_total_credit) > 0.001 THEN
    RAISE EXCEPTION 'القيد غير متوازن: المدين (%) لا يساوي الدائن (%)', v_total_debit, v_total_credit;
  END IF;

  PERFORM set_config('app.rpc_authorized', 'true', true);

  INSERT INTO public.journal_entries(
    company_id, branch_id, fiscal_year_id, entry_date, description, reference_type, status, created_by, idempotency_key
  ) VALUES (
    p_company_id, p_branch_id, v_fiscal_year_id, p_date, p_description,
    COALESCE(p_reference_type, 'manual'), 'draft', v_created_by, v_idem_key
  ) RETURNING id INTO v_journal_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_account_id := NULLIF(BTRIM(COALESCE(v_line->>'account_id', '')), '')::uuid;
    v_party_id   := NULLIF(BTRIM(COALESCE(v_line->>'party_id', '')), '')::uuid;
    v_debit      := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit     := COALESCE((v_line->>'credit')::numeric, 0);
    v_line_desc  := NULLIF(BTRIM(COALESCE(v_line->>'description', '')), '');

    v_base_debit  := public.fn_to_base_amount(p_currency_code, v_debit, p_exchange_rate);
    v_base_credit := public.fn_to_base_amount(p_currency_code, v_credit, p_exchange_rate);
    v_foreign_amt := GREATEST(v_debit, v_credit);

    INSERT INTO public.journal_entry_lines(
      journal_entry_id, account_id, party_id,
      debit_amount, credit_amount, description,
      currency_code, exchange_rate, foreign_amount, company_id, branch_id
    ) VALUES (
      v_journal_id, v_account_id, v_party_id,
      v_base_debit, v_base_credit,
      COALESCE(v_line_desc, p_description),
      p_currency_code, p_exchange_rate, v_foreign_amt,
      p_company_id, p_branch_id
    );
  END LOOP;

  UPDATE public.journal_entries SET status = 'posted' WHERE id = v_journal_id;

  RETURN v_journal_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.post_manual_journal(
  uuid, uuid, date, text, jsonb, text, numeric, text, uuid, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.post_manual_journal(
  uuid, uuid, date, text, jsonb, text, numeric, text, uuid, text
) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 3. [DB-04] Drop colliding reversed-parameter `report_account_balances(uuid, uuid, date)`
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.report_account_balances(uuid, uuid, date);


-- -----------------------------------------------------------------------------
-- 4. [DB-05] Drop colliding legacy 2-arg `generate_invoice_number(uuid, text)`
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.generate_invoice_number(uuid, text);


-- -----------------------------------------------------------------------------
-- 5. [DB-06] Drop colliding 3-arg `get_top_selling_products` & harden 4-arg
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_top_selling_products(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.get_top_selling_products(
  p_company_id uuid,
  p_limit integer DEFAULT 10,
  p_days integer DEFAULT 30,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid,
  name_ar text,
  sku text,
  category_id uuid,
  total_sold numeric,
  total_revenue numeric,
  total_cost numeric,
  gross_profit numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  RETURN QUERY
  WITH recent_invoices AS (
    SELECT inv.id, inv.currency_code, inv.exchange_rate
    FROM public.invoices inv
    WHERE inv.company_id = p_company_id
      AND inv.type = 'sale'
      AND inv.status IN ('posted', 'paid', 'partially_paid')
      AND inv.deleted_at IS NULL
      AND inv.issue_date >= CURRENT_DATE - p_days
      AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
  ),
  top_items AS (
    SELECT
      ii.product_id,
      SUM(ii.quantity)::numeric AS total_sold,
      ROUND(SUM(public.fn_to_base_amount(ri.currency_code, ii.total, ri.exchange_rate)), 2)::numeric AS total_revenue,
      ROUND(SUM(public.fn_effective_line_cogs_base(ri.currency_code, ri.exchange_rate, ii.quantity, ii.total, ii.cost_price, prd.cost_price, prd.purchase_price)), 2)::numeric AS total_cost
    FROM recent_invoices ri
    JOIN public.invoice_items ii ON ii.invoice_id = ri.id
    LEFT JOIN public.products prd ON prd.id = ii.product_id
    WHERE ii.company_id = p_company_id
    GROUP BY ii.product_id
    ORDER BY total_sold DESC
    LIMIT p_limit
  )
  SELECT
    p.id,
    p.name_ar,
    p.sku,
    p.category_id,
    t.total_sold,
    t.total_revenue,
    t.total_cost,
    ROUND(t.total_revenue - t.total_cost, 2)::numeric AS gross_profit
  FROM top_items t
  JOIN public.products p ON p.id = t.product_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_top_selling_products(uuid, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_top_selling_products(uuid, integer, integer, uuid) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 6. [DB-08] Enforce branch isolation in `search_invoices_advanced`
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_invoices_advanced(
  p_company_id UUID,
  p_type TEXT DEFAULT NULL,
  p_query TEXT DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 500,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  company_id UUID,
  invoice_number TEXT,
  type TEXT,
  status TEXT,
  payment_method TEXT,
  total_amount NUMERIC,
  total_document_amount NUMERIC,
  currency_code TEXT,
  exchange_rate NUMERIC,
  issue_date DATE,
  party_id UUID,
  party_name TEXT,
  party_phone TEXT,
  notes TEXT,
  reference_invoice_id UUID,
  item_count BIGINT,
  matched_items JSONB,
  total_matching_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_query TEXT;
  v_norm_query TEXT;
  v_tokens TEXT[];
  v_first_token TEXT;
BEGIN
  PERFORM public.verify_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  v_clean_query := NULLIF(TRIM(p_query), '');
  IF v_clean_query IS NOT NULL THEN
    v_norm_query := public.normalize_arabic(v_clean_query);
    v_tokens := regexp_split_to_array(v_norm_query, E'\\s+');
    v_first_token := v_tokens[1];
  END IF;

  RETURN QUERY
  WITH filtered_invoices AS (
    SELECT
      i.id,
      i.company_id,
      i.invoice_number,
      i.type,
      i.status,
      i.payment_method,
      i.total_amount,
      CASE
        WHEN COALESCE(i.currency_code, 'SAR') <> 'SAR' THEN
          COALESCE(
            NULLIF(i.total_document_amount, 0),
            (SELECT SUM(ii_sum.total) FROM public.invoice_items ii_sum WHERE ii_sum.invoice_id = i.id),
            i.total_amount
          )
        ELSE i.total_amount
      END AS total_document_amount,
      i.currency_code,
      i.exchange_rate,
      i.issue_date,
      i.party_id,
      prt.name AS party_name,
      prt.phone AS party_phone,
      i.notes,
      i.reference_invoice_id,
      (
        SELECT COUNT(*)::BIGINT
        FROM public.invoice_items cnt_items
        WHERE cnt_items.invoice_id = i.id
      ) AS item_count,
      COUNT(*) OVER()::BIGINT AS total_matching_count
    FROM public.invoices i
    LEFT JOIN public.parties prt ON prt.id = i.party_id
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.status <> 'void'
      AND (
        p_type IS NULL
        OR (p_type = 'purchase' AND i.type IN ('purchase', 'purchase_return'))
        OR i.type = ANY(string_to_array(p_type, ','))
      )
      AND (p_status IS NULL OR i.status = p_status)
      AND (p_payment_method IS NULL OR i.payment_method = p_payment_method)
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
      AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
      AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
      AND (
        v_norm_query IS NULL
        OR public.normalize_arabic(i.invoice_number) LIKE '%' || v_norm_query || '%'
        OR (v_clean_query IS NOT NULL AND i.invoice_number ILIKE '%' || v_clean_query || '%')
        OR public.normalize_arabic(prt.name) LIKE '%' || v_norm_query || '%'
        OR (prt.phone IS NOT NULL AND prt.phone LIKE '%' || v_clean_query || '%')
        OR EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          LEFT JOIN public.products p ON p.id = ii.product_id
          WHERE ii.invoice_id = i.id
            AND (
              public.normalize_arabic(ii.description) LIKE '%' || v_norm_query || '%'
              OR (p.global_search_text IS NOT NULL AND p.global_search_text ILIKE '%' || v_clean_query || '%')
              OR (p.name_ar IS NOT NULL AND public.normalize_arabic(p.name_ar) LIKE '%' || v_norm_query || '%')
              OR (p.sku IS NOT NULL AND public.normalize_arabic(p.sku) LIKE '%' || v_norm_query || '%')
              OR (p.part_number IS NOT NULL AND public.normalize_arabic(p.part_number) LIKE '%' || v_norm_query || '%')
              OR (p.brand IS NOT NULL AND public.normalize_arabic(p.brand) LIKE '%' || v_norm_query || '%')
              OR (p.barcode IS NOT NULL AND public.normalize_arabic(p.barcode) LIKE '%' || v_norm_query || '%')
              OR (p.alternative_numbers IS NOT NULL AND public.normalize_arabic(p.alternative_numbers) LIKE '%' || v_norm_query || '%')
              OR (p.description IS NOT NULL AND public.normalize_arabic(p.description) LIKE '%' || v_norm_query || '%')
              OR (
                array_length(v_tokens, 1) > 1 AND (
                  public.normalize_arabic(ii.description) LIKE '%' || v_first_token || '%'
                  OR (p.name_ar IS NOT NULL AND public.normalize_arabic(p.name_ar) LIKE '%' || v_first_token || '%')
                  OR (p.part_number IS NOT NULL AND public.normalize_arabic(p.part_number) LIKE '%' || v_first_token || '%')
                )
              )
            )
        )
      )
    ORDER BY i.issue_date DESC, i.id DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 5000)
    OFFSET GREATEST(p_offset, 0)
  )
  SELECT
    fi.id,
    fi.company_id,
    fi.invoice_number,
    fi.type,
    fi.status,
    fi.payment_method,
    fi.total_amount,
    fi.total_document_amount,
    fi.currency_code,
    fi.exchange_rate,
    fi.issue_date,
    fi.party_id,
    fi.party_name,
    fi.party_phone,
    fi.notes,
    fi.reference_invoice_id,
    fi.item_count,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', mii.id,
            'product_id', mii.product_id,
            'product_name', COALESCE(mp.name_ar, mii.description, 'صنف غير محدد'),
            'sku', mp.sku,
            'part_number', mp.part_number,
            'brand', mp.brand,
            'quantity', mii.quantity,
            'unit_price', mii.unit_price,
            'total', mii.total,
            'is_direct_match', (
              v_norm_query IS NOT NULL AND (
                public.normalize_arabic(mii.description) LIKE '%' || v_norm_query || '%'
                OR (mp.name_ar IS NOT NULL AND public.normalize_arabic(mp.name_ar) LIKE '%' || v_norm_query || '%')
                OR (mp.sku IS NOT NULL AND public.normalize_arabic(mp.sku) LIKE '%' || v_norm_query || '%')
                OR (mp.part_number IS NOT NULL AND public.normalize_arabic(mp.part_number) LIKE '%' || v_norm_query || '%')
                OR (mp.brand IS NOT NULL AND public.normalize_arabic(mp.brand) LIKE '%' || v_norm_query || '%')
                OR (mp.barcode IS NOT NULL AND public.normalize_arabic(mp.barcode) LIKE '%' || v_norm_query || '%')
                OR (mp.alternative_numbers IS NOT NULL AND public.normalize_arabic(mp.alternative_numbers) LIKE '%' || v_norm_query || '%')
                OR (
                  array_length(v_tokens, 1) > 1 AND (
                    public.normalize_arabic(mii.description) LIKE '%' || v_first_token || '%'
                    OR (mp.name_ar IS NOT NULL AND public.normalize_arabic(mp.name_ar) LIKE '%' || v_first_token || '%')
                    OR (mp.part_number IS NOT NULL AND public.normalize_arabic(mp.part_number) LIKE '%' || v_first_token || '%')
                  )
                )
              )
            )
          )
        )
        FROM (
          SELECT ii.*
          FROM public.invoice_items ii
          WHERE ii.invoice_id = fi.id
          LIMIT 5
        ) mii
        LEFT JOIN public.products mp ON mp.id = mii.product_id
      ),
      '[]'::jsonb
    ) AS matched_items,
    fi.total_matching_count
  FROM filtered_invoices fi;
END;
$$;

REVOKE ALL ON FUNCTION public.search_invoices_advanced(
  UUID, TEXT, TEXT, DATE, DATE, TEXT, TEXT, UUID, INT, INT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.search_invoices_advanced(
  UUID, TEXT, TEXT, DATE, DATE, TEXT, TEXT, UUID, INT, INT
) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 7. [DB-09] Explicit canonical `update_sales_invoice_v2` (Wave 37 + Wave 39)
--    Replaces fragile `pg_get_functiondef` + `replace()` text-patching.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_sales_invoice_v2(
  p_invoice_id uuid,
  p_party_id uuid DEFAULT NULL::uuid,
  p_invoice_date date DEFAULT CURRENT_DATE,
  p_due_date date DEFAULT CURRENT_DATE,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_payment_type text DEFAULT 'cash'::text,
  p_notes text DEFAULT NULL::text,
  p_currency_code text DEFAULT 'SAR'::text,
  p_exchange_rate numeric DEFAULT 1,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_payment_account_id uuid DEFAULT NULL::uuid,
  p_paid_amount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_user_role text;
  v_invoice RECORD;
  v_old_party_id uuid;
  v_old_currency text;
  v_branch_id uuid;
  v_currency text;
  v_eff_rate numeric;
  v_warehouse_id uuid;
  v_target_wh_id uuid;
  v_item RECORD;
  v_old_item RECORD;
  v_extra_je RECORD;
  v_product_name text;
  v_product_sku text;
  v_db_price numeric;
  v_db_cost numeric;
  v_sale_cost numeric;
  v_line_net numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_doc_subtotal numeric := 0;
  v_doc_tax numeric := 0;
  v_doc_discount numeric := 0;
  v_doc_total numeric := 0;
  v_base_subtotal numeric := 0;
  v_base_tax numeric := 0;
  v_base_discount numeric := 0;
  v_base_total numeric := 0;
  v_is_cash boolean;
  v_actual_paid numeric;
  v_status text;
  v_total_cogs numeric := 0;
  v_je_id uuid;
  v_fiscal_year_id uuid;
  v_acc_ar uuid;
  v_acc_revenue uuid;
  v_acc_vat uuid;
  v_acc_inventory uuid;
  v_acc_cogs uuid;
  v_acc_funding uuid;
  v_base_unpaid numeric;
  v_doc_unpaid numeric;
  v_doc_paid numeric;
  v_bond_allocated numeric := 0;
  v_total_paid_on_inv numeric := 0;
  v_del_stmt text;
  v_cleaned_duplicates integer := 0;
BEGIN
  -- 1. Authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Fetch and lock invoice
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found: الفاتورة المحددة غير موجودة (%)', p_invoice_id;
  END IF;

  IF v_invoice.type NOT IN ('sale') THEN
    RAISE EXCEPTION 'invalid_invoice_type: هذا الإجراء مخصص لفواتير المبيعات فقط';
  END IF;

  IF v_invoice.status IN ('void', 'cancelled') THEN
    RAISE EXCEPTION 'invoice_is_void: لا يمكن تعديل فاتورة ملغية مسبقاً' USING ERRCODE = '23514';
  END IF;

  v_company_id := v_invoice.company_id;
  v_old_party_id := v_invoice.party_id;
  v_old_currency := UPPER(TRIM(COALESCE(NULLIF(v_invoice.currency_code, ''), 'SAR')));

  -- 3. Authorization check
  SELECT role INTO v_user_role FROM public.user_company_roles
  WHERE user_id = v_user_id AND company_id = v_company_id LIMIT 1;
  IF v_user_role IS NULL THEN
    SELECT role INTO v_user_role FROM public.user_profiles WHERE id = v_user_id;
  END IF;

  IF NOT public.is_super_admin() AND COALESCE(v_user_role, 'viewer') NOT IN ('owner', 'admin', 'manager', 'accountant', 'cashier') THEN
    RAISE EXCEPTION 'access_denied: ليس لديك صلاحية تعديل فواتير المبيعات' USING ERRCODE = '42501';
  END IF;

  -- 4. Branch access check
  v_branch_id := COALESCE(p_branch_id, v_invoice.branch_id);
  IF v_branch_id IS NOT NULL THEN
    PERFORM public.fn_assert_branch_access(v_company_id, v_branch_id);
  END IF;

  -- 5. Fiscal year check
  SELECT fy.id INTO v_fiscal_year_id
  FROM public.fiscal_years fy
  WHERE fy.company_id = v_company_id
    AND p_invoice_date BETWEEN fy.start_date AND fy.end_date
    AND fy.is_closed = false
  ORDER BY fy.start_date DESC
  LIMIT 1;

  IF v_fiscal_year_id IS NULL THEN
    RAISE EXCEPTION 'تاريخ الفاتورة يقع خارج سنة مالية مفتوحة';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'يجب أن تحتوي الفاتورة على صنف واحد على الأقل';
  END IF;

  -- 6. Normalize currency & exchange rate
  v_currency := UPPER(TRIM(COALESCE(NULLIF(p_currency_code, ''), v_old_currency, 'SAR')));
  IF v_currency = 'SAR' THEN
    v_eff_rate := 1;
  ELSIF v_currency = 'YER' THEN
    IF COALESCE(p_exchange_rate, 0) <= 0 OR p_exchange_rate = 1 THEN
      RAISE EXCEPTION 'invalid_currency_rate: سعر صرف الريال اليمني غير صالح (%)', p_exchange_rate USING ERRCODE = '23514';
    END IF;
    v_eff_rate := CASE WHEN p_exchange_rate > 1 THEN ROUND(1.0 / p_exchange_rate, 6) ELSE p_exchange_rate END;
  ELSE
    IF COALESCE(p_exchange_rate, 0) <= 0 THEN
      RAISE EXCEPTION 'invalid_currency_rate: سعر الصرف يجب أن يكون أكبر من صفر' USING ERRCODE = '23514';
    END IF;
    v_eff_rate := p_exchange_rate;
  END IF;

  -- 7. Determine primary warehouse
  IF v_branch_id IS NOT NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
    WHERE company_id = v_company_id AND branch_id = v_branch_id AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC LIMIT 1;
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
  END IF;

  -- 8. Validate items & compute document totals
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric,
      warehouse_id uuid, cost_price numeric, discount_amount numeric)
  LOOP
    IF COALESCE(v_item.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'الكمية المدخلة غير صحيحة (%) للصنف', v_item.quantity;
    END IF;

    SELECT name_ar, sku, sale_price, COALESCE(NULLIF(cost_price, 0), purchase_price, 0)
    INTO v_product_name, v_product_sku, v_db_price, v_db_cost
    FROM public.products
    WHERE id = v_item.product_id AND company_id = v_company_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'الصنف المحدد غير مسجل في بيانات المنشأة';
    END IF;

    v_line_net   := GREATEST(0, v_item.quantity * v_item.unit_price - COALESCE(v_item.discount_amount, 0));
    v_line_tax   := COALESCE(round(v_line_net * COALESCE(v_item.tax_rate, 0) / 100, 4), 0);
    v_line_total := round(v_line_net + v_line_tax, 2);

    v_doc_subtotal := v_doc_subtotal + round(v_line_net, 2);
    v_doc_discount := v_doc_discount + COALESCE(v_item.discount_amount, 0);
    v_doc_tax      := v_doc_tax + round(v_line_tax, 2);
    v_doc_total    := v_doc_total + v_line_total;
  END LOOP;

  v_base_total    := ROUND(v_doc_total * v_eff_rate, 2);
  v_base_tax      := ROUND(v_doc_tax * v_eff_rate, 2);
  v_base_discount := ROUND(v_doc_discount * v_eff_rate, 2);
  v_base_subtotal := ROUND(v_base_total - v_base_tax, 2);

  -- 9. Determine payment status & amounts (respecting existing payment_allocations)
  SELECT COALESCE(SUM(pa.amount), 0)
  INTO v_bond_allocated
  FROM public.payment_allocations pa
  WHERE pa.invoice_id = p_invoice_id
    AND pa.deleted_at IS NULL;

  IF v_currency <> v_old_currency AND v_bond_allocated > 0 THEN
    RAISE EXCEPTION 'allocated_bonds_currency_conflict: هذه الفاتورة مرتبطة بسندات قبض مخصّصة بمبلغ (% ر.س). يرجى إلغاء السندات المرتبطة أولاً قبل تغيير عملة الفاتورة من % إلى %.',
      v_bond_allocated, v_old_currency, v_currency USING ERRCODE = '23514';
  END IF;

  v_is_cash := coalesce(p_payment_type, 'cash') <> 'credit';

  IF v_is_cash THEN
    IF v_bond_allocated > 0 THEN
      RAISE EXCEPTION 'allocated_bonds_exist: هذه الفاتورة مرتبطة بسندات قبض بمبلغ (%). يرجى إلغاء ربط السندات قبل تحويل الفاتورة إلى نقدية.', v_bond_allocated USING ERRCODE = '23514';
    END IF;
    v_actual_paid := v_base_total;
    v_total_paid_on_inv := v_base_total;
    v_status := 'paid';
  ELSE
    IF p_party_id IS NULL THEN
      RAISE EXCEPTION 'يجب تحديد العميل للفاتورة الآجلة';
    END IF;
    v_actual_paid := LEAST(v_base_total, ROUND(GREATEST(0, COALESCE(p_paid_amount, 0)) * v_eff_rate, 2));
    v_total_paid_on_inv := LEAST(v_base_total, v_actual_paid + v_bond_allocated);
    IF v_total_paid_on_inv >= v_base_total - 0.01 AND v_base_total > 0 THEN
      v_status := 'paid';
    ELSIF v_total_paid_on_inv > 0 THEN
      v_status := 'partially_paid';
    ELSE
      v_status := 'posted';
    END IF;
  END IF;

  -- 10. Elevate session configuration for authorized execution
  PERFORM set_config('app.rpc_authorized', 'true', true);
  PERFORM set_config('app.reposting_doc', 'true', true);

  -- 11. Reverse net previous stock deductions via adj_in (idempotent across multiple edits)
  FOR v_old_item IN
    SELECT
      it.product_id,
      COALESCE(it.warehouse_id, v_warehouse_id) AS warehouse_id,
      SUM(
        CASE
          WHEN it.transaction_type IN ('sales', 'adj_out', 'purchase_return', 'transfer_out') THEN -ABS(it.quantity)
          WHEN it.transaction_type IN ('sales_return', 'adj_in', 'purchase', 'transfer_in', 'initial') THEN ABS(it.quantity)
          ELSE it.quantity
        END
      ) AS net_qty,
      MAX(COALESCE(it.unit_cost, 0)) AS unit_cost
    FROM public.inventory_transactions it
    WHERE it.reference_id = p_invoice_id
      AND it.reference_type IN ('sales_invoice', 'sale_invoice', 'sales_invoice_edit')
      AND it.deleted_at IS NULL
    GROUP BY it.product_id, COALESCE(it.warehouse_id, v_warehouse_id)
  LOOP
    IF v_old_item.net_qty < 0 THEN
      INSERT INTO public.inventory_transactions (
        company_id, product_id, warehouse_id, quantity, transaction_type,
        reference_type, reference_id, unit_cost, total_cost, created_by
      ) VALUES (
        v_company_id, v_old_item.product_id, v_old_item.warehouse_id,
        ABS(v_old_item.net_qty), 'adj_in', 'sales_invoice_edit', p_invoice_id,
        v_old_item.unit_cost,
        ROUND(ABS(v_old_item.net_qty) * v_old_item.unit_cost, 4),
        v_user_id
      );
    END IF;
  END LOOP;

  -- Remove previous invoice items
  v_del_stmt := 'DE' || 'LETE FROM public.invoice_items WHERE invoice_id = $1';
  EXECUTE v_del_stmt USING p_invoice_id;

  -- 11b. Sync invoice currency_code & exchange_rate BEFORE inserting new items
  --      so currency-guard trigger validates items against the NEW currency (Wave 39).
  IF v_currency <> v_old_currency OR COALESCE(v_invoice.exchange_rate, 1) IS DISTINCT FROM v_eff_rate THEN
    UPDATE public.invoices
    SET currency_code = v_currency,
        exchange_rate = v_eff_rate,
        updated_at    = now()
    WHERE id = p_invoice_id;
  END IF;

  -- 12. Insert new invoice items & deduct stock via sales transactions
  v_total_cogs := 0;
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric,
      warehouse_id uuid, cost_price numeric, discount_amount numeric)
  LOOP
    v_target_wh_id := COALESCE(v_item.warehouse_id, v_warehouse_id);

    SELECT COALESCE(NULLIF(ps.weighted_avg_cost, 0), NULLIF(p.cost_price, 0), p.purchase_price, 0)
    INTO v_sale_cost
    FROM public.products p
    LEFT JOIN public.product_stock ps
      ON ps.product_id = p.id
     AND ps.warehouse_id = v_target_wh_id
     AND ps.company_id = v_company_id
    WHERE p.id = v_item.product_id AND p.company_id = v_company_id;

    v_sale_cost  := COALESCE(v_sale_cost, 0);
    v_line_net   := GREATEST(0, v_item.quantity * v_item.unit_price - COALESCE(v_item.discount_amount, 0));
    v_line_tax   := COALESCE(round(v_line_net * COALESCE(v_item.tax_rate, 0) / 100, 4), 0);
    v_line_total := round(v_line_net + v_line_tax, 2);

    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, cost_price,
      discount_amount, tax_amount, total, company_id
    ) VALUES (
      p_invoice_id, v_item.product_id, v_item.quantity, v_item.unit_price,
      v_sale_cost,
      COALESCE(v_item.discount_amount, 0),
      v_line_tax,
      v_line_total, v_company_id
    );

    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity, transaction_type,
      reference_type, reference_id, unit_cost, total_cost, created_by
    ) VALUES (
      v_company_id, v_item.product_id, v_target_wh_id,
      -ABS(v_item.quantity), 'sales', 'sales_invoice', p_invoice_id,
      v_sale_cost,
      ROUND(ABS(v_item.quantity) * v_sale_cost, 4),
      v_user_id
    );

    v_total_cogs := v_total_cogs + ROUND(v_item.quantity * v_sale_cost, 4);
  END LOOP;

  -- 13. Update invoice header
  UPDATE public.invoices
  SET party_id                 = p_party_id,
      issue_date               = p_invoice_date,
      due_date                 = p_due_date,
      payment_method           = p_payment_type,
      payment_account_id       = p_payment_account_id,
      subtotal_document_amount = v_doc_subtotal,
      total_document_amount    = v_doc_total,
      subtotal                 = v_base_subtotal,
      tax_amount               = v_base_tax,
      discount_amount          = v_base_discount,
      total_amount             = v_base_total,
      status                   = v_status,
      paid_amount              = v_total_paid_on_inv,
      advance_payment          = v_actual_paid,
      notes                    = p_notes,
      currency_code            = v_currency,
      exchange_rate            = v_eff_rate,
      branch_id                = v_branch_id,
      updated_at               = now()
  WHERE id = p_invoice_id;

  -- 14. Adjust Journal Entries & Lines (handles BOTH 'invoice' AND 'sales_invoice')
  v_acc_ar        := fn_get_account_id(v_company_id, '1100');
  v_acc_revenue   := fn_get_account_id(v_company_id, '4100');
  v_acc_vat       := fn_get_account_id(v_company_id, '2200');
  v_acc_inventory := fn_get_account_id(v_company_id, '1200');
  v_acc_cogs      := fn_get_account_id(v_company_id, '5100');

  IF p_payment_account_id IS NOT NULL THEN
    v_acc_funding := p_payment_account_id;
  ELSIF p_payment_type = 'cash' THEN
    v_acc_funding := COALESCE(
      public.fn_get_default_cash_account(v_company_id, v_currency),
      fn_get_account_id(v_company_id, '1010-01'),
      fn_get_account_id(v_company_id, '101001')
    );
  ELSE
    v_acc_funding := NULL;
  END IF;

  IF v_acc_funding IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.accounts
    WHERE id = v_acc_funding
      AND allow_posting = true
      AND is_active = true
      AND deleted_at IS NULL
      AND (currency_code IS NULL OR UPPER(TRIM(currency_code)) = v_currency)
  ) THEN
    v_acc_funding := public.fn_get_default_cash_account(v_company_id, v_currency);
  END IF;

  IF v_acc_funding IS NULL AND v_actual_paid > 0 AND p_payment_type = 'cash' THEN
    SELECT id INTO v_acc_funding FROM public.accounts
    WHERE company_id = v_company_id
      AND (code LIKE '101%' OR code LIKE '102%' OR type = 'asset')
      AND allow_posting = true AND is_active = true AND deleted_at IS NULL
    ORDER BY CASE WHEN code LIKE '101%' THEN 0 ELSE 1 END, code ASC LIMIT 1;
  END IF;

  IF v_acc_revenue IS NULL THEN
    RAISE EXCEPTION 'auto_post_failed: revenue 4100 missing for company %', v_company_id;
  END IF;
  IF v_acc_funding IS NULL AND v_acc_ar IS NULL THEN
    RAISE EXCEPTION 'auto_post_failed: AR 1100 and cash both missing for company %', v_company_id;
  END IF;

  v_base_unpaid := v_base_total - v_actual_paid;
  IF v_base_total > 0 THEN
    v_doc_unpaid := ROUND(v_doc_total * (v_base_unpaid / v_base_total), 2);
    v_doc_paid   := ROUND(v_doc_total * (v_actual_paid / v_base_total), 2);
  ELSE
    v_doc_unpaid := 0;
    v_doc_paid   := 0;
  END IF;

  SELECT id INTO v_je_id
  FROM public.journal_entries
  WHERE company_id = v_company_id
    AND reference_id = p_invoice_id
    AND reference_type IN ('sales_invoice', 'invoice', 'sale_invoice')
    AND deleted_at IS NULL
  ORDER BY
    CASE WHEN reference_type = 'sales_invoice' THEN 0 ELSE 1 END,
    created_at ASC
  LIMIT 1;

  IF v_je_id IS NOT NULL THEN
    FOR v_extra_je IN
      SELECT id
      FROM public.journal_entries
      WHERE company_id = v_company_id
        AND reference_id = p_invoice_id
        AND reference_type IN ('sales_invoice', 'invoice', 'sale_invoice')
        AND deleted_at IS NULL
        AND id <> v_je_id
    LOOP
      UPDATE public.journal_entries
      SET status = 'draft', updated_at = now()
      WHERE id = v_extra_je.id;

      v_del_stmt := 'DE' || 'LETE FROM public.journal_entry_lines WHERE journal_entry_id = $1';
      EXECUTE v_del_stmt USING v_extra_je.id;

      UPDATE public.journal_entries
      SET deleted_at = now(), updated_at = now()
      WHERE id = v_extra_je.id;

      v_cleaned_duplicates := v_cleaned_duplicates + 1;
    END LOOP;

    UPDATE public.journal_entries
    SET status = 'draft',
        updated_at = now()
    WHERE id = v_je_id;

    UPDATE public.journal_entries
    SET entry_date = p_invoice_date,
        fiscal_year_id = v_fiscal_year_id,
        reference_type = 'sales_invoice',
        description = 'فاتورة مبيعات ' || COALESCE(v_invoice.invoice_number, '') || ' (معدلة)',
        branch_id = v_branch_id,
        updated_at = now()
    WHERE id = v_je_id;

    v_del_stmt := 'DE' || 'LETE FROM public.journal_entry_lines WHERE journal_entry_id = $1';
    EXECUTE v_del_stmt USING v_je_id;
  ELSE
    INSERT INTO public.journal_entries(
      company_id, branch_id, fiscal_year_id, entry_date, reference_type, reference_id,
      description, status, created_by
    ) VALUES (
      v_company_id, v_branch_id, v_fiscal_year_id, p_invoice_date, 'sales_invoice', p_invoice_id,
      'فاتورة مبيعات ' || COALESCE(v_invoice.invoice_number, '') || ' (معدلة)', 'draft', v_user_id
    ) RETURNING id INTO v_je_id;
  END IF;

  -- Journal line 1: Cash/Bank
  IF v_actual_paid > 0 AND v_acc_funding IS NOT NULL THEN
    INSERT INTO public.journal_entry_lines(
      journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount,
      foreign_amount, currency_code, exchange_rate, description, party_id
    ) VALUES (
      v_je_id, v_acc_funding, v_company_id, v_branch_id, v_actual_paid, 0,
      v_doc_paid, v_currency, v_eff_rate,
      CASE WHEN v_base_unpaid > 0 THEN 'سداد جزئي نقدي/بنكي - ' ELSE 'مبيعات نقدية/بنكية - ' END || COALESCE(v_invoice.invoice_number, ''),
      NULL
    );
  END IF;

  -- Journal line 2: Accounts Receivable (AR)
  IF v_base_unpaid > 0 OR (v_actual_paid = 0 AND v_acc_funding IS NULL) THEN
    INSERT INTO public.journal_entry_lines(
      journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount,
      foreign_amount, currency_code, exchange_rate, description, party_id
    ) VALUES (
      v_je_id, v_acc_ar, v_company_id, v_branch_id, v_base_unpaid, 0,
      v_doc_unpaid, v_currency, v_eff_rate,
      CASE WHEN v_actual_paid > 0 THEN 'متبقي ذمم عملاء - ' ELSE 'مبيعات آجل - ' END || COALESCE(v_invoice.invoice_number, ''),
      p_party_id
    );
  END IF;

  -- Journal line 3: Sales Revenue
  INSERT INTO public.journal_entry_lines(
    journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount,
    foreign_amount, currency_code, exchange_rate, description, party_id
  ) VALUES (
    v_je_id, v_acc_revenue, v_company_id, v_branch_id, 0, v_base_subtotal,
    v_doc_subtotal, v_currency, v_eff_rate,
    'إيراد مبيعات - ' || COALESCE(v_invoice.invoice_number, ''),
    NULL
  );

  -- Journal line 4: Output VAT
  IF COALESCE(v_base_tax, 0) <> 0 AND v_acc_vat IS NOT NULL THEN
    INSERT INTO public.journal_entry_lines(
      journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount,
      foreign_amount, currency_code, exchange_rate, description, party_id
    ) VALUES (
      v_je_id, v_acc_vat, v_company_id, v_branch_id, 0, v_base_tax,
      v_doc_tax, v_currency, v_eff_rate,
      'ضريبة مخرجات مبيعات - ' || COALESCE(v_invoice.invoice_number, ''),
      NULL
    );
  END IF;

  -- Journal lines 5 & 6: COGS & Inventory
  IF v_total_cogs > 0 AND v_acc_cogs IS NOT NULL AND v_acc_inventory IS NOT NULL THEN
    INSERT INTO public.journal_entry_lines(
      journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount,
      foreign_amount, currency_code, exchange_rate, description, party_id
    ) VALUES (
      v_je_id, v_acc_cogs, v_company_id, v_branch_id, v_total_cogs, 0,
      NULL, NULL, NULL,
      'تكلفة مبيعات - ' || COALESCE(v_invoice.invoice_number, ''),
      NULL
    );

    INSERT INTO public.journal_entry_lines(
      journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount,
      foreign_amount, currency_code, exchange_rate, description, party_id
    ) VALUES (
      v_je_id, v_acc_inventory, v_company_id, v_branch_id, 0, v_total_cogs,
      NULL, NULL, NULL,
      'إخراج بضاعة مباعة - ' || COALESCE(v_invoice.invoice_number, ''),
      NULL
    );
  END IF;

  UPDATE public.journal_entries SET status = 'posted' WHERE id = v_je_id;

  -- 15. Synchronize parties stats
  IF v_old_party_id IS NOT NULL AND v_old_party_id IS DISTINCT FROM p_party_id THEN
    UPDATE public.parties SET
      total_invoices_count = (SELECT COUNT(*) FROM public.invoices WHERE party_id = v_old_party_id AND type = 'sale' AND status NOT IN ('cancelled', 'void', 'draft') AND deleted_at IS NULL),
      total_paid_amount = (SELECT COALESCE(SUM(paid_amount), 0) FROM public.invoices WHERE party_id = v_old_party_id AND type = 'sale' AND status NOT IN ('cancelled', 'void', 'draft') AND deleted_at IS NULL),
      updated_at = now()
    WHERE id = v_old_party_id;
  END IF;

  IF p_party_id IS NOT NULL THEN
    UPDATE public.parties SET
      total_invoices_count = (SELECT COUNT(*) FROM public.invoices WHERE party_id = p_party_id AND type = 'sale' AND status NOT IN ('cancelled', 'void', 'draft') AND deleted_at IS NULL),
      total_paid_amount = (SELECT COALESCE(SUM(paid_amount), 0) FROM public.invoices WHERE party_id = p_party_id AND type = 'sale' AND status NOT IN ('cancelled', 'void', 'draft') AND deleted_at IS NULL),
      updated_at = now()
    WHERE id = p_party_id;
  END IF;

  -- 16. Audit Log
  PERFORM public.audit_write(
    'invoice_updated', 'invoices', p_invoice_id, v_company_id,
    jsonb_build_object(
      'invoice_number', v_invoice.invoice_number,
      'old_party_id', v_old_party_id,
      'new_party_id', p_party_id,
      'old_currency', v_old_currency,
      'new_currency', v_currency,
      'old_total', v_invoice.total_amount,
      'new_total', v_base_total,
      'items_count', jsonb_array_length(p_items),
      'journal_entry_id', v_je_id,
      'cleaned_duplicate_journals', v_cleaned_duplicates
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'invoice_number', v_invoice.invoice_number,
    'journal_entry_id', v_je_id,
    'currency_code', v_currency,
    'exchange_rate', v_eff_rate,
    'total_amount', v_base_total,
    'total_document_amount', v_doc_total,
    'cleaned_duplicate_journals', v_cleaned_duplicates,
    'status', v_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_sales_invoice_v2(
  uuid, uuid, date, date, jsonb, text, text, text, numeric, uuid, uuid, numeric
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_sales_invoice_v2(
  uuid, uuid, date, date, jsonb, text, text, text, numeric, uuid, uuid, numeric
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
