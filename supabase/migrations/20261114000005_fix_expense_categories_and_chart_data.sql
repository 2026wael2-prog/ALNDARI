-- ============================================================
-- Migration: Fix get_expense_categories_summary and get_sales_chart_data
-- Date: 2026-11-14
-- Issues:
--   1. get_expense_categories_summary: divides YER by rate (wrong!)
--      YER has rate < 1 (e.g. 0.00235), so fn_to_base_amount multiplies.
--      Manual division gives 1000 YER / 0.00235 = 425,000 SAR (WRONG!)
--      Correct: 1000 YER * 0.00235 = 2.35 SAR
--   2. get_sales_chart_data: uses raw total_amount for invoices without
--      currency conversion (fn_to_base_amount used only for expenses)
-- ============================================================

-- ============================================================
-- FIX 1: get_expense_categories_summary
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_expense_categories_summary(
  p_company_id uuid,
  p_date_from  date DEFAULT NULL,
  p_date_to    date DEFAULT NULL,
  p_branch_id  uuid DEFAULT NULL
)
RETURNS TABLE(category_name text, total_amount numeric)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(ec.name, 'غير مصنف') AS category_name,
    ROUND(SUM(
      public.fn_to_base_amount(e.currency_code, e.amount, e.exchange_rate)
    )::numeric, 2) AS total_amount
  FROM expenses e
  LEFT JOIN expense_categories ec ON ec.id = e.category_id
  WHERE e.company_id = p_company_id
    AND e.status IN ('posted', 'paid')
    AND e.deleted_at IS NULL
    AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
    AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
    AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
  GROUP BY ec.name
  ORDER BY total_amount DESC
  LIMIT 10;
END;
$$;

-- ============================================================
-- FIX 2: get_sales_chart_data
-- Daily invoice amounts need fn_to_base_amount conversion
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_sales_chart_data(
  p_company_id uuid,
  p_branch_id  uuid DEFAULT NULL,
  p_date_from  date DEFAULT NULL,
  p_date_to    date DEFAULT NULL
)
RETURNS TABLE(
  name      text,
  date      date,
  value     numeric,
  sales     numeric,
  purchases numeric,
  expenses  numeric,
  profit    numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  vc          uuid;
  v_from      date := COALESCE(p_date_from, (CURRENT_DATE - INTERVAL '30 days')::date);
  v_to        date := COALESCE(p_date_to, CURRENT_DATE);
  v_base_currency text;
BEGIN
  vc := public.verify_company_access(p_company_id);

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
          public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
        WHEN i.type IN ('sale_return', 'return_sale') THEN
          -1 * public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
        ELSE 0
      END), 0) AS daily_sales,
      COALESCE(SUM(CASE
        WHEN i.type = 'purchase' THEN
          public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
        WHEN i.type IN ('purchase_return', 'return_purchase') THEN
          -1 * public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
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
        public.fn_to_base_amount(e.currency_code, e.amount, e.exchange_rate)
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
    to_char(d.dt, 'YYYY-MM-DD')                                                             AS name,
    d.dt                                                                                     AS date,
    ROUND(COALESCE(inv.daily_sales, 0), 2)                                                   AS value,
    ROUND(COALESCE(inv.daily_sales, 0), 2)                                                   AS sales,
    GREATEST(ROUND(COALESCE(inv.daily_purchases, 0), 2), 0)                                  AS purchases,
    GREATEST(ROUND(COALESCE(exp.daily_expenses, 0), 2), 0)                                   AS expenses,
    ROUND(COALESCE(inv.daily_sales,0) - COALESCE(inv.daily_purchases,0) - COALESCE(exp.daily_expenses,0), 2) AS profit
  FROM days d
  LEFT JOIN inv_daily inv ON inv.issue_date = d.dt
  LEFT JOIN exp_daily exp ON exp.expense_date = d.dt
  ORDER BY d.dt ASC;
END;
$$;

COMMENT ON FUNCTION public.get_expense_categories_summary(uuid,date,date,uuid) IS 'Fixed 2026-11-14: use fn_to_base_amount instead of manual YER division';
COMMENT ON FUNCTION public.get_sales_chart_data(uuid,uuid,date,date) IS 'Fixed 2026-11-14: use fn_to_base_amount for invoice amounts in chart data';
