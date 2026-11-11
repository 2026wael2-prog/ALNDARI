-- ============================================================
-- Debt returns netting + base-currency conversion tests
-- (remediation 2026-11-03 / migration 20261103000001)
-- ============================================================
-- Verifies against a real Postgres (run as a role that bypasses RLS):
--   T1  get_debt_followup_dashboard nets sale_return into outstanding
--       and subtracts it from overdue first (FIFO), so overdue <= outstanding
--   T2  get_debt_party_overview applies the same FIFO rule
--   T3  fn_to_base_amount 4-arg overload: base SAR == legacy 3-arg,
--       same currency is a no-op, and the 3-arg call stays unambiguous
--   T4  record_debt_reminder permission gate (accountant allowed, viewer denied)
--
-- HOW TO RUN:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--        -f supabase/tests/test_debt_returns_and_base_currency.sql
-- The whole script runs inside ONE transaction that is ROLLED BACK.
-- ============================================================

\set ON_ERROR_STOP on

BEGIN;

-- مُشغّل الترحيل التلقائي (fn_auto_post_invoice_journal) يتطلب دليل حسابات كاملاً
-- (4100/1200/5100 …) وهو غير متاح لمنشأة اختبار جديدة. الأرصدة التي تختبرها الدوال
-- تُقرأ من invoices.total_amount - paid_amount، أي لا تعتمد على القيود إطلاقاً.
-- تعطيل المُشغّلات DDL تراجعي في PostgreSQL ⇒ يزول تلقائياً مع ROLLBACK أدناه.
ALTER TABLE public.invoices DISABLE TRIGGER USER;

DO $$
DECLARE
  v_uid     uuid;
  v_company uuid;
  v_branch  uuid;
  v_party   uuid;
  v_sale    uuid;
  v_return  uuid;
  v_today   date := CURRENT_DATE;
  v_num     numeric;
  v_num2    numeric;
  v_cnt     bigint;
  v_date    date;
  v_blocked boolean := false;
  v_json    json;
  v_row     record;
