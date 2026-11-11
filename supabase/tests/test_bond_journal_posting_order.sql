-- ============================================================
-- Bond journal posting order (20261103000008)
-- ============================================================
-- Verifies against a real database (as a role that bypasses RLS):
--   B1  account-counterparty receipt bond → Dr cash / Cr counterparty
--       (base units), status 'posted', balanced, counterparty_account_id stored
--   B2  account-counterparty payment bond  → Dr counterparty / Cr cash
--   B3  internal transfer                  → Dr target / Cr source,
--       reference_type = 'transfer_bond'
--   B4  party receipt bond                 → exactly one journal entry
--       (no double posting), Dr cash / Cr AR(1100), balanced
--   B5  every bond journal is created in ONE posted entry — the historical
--       "posted-first" bug raised 23514 'Cannot add lines to a posted journal
--       entry' and rolled the whole bond back (this file fails loudly on it)
--
-- HOW TO RUN:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--        -f supabase/tests/test_bond_journal_posting_order.sql
-- The whole script runs inside ONE transaction that is ROLLED BACK.
-- ============================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_uid      uuid;
  v_company  uuid;
  v_customer uuid;
  v_branch   uuid;
  v_cash     uuid;
  v_target   uuid;
  v_counter  uuid;
  v_pay      uuid;
  v_je       uuid;
  v_cnt      bigint;
  v_dr       numeric;
  v_cr       numeric;
  v_status   text;
  v_ref_type text;
