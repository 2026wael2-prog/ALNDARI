-- ============================================================
-- Bond allocation ↔ invoices.paid_amount integrity (20261104201421)
-- ============================================================
-- يتحقق على قاعدة بيانات حقيقية (بدور يتجاوز RLS):
--   A1  تخصيص سند واحد → paid_amount = مبلغ التخصيص (لا مضاعفة)
--       (العطل القديم: create_financial_bond كان يجمع المبلغ يدوياً فوق
--        trg_sync_paid_amount فيصبح 2× ويخرق 23514)
--   A2  تخصيصان متتاليان → المجموع الدقيق، والفارق 0 (لا خرق للقيد)
--   A3  تجاوز المتبقي → رفض بـ SQLSTATE 22003 ورسالة عربية، بلا تغيير paid_amount
--   A4  advance_payment (الدفعة الأولى) لا يُمحى عند التخصيص:
--       paid_amount = advance_payment + Σ allocations
--   A5  fn_audit_invoice_paid_drift: dry-run لا يكتب، وp_apply يصحّح الانحراف
--
-- HOW TO RUN:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--        -f supabase/tests/test_bond_allocation_paid_amount.sql
-- السكربت كامل داخل معاملة واحدة تُلغى في النهاية (ROLLBACK).
-- ============================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_uid       uuid;
  v_company   uuid;
  v_branch    uuid;
  v_customer  uuid;
  v_cash      uuid;
  v_inv1      uuid;
  v_inv2      uuid;
  v_paid      numeric;
  v_advance   numeric;
  v_alloc     numeric;
  v_state     text;
  v_msg       text;
  v_rejected  boolean;
  v_cnt       bigint;