BEGIN
  SELECT id INTO v_uid FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'debt returns test requires at least one user in auth.users';
  END IF;

  INSERT INTO public.companies (name_ar) VALUES ('__debt_returns_test__')
  RETURNING id INTO v_company;

  -- auth.uid() يقرأ request.jwt.claim.sub في الإصدارات القديمة و request.jwt.claims في الحديثة
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  INSERT INTO public.branches (company_id, name, is_main)
  VALUES (v_company, '__test_branch__', true) RETURNING id INTO v_branch;

  -- accountant: user_can_manage_debts = true, but no debts:remind row seeded
  INSERT INTO user_company_roles(user_id, company_id, role, branch_id)
  VALUES (v_uid, v_company, 'accountant', v_branch);

  INSERT INTO fiscal_years(company_id, name, start_date, end_date, is_closed)
  VALUES (v_company, 'FY2026', DATE '2026-01-01', DATE '2026-12-31', false);

  INSERT INTO supported_currencies(code, name_ar, symbol, exchange_operator)
  VALUES ('YER', 'ريال يمني', 'ر.ي', 'divide')
  ON CONFLICT (code) DO UPDATE SET exchange_operator = 'divide';

  INSERT INTO public.parties(company_id, name, type, branch_id)
  VALUES (v_company, '__returns_customer__', 'customer', v_branch)
  RETURNING id INTO v_party;

  -- ① فاتورة بيع: 1000 إجمالي، مسدد 200، استحقاقها قبل 10 أيام → متأخر 800
  INSERT INTO public.invoices (
    company_id, invoice_number, type, status, party_id, branch_id,
    issue_date, due_date, total_amount, subtotal, tax_amount, discount_amount,
    payment_method, currency_code, exchange_rate, created_by
  ) VALUES (
    v_company, '__TEST-SALE-1__', 'sale', 'confirmed', v_party, v_branch,
    v_today - 20, v_today - 10, 1000, 1000, 0, 0,
    'credit', 'SAR', 1, v_uid
  ) RETURNING id INTO v_sale;

  UPDATE public.invoices SET paid_amount = 200 WHERE id = v_sale;

  -- ② مرتجع بيع: 300 موجبة (كما يُخزّنها create_sale_return)، غير مسدد
  --    chk_return_needs_reason ⇒ return_reason إلزامي على sale_return
  INSERT INTO public.invoices (
    company_id, invoice_number, type, status, party_id, branch_id,
    issue_date, due_date, total_amount, subtotal, tax_amount, discount_amount,
    payment_method, currency_code, exchange_rate, reference_invoice_id, return_reason, created_by
  ) VALUES (
    v_company, '__TEST-RET-1__', 'sale_return', 'confirmed', v_party, v_branch,
    v_today - 5, v_today - 5, 300, 300, 0, 0,
    'credit', 'SAR', 1, v_sale, '__test_return__', v_uid
  ) RETURNING id INTO v_return;

  -- ═══ T1: dashboard nets returns (500 = 800 - 300) ═══
  SELECT * INTO v_row
  FROM public.get_debt_followup_dashboard(v_company, 7, 30, 3, NULL::uuid, NULL::integer)
  WHERE party_id = v_party;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'T1 FAILED: dashboard returned no row for the test party';
  END IF;

  IF v_row.outstanding_balance <> 500 THEN
    RAISE EXCEPTION 'T1 FAILED: outstanding_balance = % (expected 500)', v_row.outstanding_balance;
  END IF;

  -- المرتجع يُخصم من المتأخر أولًا: 800 - 300 = 500 (وكان يبقى 800 قبل الإصلاح)
  IF v_row.overdue_amount <> 500 THEN
    RAISE EXCEPTION 'T1 FAILED: overdue_amount = % (expected 500 after FIFO netting)', v_row.overdue_amount;
  END IF;

  IF v_row.invoice_count <> 1 THEN
    RAISE EXCEPTION 'T1 FAILED: invoice_count = % (expected 1 sale only)', v_row.invoice_count;
  END IF;

  IF v_row.oldest_due_date <> v_today - 10 THEN
    RAISE EXCEPTION 'T1 FAILED: oldest_due_date = % (expected %)', v_row.oldest_due_date, v_today - 10;
  END IF;

  -- المرتجع لا يصنع استحقاقًا قادمًا
  IF v_row.next_due_date IS NOT NULL THEN
    RAISE EXCEPTION 'T1 FAILED: next_due_date = % (expected NULL — returns are not due dates)', v_row.next_due_date;
  END IF;

  IF v_row.overdue_amount > v_row.outstanding_balance THEN
    RAISE EXCEPTION 'T1 FAILED: overdue (%) > outstanding (%)', v_row.overdue_amount, v_row.outstanding_balance;
  END IF;

  -- ═══ T2: party overview applies the same FIFO rule ═══
  SELECT * INTO v_row FROM public.get_debt_party_overview(v_company, v_party);

  IF v_row.total_outstanding <> 500 THEN
    RAISE EXCEPTION 'T2 FAILED: total_outstanding = % (expected 500)', v_row.total_outstanding;
  END IF;
  IF v_row.overdue_amount <> 500 THEN
    RAISE EXCEPTION 'T2 FAILED: overdue_amount = % (expected 500)', v_row.overdue_amount;
  END IF;
  IF v_row.due_today_amount <> 0 THEN
    RAISE EXCEPTION 'T2 FAILED: due_today_amount = % (expected 0 — nothing falls due today)', v_row.due_today_amount;
  END IF;
  IF v_row.invoice_count <> 1 THEN
    RAISE EXCEPTION 'T2 FAILED: invoice_count = % (expected 1 sale only)', v_row.invoice_count;
  END IF;

  -- ═══ T2-b: analytics must agree with the netted dashboard ═══
  v_json := public.get_debt_analytics_summary(v_company, NULL::uuid);
  IF (v_json ->> 'total_receivables')::NUMERIC <> 500 THEN
    RAISE EXCEPTION 'T2b FAILED: total_receivables = % (expected 500)', v_json ->> 'total_receivables';
  END IF;
  IF (v_json ->> 'overdue_receivables')::NUMERIC <> 500 THEN
    RAISE EXCEPTION 'T2b FAILED: overdue_receivables = % (expected 500)', v_json ->> 'overdue_receivables';
  END IF;

  -- ═══ T3: fn_to_base_amount base-currency overload ═══
  -- 3-arg call must still resolve (the 4-arg overload has no DEFAULT → no 42725)
  v_num := public.fn_to_base_amount('YER', 4100, 410);
  IF v_num <> 10 THEN
    RAISE EXCEPTION 'T3 FAILED: legacy 3-arg YER 4100 @410 = % (expected 10)', v_num;
  END IF;

  -- base = SAR must delegate to the legacy behaviour byte-for-byte
  v_num2 := public.fn_to_base_amount('YER', 4100, 410, 'SAR');
  IF v_num2 <> v_num THEN
    RAISE EXCEPTION 'T3 FAILED: 4-arg(base SAR) = % but legacy 3-arg = %', v_num2, v_num;
  END IF;

  -- converting a currency to itself is a no-op
  v_num2 := public.fn_to_base_amount('YER', 123.45, 410, 'YER');
  IF v_num2 <> 123.45 THEN
    RAISE EXCEPTION 'T3 FAILED: same-currency conversion changed the amount (%)', v_num2;
  END IF;

  -- a YER-base company must not see the raw SAR figure (410x understated)
  v_num2 := public.fn_to_base_amount('SAR', 100, 410, 'YER');
  IF v_num2 = 100 THEN
    RAISE EXCEPTION 'T3 FAILED: SAR->YER returned the unconverted amount';
  END IF;

  -- ═══ T4: record_debt_reminder permission gate ═══
  -- accountant: covered by user_can_manage_debts (no debts:remind row needed)
  PERFORM public.record_debt_reminder(v_company, v_party, '__test_reminder__');

  -- viewer: neither user_can_manage_debts nor debts:remind
  UPDATE public.user_company_roles SET role = 'viewer'
   WHERE user_id = v_uid AND company_id = v_company;

  BEGIN
    PERFORM public.record_debt_reminder(v_company, v_party, '__viewer_should_fail__');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%access_denied%' THEN
        v_blocked := true;
      ELSE
        RAISE;
      END IF;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'T4 FAILED: a viewer was able to record a debt reminder';
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM public.debt_message_log
   WHERE company_id = v_company AND message_text = '__viewer_should_fail__';
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T4 FAILED: % message-log rows were written by the blocked viewer', v_cnt;
  END IF;

  RAISE NOTICE 'ALL DEBT RETURNS / BASE CURRENCY TESTS PASSED';
END;
$$;

ROLLBACK;