BEGIN
  SELECT id INTO v_uid FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'bond posting test requires at least one user in auth.users';
  END IF;

  INSERT INTO public.companies (name_ar) VALUES ('__bond_posting_test__')
  RETURNING id INTO v_company;

  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  INSERT INTO public.branches (company_id, name, is_main)
  VALUES (v_company, '__test_branch__', true)
  RETURNING id INTO v_branch;

  INSERT INTO user_company_roles(user_id, company_id, role, branch_id)
  VALUES (v_uid, v_company, 'accountant', v_branch);

  INSERT INTO fiscal_years(company_id, name, start_date, end_date, is_closed)
  VALUES (v_company, 'FY2026', DATE '2026-01-01', DATE '2026-12-31', false);

  INSERT INTO public.parties(company_id, name, type)
  VALUES (v_company, '__test_customer__', 'customer') RETURNING id INTO v_customer;

  -- Chart of accounts required by the auto-post triggers
  INSERT INTO accounts(company_id, code, name_ar, type, currency_code, allow_posting)
  VALUES (v_company, '1100', 'مدينون', 'asset', 'SAR', true);
  INSERT INTO accounts(company_id, code, name_ar, type, currency_code, allow_posting)
  VALUES (v_company, '1001', 'الصندوق', 'asset', 'SAR', true)
  RETURNING id INTO v_cash;
  -- destination of a transfer
  INSERT INTO accounts(company_id, code, name_ar, type, currency_code, allow_posting)
  VALUES (v_company, '1020', 'البنك', 'asset', 'SAR', true)
  RETURNING id INTO v_target;
  -- general-account counterparty (e.g. قرض/إيراد متنوع)
  INSERT INTO accounts(company_id, code, name_ar, type, currency_code, allow_posting)
  VALUES (v_company, '4200', 'إيرادات أخرى', 'revenue', 'SAR', true)
  RETURNING id INTO v_counter;

  -- ═══ B1: account-counterparty receipt bond ═══
  -- Dr النقدية / Cr الحساب المقابل — لا انعكاس، ولا 23514
  v_je := (public.create_financial_bond(
    v_company, 'receipt', 1000, 'SAR', 1, 1000, DATE '2026-06-10',
    v_cash, v_counter, 'account', 'قبض على حساب إيرادات أخرى', NULL, v_uid, 'cash', v_branch
  )->>'journal_id')::uuid;

  ASSERT v_je IS NOT NULL, 'B1 FAIL: account receipt bond produced no journal entry';

  SELECT je.status INTO v_status FROM public.journal_entries je WHERE je.id = v_je;
  ASSERT v_status = 'posted', 'B1 FAIL: journal status = ' || COALESCE(v_status, 'null');

  SELECT COALESCE(SUM(l.debit_amount), 0), COALESCE(SUM(l.credit_amount), 0)
  INTO v_dr, v_cr
  FROM public.journal_entry_lines l WHERE l.journal_entry_id = v_je;

  ASSERT ABS(v_dr - 1000) < 0.01, 'B1 FAIL: total debit = ' || v_dr::text;
  ASSERT ABS(v_dr - v_cr) < 0.01, 'B1 FAIL: unbalanced journal ' || v_dr::text || ' / ' || v_cr::text;
  ASSERT EXISTS (
    SELECT 1 FROM public.journal_entry_lines l
    WHERE l.journal_entry_id = v_je AND l.account_id = v_cash AND ABS(l.debit_amount - 1000) < 0.01
  ), 'B1 FAIL: cash account is not debited (receipt sign inverted)';
  ASSERT EXISTS (
    SELECT 1 FROM public.journal_entry_lines l
    WHERE l.journal_entry_id = v_je AND l.account_id = v_counter AND ABS(l.credit_amount - 1000) < 0.01
  ), 'B1 FAIL: counterparty account is not credited';
  ASSERT EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.id = (SELECT je.reference_id FROM public.journal_entries je WHERE je.id = v_je)
      AND p.counterparty_account_id = v_counter
  ), 'B1 FAIL: payments.counterparty_account_id was not persisted';

  -- ═══ B2: account-counterparty payment bond ═══
  -- Dr الحساب المقابل / Cr النقدية
  v_je := (public.create_financial_bond(
    v_company, 'payment', 250, 'SAR', 1, 250, DATE '2026-06-11',
    v_cash, v_counter, 'account', 'صرف على حساب إيرادات أخرى', NULL, v_uid, 'cash', v_branch
  )->>'journal_id')::uuid;

  SELECT COALESCE(SUM(l.debit_amount), 0), COALESCE(SUM(l.credit_amount), 0)
  INTO v_dr, v_cr
  FROM public.journal_entry_lines l WHERE l.journal_entry_id = v_je;

  ASSERT ABS(v_dr - 250) < 0.01 AND ABS(v_cr - 250) < 0.01,
    'B2 FAIL: unbalanced payment bond ' || v_dr::text || ' / ' || v_cr::text;
  ASSERT EXISTS (
    SELECT 1 FROM public.journal_entry_lines l
    WHERE l.journal_entry_id = v_je AND l.account_id = v_counter AND ABS(l.debit_amount - 250) < 0.01
  ), 'B2 FAIL: counterparty account is not debited';
  ASSERT EXISTS (
    SELECT 1 FROM public.journal_entry_lines l
    WHERE l.journal_entry_id = v_je AND l.account_id = v_cash AND ABS(l.credit_amount - 250) < 0.01
  ), 'B2 FAIL: cash account is not credited';

  -- ═══ B3: internal transfer ═══
  -- Dr حساب الهدف / Cr حساب المصدر
  v_je := (public.create_financial_bond(
    v_company, 'transfer', 300, 'SAR', 1, 300, DATE '2026-06-12',
    v_cash, v_target, 'account', 'تحويل داخلي للبنك', NULL, v_uid, 'bank', v_branch
  )->>'journal_id')::uuid;

  SELECT je.reference_type INTO v_ref_type FROM public.journal_entries je WHERE je.id = v_je;
  ASSERT v_ref_type = 'transfer_bond', 'B3 FAIL: reference_type = ' || COALESCE(v_ref_type, 'null');
  ASSERT EXISTS (
    SELECT 1 FROM public.journal_entry_lines l
    WHERE l.journal_entry_id = v_je AND l.account_id = v_target AND ABS(l.debit_amount - 300) < 0.01
  ), 'B3 FAIL: transfer target account is not debited';
  ASSERT EXISTS (
    SELECT 1 FROM public.journal_entry_lines l
    WHERE l.journal_entry_id = v_je AND l.account_id = v_cash AND ABS(l.credit_amount - 300) < 0.01
  ), 'B3 FAIL: transfer source account is not credited';

  -- ═══ B4: party receipt bond — قيد واحد فقط (لا ازدواج) ═══
  v_je := (public.create_financial_bond(
    v_company, 'receipt', 400, 'SAR', 1, 400, DATE '2026-06-13',
    v_cash, v_customer, 'party', 'تحصيل من عميل', NULL, v_uid, 'cash', v_branch
  )->>'journal_id')::uuid;

  SELECT COUNT(*) INTO v_cnt
  FROM public.journal_entries je
  WHERE je.reference_id = (SELECT je2.reference_id FROM public.journal_entries je2 WHERE je2.id = v_je)
    AND je.deleted_at IS NULL;
  ASSERT v_cnt = 1, 'B4 FAIL: party bond posted ' || v_cnt::text || ' journal entries instead of 1';

  SELECT je.status INTO v_status FROM public.journal_entries je WHERE je.id = v_je;
  ASSERT v_status = 'posted', 'B4 FAIL: party journal status = ' || COALESCE(v_status, 'null');

  SELECT COALESCE(SUM(l.debit_amount), 0), COALESCE(SUM(l.credit_amount), 0)
  INTO v_dr, v_cr
  FROM public.journal_entry_lines l WHERE l.journal_entry_id = v_je;

  ASSERT ABS(v_dr - 400) < 0.01 AND ABS(v_dr - v_cr) < 0.01,
    'B4 FAIL: unbalanced party journal ' || v_dr::text || ' / ' || v_cr::text;
  ASSERT EXISTS (
    SELECT 1 FROM public.journal_entry_lines l
    WHERE l.journal_entry_id = v_je AND l.account_id = v_cash AND ABS(l.debit_amount - 400) < 0.01
  ), 'B4 FAIL: cash account is not debited';
  ASSERT EXISTS (
    SELECT 1 FROM public.journal_entry_lines l
    JOIN public.accounts a ON a.id = l.account_id
    WHERE l.journal_entry_id = v_je AND a.code = '1100' AND ABS(l.credit_amount - 400) < 0.01
  ), 'B4 FAIL: AR(1100) is not credited';

  -- سندات الطرف لا تُخزّن حساباً مقابلاً (counterparty_account_id تخص الحساب العام فقط)
  ASSERT EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.id = (SELECT je.reference_id FROM public.journal_entries je WHERE je.id = v_je)
      AND p.counterparty_account_id IS NULL
  ), 'B4 FAIL: party bond leaked a counterparty_account_id';
END;
$$;

ROLLBACK;
