-- ============================================================
-- Migration: Fix report_cash_flow and report_account_balances
-- Date: 2026-11-14
-- Issues:
--   1. report_cash_flow operating_in: uses raw paid_amount without fn_to_base_amount
--   2. report_cash_flow financing_in/out: uses raw p.amount without fn_to_base_amount
--   3. report_account_balances foreign_balance: hardcoded fallback rate of 410 YER/SAR
-- ============================================================

-- ============================================================
-- FIX 1: report_cash_flow
-- operating_in uses raw paid_amount (no currency conversion)
-- financing_in/out use raw p.amount (no currency conversion)
-- ============================================================

CREATE OR REPLACE FUNCTION public.report_cash_flow(
  p_company_id uuid,
  p_from       date,
  p_to         date,
  p_branch_id  uuid DEFAULT NULL
)
RETURNS TABLE(category text, inflow numeric, outflow numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_operating_in  numeric;
  v_operating_out numeric;
  v_financing_in  numeric;
  v_financing_out numeric;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  -- Operating inflow: cash sales receipts converted to base currency
  SELECT COALESCE(SUM(
    public.fn_to_base_amount(i.currency_code, COALESCE(i.paid_amount, i.total_amount), i.exchange_rate)
  ), 0)
  INTO v_operating_in
  FROM public.invoices i
  WHERE i.company_id = p_company_id
    AND i.type = 'sale'
    AND i.status IN ('paid', 'partially_paid')
    AND i.payment_method = 'cash'
    AND i.issue_date BETWEEN p_from AND p_to
    AND i.deleted_at IS NULL
    AND (p_branch_id IS NULL OR i.branch_id = p_branch_id);

  -- Operating outflow: cash purchases + cash/bank expenses in base currency
  SELECT
    COALESCE((
      SELECT SUM(public.fn_to_base_amount(p.currency_code, COALESCE(p.paid_amount, p.total_amount), p.exchange_rate))
      FROM public.invoices p
      WHERE p.company_id = p_company_id
        AND p.type = 'purchase'
        AND p.status IN ('paid', 'partially_paid')
        AND p.payment_method = 'cash'
        AND p.issue_date BETWEEN p_from AND p_to
        AND p.deleted_at IS NULL
        AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
    ), 0)
    +
    COALESCE((
      SELECT SUM(public.fn_to_base_amount(e.currency_code, e.amount, e.exchange_rate))
      FROM public.expenses e
      WHERE e.company_id = p_company_id
        AND e.status IN ('posted', 'paid')
        AND e.payment_method IN ('cash', 'bank')
        AND e.expense_date BETWEEN p_from AND p_to
        AND e.deleted_at IS NULL
        AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
    ), 0)
  INTO v_operating_out;

  -- Financing inflow: receipt bonds converted to base currency
  SELECT COALESCE(SUM(
    public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)
  ), 0)
  INTO v_financing_in
  FROM public.payments p
  WHERE p.company_id = p_company_id
    AND p.type = 'receipt'
    AND p.status = 'posted'
    AND p.payment_date BETWEEN p_from AND p_to
    AND p.deleted_at IS NULL
    AND (p_branch_id IS NULL OR p.branch_id = p_branch_id);

  -- Financing outflow: payment bonds converted to base currency
  SELECT COALESCE(SUM(
    public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)
  ), 0)
  INTO v_financing_out
  FROM public.payments p
  WHERE p.company_id = p_company_id
    AND p.type = 'disbursement'
    AND p.status = 'posted'
    AND p.payment_date BETWEEN p_from AND p_to
    AND p.deleted_at IS NULL
    AND (p_branch_id IS NULL OR p.branch_id = p_branch_id);

  category := 'التشغيل';  inflow := ROUND(v_operating_in,  2); outflow := ROUND(v_operating_out, 2); RETURN NEXT;
  category := 'الاستثمار'; inflow := 0;                         outflow := 0;                          RETURN NEXT;
  category := 'التمويل';   inflow := ROUND(v_financing_in,  2); outflow := ROUND(v_financing_out, 2); RETURN NEXT;
END;
$$;

-- ============================================================
-- FIX 2: report_account_balances
-- foreign_balance uses hardcoded fallback rate 410 instead of
-- using the stored exchange_rate or fn_to_base_amount
-- Fix: use jel.exchange_rate directly (already the correct rate)
-- ============================================================

CREATE OR REPLACE FUNCTION public.report_account_balances(
  p_company_id uuid,
  p_as_of_date date DEFAULT CURRENT_DATE,
  p_branch_id  uuid DEFAULT NULL
)
RETURNS TABLE(
  account_id      uuid,
  balance         numeric,
  total_debit     numeric,
  total_credit    numeric,
  foreign_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_base_currency text;
  v_as_of         date;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT base_currency INTO v_base_currency
  FROM public.companies
  WHERE id = p_company_id;

  v_as_of := COALESCE(p_as_of_date, CURRENT_DATE);

  RETURN QUERY
  SELECT
    l.account_id,
    (SUM(l.debit_amount) - SUM(l.credit_amount))::numeric                       AS balance,
    SUM(l.debit_amount)::numeric                                                 AS total_debit,
    SUM(l.credit_amount)::numeric                                                AS total_credit,
    -- foreign_balance: original currency amount using stored foreign_amount or back-calculated
    CASE
      WHEN a.currency_code = v_base_currency OR a.currency_code IS NULL THEN
        SUM(l.debit_amount) - SUM(l.credit_amount)
      ELSE
        SUM(
          CASE
            WHEN l.foreign_amount IS NOT NULL AND l.foreign_amount <> 0 THEN
              CASE WHEN l.debit_amount >= l.credit_amount THEN l.foreign_amount ELSE -l.foreign_amount END
            WHEN COALESCE(l.exchange_rate, 0) > 0 THEN
              -- Back-calculate from base amount: reverse fn_to_base_amount
              CASE WHEN l.debit_amount >= l.credit_amount
                THEN public.fn_to_base_amount(l.currency_code, l.debit_amount - l.credit_amount, l.exchange_rate)
                ELSE -public.fn_to_base_amount(l.currency_code, l.credit_amount - l.debit_amount, l.exchange_rate)
              END
            ELSE l.debit_amount - l.credit_amount
          END
        )
    END::numeric                                                                 AS foreign_balance
  FROM public.journal_entry_lines l
  JOIN public.journal_entries j
    ON j.id           = l.journal_entry_id
   AND j.company_id   = p_company_id
   AND j.status       = 'posted'
   AND j.deleted_at   IS NULL
   AND j.entry_date  <= v_as_of
  JOIN public.accounts a
    ON a.id          = l.account_id
   AND a.company_id  = p_company_id
  WHERE l.company_id = p_company_id
    AND l.deleted_at IS NULL
    AND (p_branch_id IS NULL OR l.branch_id = p_branch_id)
  GROUP BY l.account_id, a.currency_code
  ORDER BY l.account_id;
END;
$$;

COMMENT ON FUNCTION public.report_cash_flow(uuid,date,date,uuid) IS 'Fixed 2026-11-14: fn_to_base_amount for operating_in and financing bonds';
COMMENT ON FUNCTION public.report_account_balances(uuid,date,uuid) IS 'Fixed 2026-11-14: removed hardcoded 410 fallback rate, use stored exchange_rate';