BEGIN
  SELECT id INTO v_uid FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'allocation test requires at least one user in auth.users';
  END IF;

  INSERT INTO public.companies (name_ar) VALUES ('__bond_allocation_test__')
  RETURNING id INTO v_company;

  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  INSERT INTO public.branches (company_id, name, is_main)
  VALUES (v_company, '__test_branch__', true) RETURNING id INTO v_branch;

  -- owner مطلوب لتنفيذ p_apply في دالة التدقيق
  INSERT INTO user_company_roles(user_id, company_id, role, branch_id)
  VALUES (v_uid, v_company, 'owner', v_branch);

  INSERT INTO fiscal_years(company_id, name, start_date, end_date, is_closed)
  VALUES (v_company, 'FY2026', DATE '2026-01-01', DATE '2026-12-31', false);

  INSERT INTO public.parties(company_id, name, type)
  VALUES (v_company, '__test_customer__', 'customer') RETURNING id INTO v_customer;

  INSERT INTO accounts(company_id, code, name_ar, type, currency_code, allow_posting)
  VALUES (v_company, '1100', 'مدينون', 'asset', 'SAR', true);
  INSERT INTO accounts(company_id, code, name_ar, type, currency_code, allow_posting)
  VALUES (v_company, '1001', 'الصندوق', 'asset', 'SAR', true)
  RETURNING id INTO v_cash;

  -- فاتورة آجلة (draft كي لا يُطلق ترحيل القيد) بإجمالي 1000
  INSERT INTO public.invoices (
    company_id, branch_id, party_id, type, status, invoice_number,
    total_amount, subtotal, issue_date, due_date, currency_code, exchange_rate, paid_amount
  ) VALUES (
    v_company, v_branch, v_customer, 'sale', 'draft', '__ALLOC_T1__',
    1000, 1000, DATE '2026-06-01', DATE '2026-07-01', 'SAR', 1, 0
  ) RETURNING id INTO v_inv1;

  -- ═══ A1: تخصيص واحد → لا مضاعفة ═══
  PERFORM public.create_financial_bond(
    v_company, 'receipt', 400, 'SAR', 1, 400, DATE '2026-06-10',
    v_cash, v_customer, 'party', 'تحصيل جزئي', v_inv1, v_uid, 'cash', v_branch
  );

  SELECT COALESCE(paid_amount, 0), COALESCE(advance_payment, 0)
  INTO v_paid, v_advance
  FROM public.invoices WHERE id = v_inv1;

  ASSERT ABS(v_paid - 400) < 0.01,
    'A1 FAIL: paid_amount = ' || v_paid::text || ' (expected 400, not doubled)';
  ASSERT ABS(v_advance) < 0.01,
    'A1 FAIL: advance_payment changed to ' || v_advance::text || ' on a credit invoice';

  -- ═══ A2: تخصيص ثانٍ يُكمل الفاتورة بدقة (لا 23514) ═══
  PERFORM public.create_financial_bond(
    v_company, 'receipt', 600, 'SAR', 1, 600, DATE '2026-06-11',
    v_cash, v_customer, 'party', 'سداد الباقي', v_inv1, v_uid, 'cash', v_branch
  );

  SELECT COALESCE(paid_amount, 0) INTO v_paid FROM public.invoices WHERE id = v_inv1;
  ASSERT ABS(v_paid - 1000) < 0.01,
    'A2 FAIL: paid_amount = ' || v_paid::text || ' (expected 1000)';

  SELECT COALESCE(SUM(amount), 0) INTO v_alloc
  FROM public.payment_allocations WHERE invoice_id = v_inv1 AND deleted_at IS NULL;
  ASSERT ABS(v_alloc - 1000) < 0.01, 'A2 FAIL: allocations sum = ' || v_alloc::text;

  -- ═══ A3: تجاوز المتبقي مرفوض برسالة عربية ═══
  v_rejected := false;
  BEGIN
    PERFORM public.create_financial_bond(
      v_company, 'receipt', 100, 'SAR', 1, 100, DATE '2026-06-12',
      v_cash, v_customer, 'party', 'تجاوز', v_inv1, v_uid, 'cash', v_branch
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    v_rejected := true;
  END;

  ASSERT v_rejected, 'A3 FAIL: over-allocation on a fully paid invoice was accepted';
  ASSERT v_state = '22003',
    'A3 FAIL: SQLSTATE = ' || COALESCE(v_state, 'null') || ' / ' || COALESCE(v_msg, '');
  ASSERT v_msg LIKE '%يتجاوز المتبقي على الفاتورة%',
    'A3 FAIL: unexpected message: ' || COALESCE(v_msg, 'null');

  SELECT COALESCE(paid_amount, 0) INTO v_paid FROM public.invoices WHERE id = v_inv1;
  ASSERT ABS(v_paid - 1000) < 0.01,
    'A3 FAIL: rejected bond mutated paid_amount to ' || v_paid::text;

  -- ═══ A4: الدفعة الأولى (advance_payment) لا تُمحى ═══
  INSERT INTO public.invoices (
    company_id, branch_id, party_id, type, status, invoice_number,
    total_amount, subtotal, issue_date, currency_code, exchange_rate, paid_amount, advance_payment
  ) VALUES (
    v_company, v_branch, v_customer, 'sale', 'draft', '__ALLOC_T2__',
    1000, 1000, DATE '2026-06-02', 'SAR', 1, 300, 300
  ) RETURNING id INTO v_inv2;

  PERFORM public.create_financial_bond(
    v_company, 'receipt', 200, 'SAR', 1, 200, DATE '2026-06-13',
    v_cash, v_customer, 'party', 'تحصيل إضافي', v_inv2, v_uid, 'cash', v_branch
  );

  SELECT COALESCE(paid_amount, 0), COALESCE(advance_payment, 0)
  INTO v_paid, v_advance
  FROM public.invoices WHERE id = v_inv2;

  ASSERT ABS(v_paid - 500) < 0.01,
    'A4 FAIL: paid_amount = ' || v_paid::text || ' (expected advance 300 + allocation 200 = 500)';
  ASSERT ABS(v_advance - 300) < 0.01,
    'A4 FAIL: advance_payment = ' || v_advance::text || ' (expected 300)';

  -- ═══ A5: تدقيق/إصلاح الانحراف ═══
  UPDATE public.invoices SET paid_amount = 800 WHERE id = v_inv2;  -- انحراف مصطنع (+300)

  SELECT COUNT(*) INTO v_cnt
  FROM public.fn_audit_invoice_paid_drift(v_company, false) r
  WHERE r.out_invoice_id = v_inv2 AND r.out_action LIKE '%قابل للتصحيح%';
  ASSERT v_cnt = 1, 'A5 FAIL: dry-run did not report the drift for invoice ' || v_inv2::text;

  SELECT COALESCE(paid_amount, 0) INTO v_paid FROM public.invoices WHERE id = v_inv2;
  ASSERT ABS(v_paid - 800) < 0.01, 'A5 FAIL: dry-run mutated paid_amount to ' || v_paid::text;

  PERFORM public.fn_audit_invoice_paid_drift(v_company, true);

  SELECT COALESCE(paid_amount, 0) INTO v_paid FROM public.invoices WHERE id = v_inv2;
  ASSERT ABS(v_paid - 500) < 0.01,
    'A5 FAIL: repair left paid_amount = ' || v_paid::text || ' (expected 500)';

  -- بعد الإصلاح: لا انحراف متبقٍ على الفاتورة
  SELECT COUNT(*) INTO v_cnt
  FROM public.fn_audit_invoice_paid_drift(v_company, false) r
  WHERE r.out_invoice_id = v_inv2;
  ASSERT v_cnt = 0, 'A5 FAIL: drift still reported after repair';
END;
$$;

ROLLBACK;
