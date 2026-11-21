-- ============================================================================
-- WAVE 5A: Eliminate ALL Double-Currency Conversions & Unit Mismatches in DB
-- Applied to live DB dagfjncoullstrhbjssr as wave5a_fix_currency_double_conversion_rpcs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_invoice_to_base_amount(
  p_currency_code text,
  p_amount numeric,
  p_exchange_rate numeric DEFAULT 1
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_amount IS NULL OR p_amount = 0 THEN 0::numeric
    ELSE ROUND(p_amount, 4)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_totals(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sales          numeric;
  v_purchases      numeric;
  v_expenses       numeric;
  v_debts          numeric;
  v_supplier_debts numeric;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT COALESCE(SUM(
    CASE
      WHEN i.type = 'sale' THEN i.total_amount
      WHEN i.type IN ('sale_return', 'return_sale') THEN -i.total_amount
      ELSE 0
    END
  ), 0)
  INTO v_sales
  FROM public.invoices i
  WHERE i.company_id = p_company_id
    AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    AND i.type IN ('sale', 'sale_return', 'return_sale')
    AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
    AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
    AND i.deleted_at IS NULL;

  SELECT COALESCE(SUM(
    CASE
      WHEN i.type = 'purchase' THEN i.total_amount
      WHEN i.type IN ('purchase_return', 'return_purchase') THEN -i.total_amount
      ELSE 0
    END
  ), 0)
  INTO v_purchases
  FROM public.invoices i
  WHERE i.company_id = p_company_id
    AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    AND i.type IN ('purchase', 'purchase_return', 'return_purchase')
    AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
    AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
    AND i.deleted_at IS NULL;

  SELECT COALESCE(SUM(
    public.fn_to_base_amount(e.currency_code, e.amount, e.exchange_rate)
  ), 0)
  INTO v_expenses
  FROM public.expenses e
  WHERE e.company_id = p_company_id
    AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
    AND e.status IN ('posted', 'paid')
    AND e.deleted_at IS NULL;

  SELECT COALESCE(SUM(balance), 0)
  INTO v_debts
  FROM public.party_balances
  WHERE company_id = p_company_id
    AND type IN ('customer', 'both')
    AND balance > 0;

  SELECT COALESCE(SUM(ABS(balance)), 0)
  INTO v_supplier_debts
  FROM public.party_balances
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
$function$;

CREATE OR REPLACE FUNCTION public.get_sales_chart_data(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
RETURNS TABLE(name text, date date, value numeric, sales numeric, purchases numeric, expenses numeric, profit numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  vc          uuid;
  v_from      date := COALESCE(p_date_from, (CURRENT_DATE - INTERVAL '30 days')::date);
  v_to        date := COALESCE(p_date_to, CURRENT_DATE);
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
        WHEN i.type = 'sale' THEN i.total_amount
        WHEN i.type IN ('sale_return', 'return_sale') THEN -i.total_amount
        ELSE 0
      END), 0) AS daily_sales,
      COALESCE(SUM(CASE
        WHEN i.type = 'purchase' THEN i.total_amount
        WHEN i.type IN ('purchase_return', 'return_purchase') THEN -i.total_amount
        ELSE 0
      END), 0) AS daily_purchases
    FROM public.invoices i
    WHERE i.company_id = vc
      AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
      AND i.issue_date BETWEEN v_from AND v_to
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
      AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
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
$function$;

CREATE OR REPLACE FUNCTION public.get_sales_analytics(
  p_company_id uuid,
  p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  vc uuid;
  v_from date := COALESCE(p_start_date, (CURRENT_DATE - INTERVAL '30 days')::date);
  v_to date := COALESCE(p_end_date, CURRENT_DATE);
  v_period_len integer;
  v_prev_from date;
  v_prev_to date;

  v_total_sales numeric := 0;
  v_total_returns numeric := 0;
  v_net_sales numeric := 0;
  v_invoice_count integer := 0;
  v_avg_invoice numeric := 0;

  v_prev_total_sales numeric := 0;
  v_prev_total_returns numeric := 0;
  v_prev_net_sales numeric := 0;

  v_top_products jsonb := '[]'::jsonb;
  v_top_customers jsonb := '[]'::jsonb;
  v_sales_by_day jsonb := '[]'::jsonb;
  v_sales_by_payment jsonb := '[]'::jsonb;
BEGIN
  vc := public.verify_company_access(p_company_id);

  v_period_len := (v_to - v_from) + 1;
  IF v_period_len <= 0 THEN
    v_period_len := 1;
  END IF;
  v_prev_from := v_from - v_period_len;
  v_prev_to := v_from - 1;

  SELECT
    COALESCE(SUM(CASE WHEN i.type = 'sale' THEN i.total_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN i.type IN ('return_sale', 'sale_return') THEN i.total_amount ELSE 0 END), 0),
    COUNT(CASE WHEN i.type = 'sale' THEN 1 END)
  INTO v_total_sales, v_total_returns, v_invoice_count
  FROM public.invoices i
  WHERE i.company_id = vc
    AND i.type IN ('sale', 'return_sale', 'sale_return')
    AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
    AND i.issue_date BETWEEN v_from AND v_to
    AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
    AND i.deleted_at IS NULL;

  v_net_sales := v_total_sales - v_total_returns;
  v_avg_invoice := CASE WHEN v_invoice_count > 0 THEN ROUND(v_total_sales / v_invoice_count, 2) ELSE 0 END;

  SELECT
    COALESCE(SUM(CASE WHEN i.type = 'sale' THEN i.total_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN i.type IN ('return_sale', 'sale_return') THEN i.total_amount ELSE 0 END), 0)
  INTO v_prev_total_sales, v_prev_total_returns
  FROM public.invoices i
  WHERE i.company_id = vc
    AND i.type IN ('sale', 'return_sale', 'sale_return')
    AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
    AND i.issue_date BETWEEN v_prev_from AND v_prev_to
    AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
    AND i.deleted_at IS NULL;

  v_prev_net_sales := v_prev_total_sales - v_prev_total_returns;

  SELECT COALESCE(jsonb_agg(p_row), '[]'::jsonb) INTO v_top_products
  FROM (
    SELECT
      ii.product_id AS "productId",
      COALESCE(p.name_ar, 'صنف غير معروف') AS "productName",
      p.part_number AS "partNumber",
      p.brand AS "brand",
      p.sku AS "sku",
      COALESCE(stk.current_stock, 0) AS "currentStock",
      ROUND(SUM(CASE WHEN i.type = 'sale' THEN ii.quantity WHEN i.type IN ('sale_return', 'return_sale') THEN -ii.quantity ELSE 0 END), 2) AS "quantity",
      ROUND(SUM(
        CASE
          WHEN i.type = 'sale' THEN public.fn_to_base_amount(i.currency_code, ii.total, i.exchange_rate)
          WHEN i.type IN ('sale_return', 'return_sale') THEN -public.fn_to_base_amount(i.currency_code, ii.total, i.exchange_rate)
          ELSE 0
        END
      ), 2) AS "revenue"
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    LEFT JOIN public.products p ON p.id = ii.product_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(quantity), 0) AS current_stock
      FROM public.product_stock s
      WHERE s.product_id = ii.product_id AND s.company_id = vc
    ) stk ON true
    WHERE i.company_id = vc
      AND i.type IN ('sale', 'sale_return', 'return_sale')
      AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
      AND i.issue_date BETWEEN v_from AND v_to
      AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
      AND i.deleted_at IS NULL
    GROUP BY ii.product_id, p.name_ar, p.part_number, p.brand, p.sku, stk.current_stock
    HAVING SUM(CASE WHEN i.type = 'sale' THEN ii.quantity WHEN i.type IN ('sale_return', 'return_sale') THEN -ii.quantity ELSE 0 END) > 0
    ORDER BY "revenue" DESC
    LIMIT 10
  ) p_row;

  SELECT COALESCE(jsonb_agg(c_row), '[]'::jsonb) INTO v_top_customers
  FROM (
    SELECT
      i.party_id AS "customerId",
      COALESCE(p.name, 'عميل نقدي') AS "customerName",
      ROUND(SUM(i.total_amount), 2) AS "totalAmount",
      COUNT(i.id) AS "invoiceCount"
    FROM public.invoices i
    LEFT JOIN public.parties p ON p.id = i.party_id
    WHERE i.company_id = vc
      AND i.type = 'sale'
      AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
      AND i.issue_date BETWEEN v_from AND v_to
      AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
      AND i.deleted_at IS NULL
    GROUP BY i.party_id, p.name
    ORDER BY "totalAmount" DESC
    LIMIT 10
  ) c_row;

  SELECT COALESCE(jsonb_agg(d_row), '[]'::jsonb) INTO v_sales_by_day
  FROM (
    SELECT
      i.issue_date::text AS "date",
      ROUND(SUM(CASE WHEN i.type = 'sale' THEN i.total_amount ELSE 0 END), 2) AS "sales",
      ROUND(SUM(CASE WHEN i.type IN ('return_sale', 'sale_return') THEN i.total_amount ELSE 0 END), 2) AS "returns"
    FROM public.invoices i
    WHERE i.company_id = vc
      AND i.type IN ('sale', 'return_sale', 'sale_return')
      AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
      AND i.issue_date BETWEEN v_from AND v_to
      AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
      AND i.deleted_at IS NULL
    GROUP BY i.issue_date
    ORDER BY i.issue_date
  ) d_row;

  SELECT COALESCE(jsonb_agg(m_row), '[]'::jsonb) INTO v_sales_by_payment
  FROM (
    SELECT
      COALESCE(i.payment_method, 'cash') AS "method",
      ROUND(SUM(i.total_amount), 2) AS "amount"
    FROM public.invoices i
    WHERE i.company_id = vc
      AND i.type = 'sale'
      AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
      AND i.issue_date BETWEEN v_from AND v_to
      AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
      AND i.deleted_at IS NULL
    GROUP BY COALESCE(i.payment_method, 'cash')
    ORDER BY "amount" DESC
  ) m_row;

  RETURN jsonb_build_object(
    'totalSales', ROUND(v_total_sales, 2),
    'totalReturns', ROUND(v_total_returns, 2),
    'netSales', ROUND(v_net_sales, 2),
    'invoiceCount', v_invoice_count,
    'averageInvoiceValue', v_avg_invoice,
    'prevTotalSales', ROUND(v_prev_total_sales, 2),
    'prevTotalReturns', ROUND(v_prev_total_returns, 2),
    'prevNetSales', ROUND(v_prev_net_sales, 2),
    'topProducts', v_top_products,
    'topCustomers', v_top_customers,
    'salesByDay', v_sales_by_day,
    'salesByPaymentMethod', v_sales_by_payment
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_cash_flow(
  p_company_id uuid,
  p_from date,
  p_to date,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(category text, inflow numeric, outflow numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_operating_in  numeric;
  v_operating_out numeric;
  v_financing_in  numeric;
  v_financing_out numeric;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT COALESCE(SUM(
    COALESCE(NULLIF(i.paid_amount, 0), i.total_amount)
  ), 0)
  INTO v_operating_in
  FROM public.invoices i
  WHERE i.company_id = p_company_id
    AND i.type = 'sale'
    AND i.status IN ('paid', 'partially_paid')
    AND i.payment_method = 'cash'
    AND i.issue_date BETWEEN p_from AND p_to
    AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
    AND i.deleted_at IS NULL
    AND (p_branch_id IS NULL OR i.branch_id = p_branch_id);

  SELECT
    COALESCE((
      SELECT SUM(COALESCE(NULLIF(p.paid_amount, 0), p.total_amount))
      FROM public.invoices p
      WHERE p.company_id = p_company_id
        AND p.type = 'purchase'
        AND p.status IN ('paid', 'partially_paid')
        AND p.payment_method = 'cash'
        AND p.issue_date BETWEEN p_from AND p_to
        AND COALESCE(p.invoice_number, '') NOT ILIKE '%-INT'
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

  SELECT COALESCE(SUM(
    public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)
  ), 0)
  INTO v_financing_out
  FROM public.payments p
  WHERE p.company_id = p_company_id
    AND p.type IN ('disbursement', 'payment')
    AND p.status = 'posted'
    AND p.payment_date BETWEEN p_from AND p_to
    AND p.deleted_at IS NULL
    AND (p_branch_id IS NULL OR p.branch_id = p_branch_id);

  category := 'التشغيل';  inflow := ROUND(v_operating_in,  2); outflow := ROUND(v_operating_out, 2); RETURN NEXT;
  category := 'الاستثمار'; inflow := 0;                         outflow := 0;                          RETURN NEXT;
  category := 'التمويل';   inflow := ROUND(v_financing_in,  2); outflow := ROUND(v_financing_out, 2); RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_cash_flow(
  p_company_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE(category text, inflow numeric, outflow numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT * FROM public.report_cash_flow(p_company_id, p_from, p_to, NULL::uuid);
$function$;

CREATE OR REPLACE FUNCTION public.report_debt_aging(p_company_id uuid)
RETURNS TABLE(customer_name text, total numeric, days_0_30 numeric, days_31_60 numeric, days_61_90 numeric, days_90_plus numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  RETURN QUERY
  WITH gross_aging AS (
    SELECT
      i.party_id,
      COALESCE(pr.name, 'عميل نقدي') AS c_name,
      COALESCE(SUM(GREATEST(0, i.total_amount - COALESCE(i.paid_amount, 0)))
        FILTER (WHERE COALESCE(i.due_date, i.issue_date) >= CURRENT_DATE - INTERVAL '30 days'), 0) AS b0_30,
      COALESCE(SUM(GREATEST(0, i.total_amount - COALESCE(i.paid_amount, 0)))
        FILTER (WHERE COALESCE(i.due_date, i.issue_date) BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '31 days'), 0) AS b31_60,
      COALESCE(SUM(GREATEST(0, i.total_amount - COALESCE(i.paid_amount, 0)))
        FILTER (WHERE COALESCE(i.due_date, i.issue_date) BETWEEN CURRENT_DATE - INTERVAL '90 days' AND CURRENT_DATE - INTERVAL '61 days'), 0) AS b61_90,
      COALESCE(SUM(GREATEST(0, i.total_amount - COALESCE(i.paid_amount, 0)))
        FILTER (WHERE COALESCE(i.due_date, i.issue_date) < CURRENT_DATE - INTERVAL '90 days'), 0) AS b90_plus
    FROM public.invoices i
    LEFT JOIN public.parties pr ON pr.id = i.party_id AND pr.deleted_at IS NULL
    WHERE i.company_id = p_company_id
      AND i.type = 'sale'
      AND COALESCE(i.payment_method, 'credit') <> 'cash'
      AND i.status IN ('posted', 'confirmed', 'partially_paid')
      AND i.deleted_at IS NULL
      AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
      AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0.01
    GROUP BY i.party_id, COALESCE(pr.name, 'عميل نقدي')
  ),
  return_credits AS (
    SELECT
      i.party_id,
      COALESCE(SUM(GREATEST(0, i.total_amount - COALESCE(i.paid_amount, 0))), 0) AS credit_amt
    FROM public.invoices i
    WHERE i.company_id = p_company_id
      AND i.type IN ('sale_return', 'return_sale')
      AND COALESCE(i.payment_method, 'credit') <> 'cash'
      AND i.status IN ('posted', 'confirmed', 'partially_paid')
      AND i.deleted_at IS NULL
      AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
      AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0.01
    GROUP BY i.party_id
  ),
  alloc_by_payment AS (
    SELECT pa.payment_id, COALESCE(SUM(pa.amount), 0) AS alloc_amt
    FROM public.payment_allocations pa
    WHERE pa.company_id = p_company_id
      AND pa.deleted_at IS NULL
    GROUP BY pa.payment_id
  ),
  bond_credits AS (
    SELECT
      p.party_id,
      COALESCE(SUM(
        GREATEST(
          0,
          public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate) - COALESCE(a.alloc_amt, 0)
        )
      ), 0) AS credit_amt
    FROM public.payments p
    JOIN public.parties pt ON pt.id = p.party_id AND pt.deleted_at IS NULL AND pt.type IN ('customer', 'both')
    LEFT JOIN alloc_by_payment a ON a.payment_id = p.id
    WHERE p.company_id = p_company_id
      AND p.type = 'receipt'
      AND p.status = 'posted'
      AND p.deleted_at IS NULL
      AND (public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate) - COALESCE(a.alloc_amt, 0)) > 0.01
    GROUP BY p.party_id
  ),
  net_calc AS (
    SELECT
      g.c_name,
      g.b0_30,
      g.b31_60,
      g.b61_90,
      g.b90_plus,
      COALESCE(rc.credit_amt, 0) + COALESCE(bc.credit_amt, 0) AS total_credits
    FROM gross_aging g
    LEFT JOIN return_credits rc ON rc.party_id = g.party_id
    LEFT JOIN bond_credits bc ON bc.party_id = g.party_id
  ),
  applied AS (
    SELECT
      c_name,
      GREATEST(0, b90_plus - total_credits) AS net_90_plus,
      GREATEST(0, b61_90 - GREATEST(0, total_credits - b90_plus)) AS net_61_90,
      GREATEST(0, b31_60 - GREATEST(0, total_credits - b90_plus - b61_90)) AS net_31_60,
      GREATEST(0, b0_30  - GREATEST(0, total_credits - b90_plus - b61_90 - b31_60)) AS net_0_30
    FROM net_calc
  )
  SELECT
    a.c_name AS customer_name,
    ROUND(a.net_0_30 + a.net_31_60 + a.net_61_90 + a.net_90_plus, 2) AS total,
    ROUND(a.net_0_30, 2) AS days_0_30,
    ROUND(a.net_31_60, 2) AS days_31_60,
    ROUND(a.net_61_90, 2) AS days_61_90,
    ROUND(a.net_90_plus, 2) AS days_90_plus
  FROM applied a
  WHERE (a.net_0_30 + a.net_31_60 + a.net_61_90 + a.net_90_plus) > 0.01
  ORDER BY total DESC, customer_name ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_debt_priority_queue(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_collector_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 100,
  p_bucket text DEFAULT NULL::text
)
RETURNS TABLE(task_id text, task_type character varying, party_id uuid, party_name text, party_phone text, currency_code text, amount numeric, reference_info text, urgency character varying, priority character varying, due_at timestamp with time zone, is_overdue boolean, assigned_to uuid, assigned_name text, escalation_stage character varying, amount_base numeric, days_late integer, days_since_contact integer, priority_score numeric, next_action text, score_drivers text[])
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_base           text;
    v_critical_days  integer;
    v_target_limit   integer;
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    IF p_bucket IS NOT NULL
       AND p_bucket <> ''
       AND p_bucket NOT IN ('all', 'overdue', 'today', 'week', 'promises', 'critical', 'nocontact') THEN
        RAISE EXCEPTION 'INVALID_BUCKET: %', p_bucket USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(c.base_currency, 'SAR')
      INTO v_base
      FROM public.companies c
     WHERE c.id = p_company_id;

    v_base := COALESCE(NULLIF(TRIM(v_base), ''), 'SAR');

    SELECT COALESCE(cfg.critical_days, 30)
      INTO v_critical_days
      FROM public.debt_followup_config cfg
     WHERE cfg.company_id = p_company_id
     LIMIT 1;
    v_critical_days := COALESCE(v_critical_days, 30);

    v_target_limit := GREATEST(COALESCE(p_limit, 100), 1);

    RETURN QUERY
    WITH q AS (
        SELECT t.*
          FROM public.get_debt_task_queue(
                   p_company_id, p_branch_id, p_collector_id, 7,
                   v_target_limit * 3) t
    ),
    target_parties AS (
        SELECT DISTINCT q.party_id FROM q WHERE q.party_id IS NOT NULL
    ),
    party_currency_base AS (
        SELECT i.party_id,
               i.currency_code,
               SUM(GREATEST(0, i.total_amount - COALESCE(i.paid_amount, 0))) AS base_open
          FROM public.invoices i
          JOIN target_parties tp ON tp.party_id = i.party_id
         WHERE i.company_id = p_company_id
           AND i.type = 'sale'
           AND i.status IN ('posted', 'confirmed', 'partially_paid')
           AND (i.payment_method IS NULL OR i.payment_method <> 'cash')
           AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
           AND i.deleted_at IS NULL
           AND i.due_date < CURRENT_DATE
           AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0
         GROUP BY 1, 2
    ),
    last_contact AS (
        SELECT x.party_id, MAX(x.last_at) AS last_at
          FROM (
                SELECT dm.party_id,
                       MAX(COALESCE(dm.sent_at, dm.created_at)) AS last_at
                  FROM public.debt_message_log dm
                  JOIN target_parties tp ON tp.party_id = dm.party_id
                 WHERE dm.company_id = p_company_id
                   AND dm.status = 'sent'
                 GROUP BY 1
                UNION ALL
                SELECT ca.customer_id AS party_id,
                       MAX(COALESCE(ca.completed_at, ca.updated_at)) AS last_at
                  FROM public.customer_activities ca
                  JOIN target_parties tp ON tp.party_id = ca.customer_id
                 WHERE ca.company_id = p_company_id
                   AND ca.status = 'completed'
                 GROUP BY 1
               ) x
         GROUP BY 1
    ),
    scored AS (
        SELECT t.task_id, t.task_type, t.party_id, t.party_name, t.party_phone,
               t.currency_code, t.amount, t.reference_info, t.urgency, t.priority,
               t.due_at, t.is_overdue, t.assigned_to, t.assigned_name, t.escalation_stage,
               COALESCE(pcb.base_open,
                        public.fn_to_base_amount(t.currency_code, t.amount, 1, v_base),
                        0) AS amount_base,
               GREATEST(CURRENT_DATE - (t.due_at)::date, 0) AS days_late,
               (CURRENT_DATE - (lc.last_at)::date) AS days_since_contact,
               CASE
                     WHEN t.task_type <> 'due_today' THEN t.task_type
                     WHEN (t.due_at)::date < CURRENT_DATE
                       THEN 'overdue'::character varying
                     WHEN (t.due_at)::date > CURRENT_DATE
                       THEN 'upcoming'::character varying
                     ELSE 'due_today'::character varying
                   END AS task_type_norm
          FROM q t
          LEFT JOIN party_currency_base pcb
                 ON pcb.party_id = t.party_id
                AND pcb.currency_code = t.currency_code
          LEFT JOIN last_contact lc
                 ON lc.party_id = t.party_id
    ),
    totals AS (
        SELECT SUM(s.amount_base) AS total_base FROM scored s
    ),
    final AS (
        SELECT s.*,
               ROUND(LEAST(100::numeric,
                     40 * LEAST(s.days_late / 90.0, 1)
                   + 25 * LEAST(s.amount_base / NULLIF(t.total_base, 0), 1)
                   + CASE WHEN s.task_type = 'broken_promise' THEN 20 ELSE 0 END
                   + CASE WHEN s.days_since_contact IS NULL
                           OR s.days_since_contact >= 7 THEN 10 ELSE 0 END
                   + CASE WHEN s.escalation_stage IN ('visit', 'legal') THEN 5 ELSE 0 END
               ), 2) AS priority_score
          FROM scored s
          CROSS JOIN totals t
    ),
    labelled AS (
        SELECT f.*,
               CASE
                   WHEN f.task_type_norm = 'broken_promise' THEN 'وعد مكسور: اتصل الآن وأعد جدولة الوعد'
                   WHEN f.task_type_norm = 'promise_due'    THEN 'وعد مستحق: أكّد التحصيل اليوم'
                   WHEN f.task_type_norm = 'critical_debt'  THEN 'دين حرج: ابدأ إجراء التصعيد'
                   WHEN f.task_type_norm = 'overdue' THEN
                       CASE WHEN f.days_late <= 7  THEN 'تأخر بسيط: تذكير ودّي وتأكيد موعد السداد'
                            WHEN f.days_late <= 30 THEN 'تأخر متوسط: اتصال مباشر ومطالبة بسداد جزئي'
                            WHEN f.days_late <= 60 THEN 'تأخر مطوّل: إشعار نهائي مكتوب قبل التصعيد'
                            ELSE 'تأخر حرج: رفع للمرحلة التالية (زيارة/إجراء قانوني)'
                       END
                   WHEN f.task_type_norm = 'due_today'      THEN 'فاتورة تحلّ اليوم: تذكير ودّي ومطالبة'
                   WHEN f.task_type_norm = 'upcoming' THEN
                       'تستحق ' || CASE ((f.due_at)::date - CURRENT_DATE)
                           WHEN 1 THEN 'غداً'
                           WHEN 2 THEN 'بعد يومين'
                           WHEN 3 THEN 'بعد 3 أيام'
                           WHEN 4 THEN 'بعد 4 أيام'
                           WHEN 5 THEN 'بعد 5 أيام'
                           WHEN 6 THEN 'بعد 6 أيام'
                           WHEN 7 THEN 'بعد أسبوع'
                           WHEN 8 THEN 'بعد 8 أيام'
                           WHEN 9 THEN 'بعد 9 أيام'
                           WHEN 10 THEN 'بعد 10 أيام'
                           ELSE 'بعد ' || ((f.due_at)::date - CURRENT_DATE)::text || ' يوماً'
                       END || ': تذكير مسبق لتأمين السداد'
                   WHEN f.task_type_norm = 'follow_up'      THEN 'متابعة مجدولة: نفّذ الإجراء'
                   WHEN f.task_type_norm = 'failed_message' THEN 'رسالة فاشلة: أعِد الإرسال'
                   ELSE 'متابعة تحصيل'
               END AS next_action
          FROM final f
    )
    SELECT l.task_id, l.task_type_norm AS task_type,
           l.party_id, l.party_name, l.party_phone,
           l.currency_code, l.amount, l.reference_info, l.urgency, l.priority,
           l.due_at, l.is_overdue, l.assigned_to, l.assigned_name, l.escalation_stage,
           l.amount_base, l.days_late, l.days_since_contact, l.priority_score,
           l.next_action,
           ARRAY_REMOVE(ARRAY[
               CASE WHEN l.days_late > 0
                    THEN 'متأخر ' || l.days_late::text || ' يوماً' END,
               CASE WHEN l.task_type_norm = 'broken_promise' THEN 'وعد مكسور' END,
               CASE WHEN l.days_since_contact IS NULL THEN 'لا يوجد سجل تواصل'
                    WHEN l.days_since_contact >= 7
                    THEN 'لا تواصل منذ ' || l.days_since_contact::text || ' أيام' END,
               CASE WHEN l.escalation_stage IN ('visit', 'legal')
                    THEN 'مرحلة تصعيد: ' || l.escalation_stage::text END
           ], NULL) AS score_drivers
      FROM labelled l
     WHERE p_bucket IS NULL
        OR p_bucket = ''
        OR p_bucket = 'all'
        OR (p_bucket = 'overdue' AND l.is_overdue)
        OR (p_bucket = 'today' AND (l.due_at)::date = CURRENT_DATE)
        OR (p_bucket = 'week' AND (l.due_at)::date <= CURRENT_DATE + 7)
        OR (p_bucket = 'promises'
            AND l.task_type_norm IN ('promise_due', 'broken_promise'))
        OR (p_bucket = 'critical'
            AND (l.days_late >= v_critical_days
                 OR l.escalation_stage IN ('visit', 'legal')))
        OR (p_bucket = 'nocontact'
            AND (l.days_since_contact IS NULL OR l.days_since_contact >= 7))
     ORDER BY l.priority_score DESC,
              l.days_late DESC,
              l.amount_base DESC,
              l.party_name
     LIMIT v_target_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_party_stats_on_invoice_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_party_id uuid;
  v_sales_paid numeric := 0;
  v_sales_returns numeric := 0;
  v_purchases_total numeric := 0;
  v_purchases_returns numeric := 0;
  v_inv_count integer;
  v_ord_count integer;
  v_last_inv timestamptz;
  v_last_pur timestamptz;
  v_paid numeric(15,2);
  v_purch numeric(15,2);
BEGIN
  v_party_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.party_id ELSE NEW.party_id END;
  IF v_party_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  PERFORM 1 FROM public.parties WHERE id = v_party_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT
    COALESCE(SUM(COALESCE(paid_amount, 0)) FILTER (WHERE type = 'sale'), 0),
    COALESCE(SUM(COALESCE(total_amount, 0)) FILTER (WHERE type IN ('sale_return', 'return_sale')), 0),
    COALESCE(SUM(COALESCE(total_amount, 0)) FILTER (WHERE type = 'purchase'), 0),
    COALESCE(SUM(COALESCE(total_amount, 0)) FILTER (WHERE type IN ('purchase_return', 'return_purchase')), 0),
    COUNT(*) FILTER (WHERE type = 'sale'),
    (MAX(issue_date) FILTER (WHERE type = 'sale'))::timestamptz,
    COUNT(*) FILTER (WHERE type = 'purchase'),
    (MAX(issue_date) FILTER (WHERE type = 'purchase'))::timestamptz
  INTO v_sales_paid, v_sales_returns, v_purchases_total, v_purchases_returns,
       v_inv_count, v_last_inv, v_ord_count, v_last_pur
  FROM public.invoices
  WHERE party_id = v_party_id
    AND type IN ('sale', 'sale_return', 'return_sale', 'purchase', 'purchase_return', 'return_purchase')
    AND status NOT IN ('cancelled', 'void', 'draft')
    AND COALESCE(invoice_number, '') NOT ILIKE '%-INT'
    AND deleted_at IS NULL;

  v_paid  := ROUND(GREATEST(0, ROUND(v_sales_paid  - v_sales_returns,  4)), 2);
  v_purch := ROUND(GREATEST(0, ROUND(v_purchases_total - v_purchases_returns, 4)), 2);

  UPDATE public.parties SET
    total_invoices_count   = v_inv_count,
    total_paid_amount      = v_paid,
    last_invoice_date      = v_last_inv,
    total_orders_count     = v_ord_count,
    total_purchases_amount = v_purch,
    last_purchase_date     = v_last_pur,
    updated_at             = now()
  WHERE id = v_party_id
    AND (total_invoices_count, total_paid_amount, last_invoice_date,
         total_orders_count, total_purchases_amount, last_purchase_date)
        IS DISTINCT FROM
        (v_inv_count, v_paid, v_last_inv, v_ord_count, v_purch, v_last_pur);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_journal_from_invoice(p_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company_id uuid;
  v_je_id      uuid;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.invoices
  WHERE id = p_invoice_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'فاتورة غير موجودة: %', p_invoice_id;
  END IF;

  PERFORM public.fn_assert_company_access(v_company_id);

  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE reference_id = p_invoice_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'يوجد قيد محاسبي مرتبط بهذه الفاتورة مسبقاً';
  END IF;

  PERFORM set_config('app.rpc_authorized', 'true', true);
  v_je_id := public.fn_auto_post_invoice_journal(p_invoice_id);
  RETURN v_je_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.auto_journal_from_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_journal_from_invoice(uuid) TO authenticated, service_role;
