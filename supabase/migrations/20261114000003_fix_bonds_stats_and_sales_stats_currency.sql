-- ============================================================
-- Migration: Fix currency conversion bugs in stats functions
-- Date: 2026-11-14
-- Issues fixed:
--   1. get_bonds_stats: YER divided by rate → massive inflation
--      (206 BILLION wrong vs 1.6M correct)
--   2. get_sales_stats: no currency conversion at all
--   3. get_customer_stats: party_balances.balance is in SAR (OK)
--      but totalOutstanding uses mixed-currency balances without
--      converting to base — party_balances is now GL-based (SAR stored)
--   4. get_dashboard_totals: OLD function, uses raw invoice amounts
--      without fn_to_base_amount — replaced by get_dashboard_summary
--      but still called from some screens
-- ============================================================

-- ============================================================
-- FIX 1: get_bonds_stats (both overloads)
-- Problem: manual YER logic divides by rate → 206 billion instead of 1.6M
-- Fix: use fn_to_base_amount which correctly multiplies when rate<1
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_bonds_stats(
  p_company_id uuid,
  p_branch_id  uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_amount   numeric := 0;
  v_total_count    int     := 0;
  v_receipt_count  int     := 0;
  v_receipt_amount numeric := 0;
  v_payment_count  int     := 0;
  v_payment_amount numeric := 0;
  v_avg_amount     numeric := 0;
  v_chart_data     json;
  v_account_data   json;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_company_roles ucr
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  SELECT
    COALESCE(SUM(public.fn_to_base_amount(currency_code, amount, exchange_rate)), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE type = 'receipt'),
    COALESCE(SUM(public.fn_to_base_amount(currency_code, amount, exchange_rate)) FILTER (WHERE type = 'receipt'), 0),
    COUNT(*) FILTER (WHERE type = 'disbursement'),
    COALESCE(SUM(public.fn_to_base_amount(currency_code, amount, exchange_rate)) FILTER (WHERE type = 'disbursement'), 0)
  INTO v_total_amount, v_total_count, v_receipt_count, v_receipt_amount, v_payment_count, v_payment_amount
  FROM payments
  WHERE company_id = p_company_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND status != 'void'
    AND deleted_at IS NULL;

  IF v_total_count > 0 THEN
    v_avg_amount := ROUND(v_total_amount / v_total_count, 2);
  END IF;

  WITH dates AS (
    SELECT date_trunc('day', NOW() - (n || ' days')::interval)::date AS d
    FROM generate_series(0, 29) n
  ),
  daily AS (
    SELECT d.d AS date,
      COALESCE(SUM(public.fn_to_base_amount(b.currency_code, b.amount, b.exchange_rate)), 0) AS amount,
      COUNT(b.id) AS count
    FROM dates d
    LEFT JOIN payments b
      ON d.d = b.payment_date
      AND b.company_id = p_company_id
      AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
      AND b.status != 'void'
      AND b.deleted_at IS NULL
    GROUP BY d.d
  )
  SELECT json_agg(
    json_build_object('date', date, 'amount', ROUND(amount::numeric, 2), 'count', count)
    ORDER BY date
  )
  INTO v_chart_data
  FROM daily;

  WITH acct AS (
    SELECT
      COALESCE(a.name_ar, a.name_en, 'غير محدد') AS account_name,
      COALESCE(SUM(public.fn_to_base_amount(b.currency_code, b.amount, b.exchange_rate)), 0) AS amount
    FROM payments b
    LEFT JOIN accounts a ON a.id = b.account_id
    WHERE b.company_id = p_company_id
      AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
      AND b.status != 'void'
      AND b.deleted_at IS NULL
    GROUP BY a.name_ar, a.name_en
    ORDER BY amount DESC
    LIMIT 5
  )
  SELECT json_agg(json_build_object('account', account_name, 'amount', ROUND(amount::numeric, 2)))
  INTO v_account_data FROM acct;

  RETURN json_build_object(
    'totalAmount',   ROUND(v_total_amount,   2),
    'totalCount',    v_total_count,
    'receiptCount',  v_receipt_count,
    'receiptAmount', ROUND(v_receipt_amount, 2),
    'paymentCount',  v_payment_count,
    'paymentAmount', ROUND(v_payment_amount, 2),
    'avgAmount',     ROUND(v_avg_amount,     2),
    'chartData',     COALESCE(v_chart_data,  '[]'::json),
    'accountData',   COALESCE(v_account_data,'[]'::json)
  );
END;
$$;

-- Second overload with p_period parameter
CREATE OR REPLACE FUNCTION public.get_bonds_stats(
  p_company_id uuid,
  p_branch_id  uuid    DEFAULT NULL,
  p_period     text    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_amount   numeric := 0;
  v_total_count    int     := 0;
  v_receipt_count  int     := 0;
  v_receipt_amount numeric := 0;
  v_payment_count  int     := 0;
  v_payment_amount numeric := 0;
  v_avg_amount     numeric := 0;
  v_chart_data     json;
  v_account_data   json;
  v_date_from      timestamptz;
  v_date_to        timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_company_roles ucr
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  v_date_to := NOW();
  CASE p_period
    WHEN 'today'   THEN v_date_from := date_trunc('day', NOW());
    WHEN 'week'    THEN v_date_from := NOW() - INTERVAL '7 days';
    WHEN 'month'   THEN v_date_from := date_trunc('month', NOW());
    WHEN 'quarter' THEN v_date_from := date_trunc('quarter', NOW());
    WHEN 'year'    THEN v_date_from := date_trunc('year', NOW());
    ELSE                v_date_from := NULL;
  END CASE;

  SELECT
    COALESCE(SUM(public.fn_to_base_amount(currency_code, amount, exchange_rate)), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE type = 'receipt'),
    COALESCE(SUM(public.fn_to_base_amount(currency_code, amount, exchange_rate)) FILTER (WHERE type = 'receipt'), 0),
    COUNT(*) FILTER (WHERE type = 'disbursement'),
    COALESCE(SUM(public.fn_to_base_amount(currency_code, amount, exchange_rate)) FILTER (WHERE type = 'disbursement'), 0)
  INTO v_total_amount, v_total_count, v_receipt_count, v_receipt_amount, v_payment_count, v_payment_amount
  FROM payments
  WHERE company_id = p_company_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND status != 'void'
    AND deleted_at IS NULL
    AND (v_date_from IS NULL OR payment_date >= v_date_from::date);

  IF v_total_count > 0 THEN
    v_avg_amount := ROUND(v_total_amount / v_total_count, 2);
  END IF;

  -- Chart: last 30 days always
  WITH dates AS (
    SELECT date_trunc('day', NOW() - (n || ' days')::interval)::date AS d
    FROM generate_series(0, 29) n
  ),
  daily AS (
    SELECT d.d AS date,
      COALESCE(SUM(public.fn_to_base_amount(b.currency_code, b.amount, b.exchange_rate)), 0) AS amount,
      COUNT(b.id) AS count
    FROM dates d
    LEFT JOIN payments b
      ON d.d = b.payment_date
      AND b.company_id = p_company_id
      AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
      AND b.status != 'void'
      AND b.deleted_at IS NULL
    GROUP BY d.d
  )
  SELECT json_agg(
    json_build_object('date', date, 'amount', ROUND(amount::numeric, 2), 'count', count)
    ORDER BY date
  )
  INTO v_chart_data
  FROM daily;

  WITH acct AS (
    SELECT
      COALESCE(a.name_ar, a.name_en, 'غير محدد') AS account_name,
      COALESCE(SUM(public.fn_to_base_amount(b.currency_code, b.amount, b.exchange_rate)), 0) AS amount
    FROM payments b
    LEFT JOIN accounts a ON a.id = b.account_id
    WHERE b.company_id = p_company_id
      AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
      AND b.status != 'void'
      AND b.deleted_at IS NULL
    GROUP BY a.name_ar, a.name_en
    ORDER BY amount DESC
    LIMIT 5
  )
  SELECT json_agg(json_build_object('account', account_name, 'amount', ROUND(amount::numeric, 2)))
  INTO v_account_data FROM acct;

  RETURN json_build_object(
    'totalAmount',   ROUND(v_total_amount,   2),
    'totalCount',    v_total_count,
    'receiptCount',  v_receipt_count,
    'receiptAmount', ROUND(v_receipt_amount, 2),
    'paymentCount',  v_payment_count,
    'paymentAmount', ROUND(v_payment_amount, 2),
    'avgAmount',     ROUND(v_avg_amount,     2),
    'chartData',     COALESCE(v_chart_data,  '[]'::json),
    'accountData',   COALESCE(v_account_data,'[]'::json)
  );
END;
$$;

-- ============================================================
-- FIX 2: get_sales_stats — no currency conversion at all!
-- Uses raw total_amount without converting YER→SAR
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_sales_stats(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE vc uuid;
BEGIN
  vc := public.verify_company_access(p_company_id);
  RETURN (
    SELECT jsonb_build_object(
      'total_sales',
        COALESCE(SUM(public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)), 0),
      'invoice_count',
        COUNT(i.id),
      'avg_sale',
        CASE WHEN COUNT(i.id) > 0
             THEN ROUND(SUM(public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)) / COUNT(i.id), 2)
             ELSE 0 END
    )
    FROM public.invoices i
    WHERE i.company_id = vc
      AND i.type = 'sale'
      AND i.status != 'void'
      AND i.deleted_at IS NULL
  );
END;
$$;

-- ============================================================
-- FIX 3: get_dashboard_totals — OLD function still referenced
-- Uses raw invoice amounts (no fn_to_base_amount), and party_balances
-- which is GL-based (already in SAR). Fix the invoice sums.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_totals(
  p_company_id uuid,
  p_branch_id  uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sales          numeric;
  v_purchases      numeric;
  v_expenses       numeric;
  v_debts          numeric;
  v_supplier_debts numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_company_roles ucr
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  -- Sales: use fn_to_base_amount for proper currency conversion
  SELECT COALESCE(SUM(public.fn_to_base_amount(currency_code, total_amount, exchange_rate)), 0)
  INTO v_sales
  FROM invoices
  WHERE company_id = p_company_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND type = 'sale'
    AND status != 'void'
    AND deleted_at IS NULL;

  -- Purchases: same fix
  SELECT COALESCE(SUM(public.fn_to_base_amount(currency_code, total_amount, exchange_rate)), 0)
  INTO v_purchases
  FROM invoices
  WHERE company_id = p_company_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND type = 'purchase'
    AND status != 'void'
    AND deleted_at IS NULL;

  -- Expenses: from expenses table with currency conversion
  SELECT COALESCE(SUM(
    CASE
      WHEN e.currency_code IS NULL OR e.currency_code = 'SAR' THEN e.amount
      WHEN sc.exchange_operator = 'divide' AND e.exchange_rate > 0 THEN ROUND(e.amount / e.exchange_rate, 2)
      ELSE ROUND(e.amount * COALESCE(e.exchange_rate, 1), 2)
    END
  ), 0)
  INTO v_expenses
  FROM expenses e
  LEFT JOIN supported_currencies sc ON sc.code = e.currency_code
  WHERE e.company_id = p_company_id
    AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
    AND e.status != 'void'
    AND e.deleted_at IS NULL;

  -- Debts from party_balances (GL-based, already in SAR)
  SELECT COALESCE(SUM(balance), 0)
  INTO v_debts
  FROM party_balances
  WHERE company_id = p_company_id
    AND type IN ('customer', 'both')
    AND balance > 0;

  SELECT COALESCE(SUM(ABS(balance)), 0)
  INTO v_supplier_debts
  FROM party_balances
  WHERE company_id = p_company_id
    AND type IN ('supplier', 'both')
    AND balance < 0;

  RETURN json_build_object(
    'total_sales',          ROUND(v_sales,          2),
    'total_purchases',      ROUND(v_purchases,      2),
    'total_expenses',       ROUND(v_expenses,       2),
    'total_debts',          ROUND(v_debts,          2),
    'total_supplier_debts', ROUND(v_supplier_debts, 2)
  );
END;
$$;

-- ============================================================
-- FIX 4: get_customer_stats — totalOutstanding uses party_balances
-- party_balances sums raw journal debit-credit (SAR amounts, correct)
-- BUT the join is wrong: LEFT JOIN party_balances pb ON p.id=pb.party_id
-- without company_id filter or currency aggregation
-- Fix: use party_balances_by_currency aggregated to base currency
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_customer_stats(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE result json;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_company_roles ucr
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  WITH latest_rates AS (
    SELECT DISTINCT ON (currency_code)
      currency_code, rate_to_base
    FROM exchange_rates
    WHERE company_id = p_company_id AND effective_date <= CURRENT_DATE
    ORDER BY currency_code, effective_date DESC, created_at DESC
  ),
  party_outstanding AS (
    SELECT
      pbc.party_id,
      SUM(public.fn_to_base_amount(pbc.currency_code, pbc.balance, lr.rate_to_base)) AS base_balance
    FROM party_balances_by_currency pbc
    LEFT JOIN latest_rates lr ON lr.currency_code = pbc.currency_code
    WHERE pbc.company_id = p_company_id
    GROUP BY pbc.party_id
  )
  SELECT json_build_object(
    'totalCustomers',          COUNT(*),
    'activeCustomers',         COUNT(*) FILTER (WHERE p.status = 'active'),
    'newThisMonth',            COUNT(*) FILTER (WHERE p.customer_since >= DATE_TRUNC('month', CURRENT_DATE)),
    'avgInvoicesPerCustomer',  COALESCE(AVG(p.total_invoices_count), 0),
    'totalOutstanding',        COALESCE(SUM(GREATEST(po.base_balance, 0)), 0),
    'highValueCustomers',      COUNT(*) FILTER (WHERE p.total_paid_amount > 10000)
  )
  INTO result
  FROM parties p
  LEFT JOIN party_outstanding po ON po.party_id = p.id
  WHERE p.company_id = p_company_id
    AND p.type = 'customer'
    AND p.deleted_at IS NULL;

  RETURN result;
END;
$$;

-- ============================================================
-- FIX 5: report_debts — uses party_balances which is GL-based (SAR)
-- but doesn't aggregate currencies → shows single-currency only
-- The view already sums all journal lines per party (all in SAR),
-- so the totals ARE correct. Only problem: mixed 'both' party type
-- not counted in receivables. Fix: include 'both' type.
-- ============================================================

CREATE OR REPLACE FUNCTION public.report_debts(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_receivables numeric := 0;
  v_payables    numeric := 0;
  v_debts       json;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  WITH active_debts AS (
    SELECT
      p.id,
      p.name,
      p.type,
      -- party_balances balance is sum of (debit-credit) in SAR from GL
      -- Positive = customer owes us (receivable)
      -- Negative = we owe supplier (payable)
      pb.balance AS remaining_amount
    FROM public.parties p
    JOIN public.party_balances pb
      ON pb.party_id = p.id AND pb.company_id = p_company_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND ABS(pb.balance) > 0.01
    ORDER BY pb.balance DESC
  )
  SELECT
    COALESCE(SUM(remaining_amount)        FILTER (WHERE remaining_amount > 0 AND type IN ('customer','both')), 0),
    COALESCE(SUM(ABS(remaining_amount))   FILTER (WHERE remaining_amount < 0 AND type IN ('supplier','both')), 0),
    COALESCE(json_agg(row_to_json(ad)), '[]'::json)
  INTO v_receivables, v_payables, v_debts
  FROM active_debts ad;

  RETURN json_build_object(
    'summary', json_build_object(
      'receivables', ROUND(v_receivables, 2),
      'payables',    ROUND(v_payables,    2)
    ),
    'debts', v_debts
  );
END;
$$;

COMMENT ON FUNCTION public.get_bonds_stats(uuid, uuid)       IS 'Fixed 2026-11-14: use fn_to_base_amount instead of manual YER division';
COMMENT ON FUNCTION public.get_bonds_stats(uuid, uuid, text) IS 'Fixed 2026-11-14: use fn_to_base_amount instead of manual YER division';
COMMENT ON FUNCTION public.get_sales_stats(uuid)             IS 'Fixed 2026-11-14: added fn_to_base_amount currency conversion';
COMMENT ON FUNCTION public.get_dashboard_totals(uuid, uuid)  IS 'Fixed 2026-11-14: added fn_to_base_amount for invoices; party_balances already GL-based';
COMMENT ON FUNCTION public.get_customer_stats(uuid)          IS 'Fixed 2026-11-14: use party_balances_by_currency with fn_to_base_amount';
COMMENT ON FUNCTION public.report_debts(uuid)                IS 'Fixed 2026-11-14: include both-type parties in receivables/payables';
