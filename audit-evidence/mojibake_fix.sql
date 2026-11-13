CREATE OR REPLACE FUNCTION public.report_cash_flow(p_company_id uuid, p_from date, p_to date)
 RETURNS TABLE(category text, inflow numeric, outflow numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_operating_in numeric;
  v_operating_out numeric;
  v_investing_in numeric;
  v_investing_out numeric;
  v_financing_in numeric;
  v_financing_out numeric;
BEGIN
      PERFORM public.verify_company_access(p_company_id);
-- Operating inflow (sales cash receipts)
  SELECT COALESCE(SUM(i.total_amount), 0) INTO v_operating_in
  FROM public.invoices i
  WHERE i.company_id = p_company_id
    AND i.type = 'sale'
    AND i.status IN ('paid', 'partially_paid')
    AND i.payment_method = 'cash'
    AND i.issue_date BETWEEN p_from AND p_to
    AND i.deleted_at IS NULL;

  -- Operating outflow (expenses paid)
  SELECT COALESCE(SUM(e.amount), 0) INTO v_operating_out
  FROM public.expenses e
  WHERE e.company_id = p_company_id
    AND e.status = 'posted'
    AND e.payment_method IN ('cash', 'bank')
    AND e.expense_date BETWEEN p_from AND p_to
    AND e.deleted_at IS NULL;

  -- Receipt bonds
  SELECT COALESCE(SUM(p.amount), 0) INTO v_financing_in
  FROM public.payments p
  WHERE p.company_id = p_company_id
    AND p.type = 'receipt'
    AND p.status = 'posted'
    AND p.payment_date BETWEEN p_from AND p_to
    AND p.deleted_at IS NULL;

  -- Payment bonds
  SELECT COALESCE(SUM(p.amount), 0) INTO v_financing_out
  FROM public.payments p
  WHERE p.company_id = p_company_id
    AND p.type = 'disbursement'
    AND p.status = 'posted'
    AND p.payment_date BETWEEN p_from AND p_to
    AND p.deleted_at IS NULL;

  category := 'التشغيل'; inflow := v_operating_in; outflow := v_operating_out; RETURN NEXT;
  category := 'الاستثمار'; inflow := 0; outflow := 0; RETURN NEXT;
  category := 'التمويل'; inflow := v_financing_in; outflow := v_financing_out; RETURN NEXT;
END;
$function$

CREATE OR REPLACE FUNCTION public.get_top_products_and_customers(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 10,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_sort_by text DEFAULT 'quantity'::text
)
RETURNS TABLE(top_products jsonb, top_customers jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_top_products  jsonb := '[]'::jsonb;
  v_top_customers jsonb := '[]'::jsonb;
  v_date_from     date := p_date_from;
  v_date_to       date := COALESCE(p_date_to, CURRENT_DATE);
  v_is_default_window boolean := (p_date_from IS NULL);
  v_base_currency text := 'SAR';
  v_yer_rate      numeric := 410.0;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT COALESCE(base_currency, 'SAR') INTO v_base_currency
  FROM public.companies
  WHERE id = p_company_id;

  IF v_date_from IS NULL THEN
    v_date_from := (CURRENT_DATE - INTERVAL '30 days')::date;
  END IF;

  -- 1. Top Products: Net sales (Sales - Returns) within the date window
  WITH item_base_calc AS (
    SELECT
      ii.product_id,
      i.type AS inv_type,
      ii.quantity,
      ii.total,
      COALESCE(i.currency_code, v_base_currency) AS curr_code,
      i.exchange_rate,
      COALESCE(NULLIF(ii.cost_price, 0), 0) AS direct_cost
    FROM public.invoices i
    JOIN public.invoice_items ii
      ON ii.invoice_id = i.id
     AND ii.company_id = p_company_id
    WHERE i.company_id = p_company_id
      AND i.type IN ('sale', 'sale_return', 'return_sale')
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.deleted_at IS NULL
      AND i.issue_date BETWEEN v_date_from AND v_date_to
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
  ),
  product_sales AS (
    SELECT
      ibc.product_id,
      SUM(CASE WHEN ibc.inv_type = 'sale' THEN ibc.quantity WHEN ibc.inv_type IN ('sale_return', 'return_sale') THEN -ibc.quantity ELSE 0 END) AS net_quantity,
      SUM(CASE WHEN ibc.inv_type = 'sale' THEN public.fn_to_base_amount(ibc.curr_code, ibc.total, ibc.exchange_rate)
               WHEN ibc.inv_type IN ('sale_return', 'return_sale') THEN -public.fn_to_base_amount(ibc.curr_code, ibc.total, ibc.exchange_rate)
               ELSE 0 END) AS net_revenue_base,
      SUM(CASE WHEN ibc.inv_type = 'sale' THEN (CASE WHEN UPPER(ibc.curr_code) = 'YER' THEN ibc.total ELSE ibc.total * COALESCE(ibc.exchange_rate, v_yer_rate) END)
               WHEN ibc.inv_type IN ('sale_return', 'return_sale') THEN -(CASE WHEN UPPER(ibc.curr_code) = 'YER' THEN ibc.total ELSE ibc.total * COALESCE(ibc.exchange_rate, v_yer_rate) END)
               ELSE 0 END) AS net_revenue_yer,
      SUM(CASE WHEN ibc.inv_type = 'sale' THEN ibc.quantity * (CASE WHEN ibc.direct_cost > 0 THEN ibc.direct_cost ELSE (public.fn_to_base_amount(ibc.curr_code, ibc.total, ibc.exchange_rate) / GREATEST(ibc.quantity, 1)) * 0.70 END)
               WHEN ibc.inv_type IN ('sale_return', 'return_sale') THEN -ibc.quantity * (CASE WHEN ibc.direct_cost > 0 THEN ibc.direct_cost ELSE (public.fn_to_base_amount(ibc.curr_code, ibc.total, ibc.exchange_rate) / GREATEST(ibc.quantity, 1)) * 0.70 END)
               ELSE 0 END) AS net_cost_base
    FROM item_base_calc ibc
    GROUP BY ibc.product_id
    HAVING SUM(CASE WHEN ibc.inv_type = 'sale' THEN ibc.quantity WHEN ibc.inv_type IN ('sale_return', 'return_sale') THEN -ibc.quantity ELSE 0 END) > 0
  ),
  top_p_ids AS (
    SELECT
      ps.product_id,
      ps.net_quantity,
      ps.net_revenue_base,
      ps.net_revenue_yer,
      ps.net_cost_base
    FROM product_sales ps
    ORDER BY
      CASE WHEN p_sort_by = 'revenue' THEN ps.net_revenue_base END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'profit' THEN (ps.net_revenue_base - ps.net_cost_base) END DESC NULLS LAST,
      ps.net_quantity DESC,
      ps.net_revenue_base DESC
    LIMIT p_limit
  ),
  ranked_products AS (
    SELECT
      tp.product_id,
      tp.net_quantity,
      ROUND(tp.net_revenue_base, 2) AS net_revenue_base,
      ROUND(tp.net_cost_base, 2) AS net_cost_base,
      ROUND(tp.net_revenue_base - tp.net_cost_base, 2) AS gross_profit_base,
      ROUND(
        CASE 
          WHEN tp.net_revenue_base > 0 
          THEN ((tp.net_revenue_base - tp.net_cost_base) / tp.net_revenue_base) * 100 
          ELSE 0 
        END, 
        1
      ) AS margin_percentage,
      ROUND(tp.net_revenue_yer, 2) AS net_revenue_yer,
      ROUND(tp.net_cost_base * v_yer_rate, 2) AS net_cost_yer,
      ROUND((tp.net_revenue_base - tp.net_cost_base) * v_yer_rate, 2) AS gross_profit_yer,
      p.name_ar,
      p.part_number,
      p.brand,
      p.sku,
      p.sale_price,
      p.image_url,
      p.min_stock_level,
      cat.name AS category_name,
      COALESCE(stk.current_stock, 0) AS current_stock
    FROM top_p_ids tp
    JOIN public.products p ON p.id = tp.product_id
    LEFT JOIN public.product_categories cat ON cat.id = p.category_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(quantity), 0) AS current_stock
      FROM public.product_stock s
      WHERE s.product_id = tp.product_id
        AND s.company_id = p_company_id
    ) stk ON true
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                rp.product_id,
      'name',              rp.name_ar,
      'part_number',       rp.part_number,
      'brand',             rp.brand,
      'sku',               rp.sku,
      'category_name',     rp.category_name,
      'total_quantity',    rp.net_quantity,
      'quantity',          rp.net_quantity,
      'total_revenue',     rp.net_revenue_base,
      'revenue',           rp.net_revenue_base,
      'total_cost',        rp.net_cost_base,
      'cost',              rp.net_cost_base,
      'gross_profit',      rp.gross_profit_base,
      'margin_percentage', rp.margin_percentage,
      'total_revenue_yer', rp.net_revenue_yer,
      'revenue_yer',       rp.net_revenue_yer,
      'total_cost_yer',    rp.net_cost_yer,
      'cost_yer',          rp.net_cost_yer,
      'gross_profit_yer',  rp.gross_profit_yer,
      'price',             rp.sale_price,
      'image_url',         rp.image_url,
      'current_stock',     rp.current_stock,
      'min_stock_level',   rp.min_stock_level,
      'is_low_stock',      (rp.current_stock <= rp.min_stock_level AND rp.current_stock > 0),
      'is_out_of_stock',   (rp.current_stock <= 0)
    )
  ), '[]'::jsonb) INTO v_top_products
  FROM ranked_products rp;

  -- 2. Top Customers (Net sales minus returns)
  WITH customer_sales AS (
    SELECT
      i.party_id,
      SUM(
        CASE 
          WHEN i.type = 'sale' THEN public.fn_to_base_amount(COALESCE(i.currency_code, v_base_currency), i.total_amount, i.exchange_rate)
          WHEN i.type IN ('sale_return', 'return_sale') THEN -public.fn_to_base_amount(COALESCE(i.currency_code, v_base_currency), i.total_amount, i.exchange_rate)
          ELSE 0 
        END
      ) AS net_revenue,
      COUNT(DISTINCT i.id) AS invoice_count
    FROM public.invoices i
    WHERE i.company_id = p_company_id
      AND i.type IN ('sale', 'sale_return', 'return_sale')
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.party_id IS NOT NULL
      AND i.deleted_at IS NULL
      AND i.issue_date BETWEEN v_date_from AND v_date_to
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    GROUP BY i.party_id
    HAVING SUM(CASE WHEN i.type = 'sale' THEN 1 ELSE -1 END) > 0
  ),
  top_cust AS (
    SELECT * FROM customer_sales
    ORDER BY net_revenue DESC
    LIMIT p_limit
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',            tc.party_id,
      'name',          COALESCE(p.name, 'عميل غير محدد'),
      'total_revenue', ROUND(tc.net_revenue, 2),
      'total',         ROUND(tc.net_revenue, 2),
      'invoice_count', tc.invoice_count,
      'invoices',      tc.invoice_count
    )
  ), '[]'::jsonb) INTO v_top_customers
  FROM top_cust tc
  JOIN public.parties p ON p.id = tc.party_id;

  RETURN QUERY SELECT v_top_products, v_top_customers;
END;
$function$

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    vc uuid;
    v_auth_branches uuid[];
    v_target_branch uuid;
    v_opening_cust_debts NUMERIC := 0;
    v_opening_supp_debts NUMERIC := 0;
    v_res jsonb;
BEGIN
    vc := public.verify_company_access(p_company_id);

    SELECT array_agg(b) INTO v_auth_branches
    FROM public.get_auth_branches(vc) b;

    IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
        IF public.is_super_admin() OR current_user IN ('postgres', 'supabase_admin') THEN
            SELECT array_agg(id) INTO v_auth_branches FROM public.branches WHERE company_id = vc;
        END IF;
    END IF;

    IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
        RETURN jsonb_build_object(
            'total_sales', 0, 'total_purchases', 0, 'total_expenses', 0,
            'receipt_bonds', 0, 'payment_bonds', 0, 'total_debts', 0,
            'total_supplier_debts', 0, 'invoice_count', 0
        );
    END IF;

    IF p_branch_id IS NOT NULL THEN
        IF NOT (p_branch_id = ANY(v_auth_branches)) AND NOT public.is_super_admin() AND current_user NOT IN ('postgres', 'supabase_admin') THEN
            RAISE EXCEPTION 'غير مصرح بالوصول إلى بيانات هذا الفرع' USING ERRCODE = '42501';
        END IF;
        v_target_branch := p_branch_id;
    END IF;

    -- 1. Opening balances (customers & suppliers)
    WITH latest_rates AS (
      SELECT DISTINCT ON (currency_code) currency_code, rate_to_base
      FROM public.exchange_rates
      WHERE company_id = vc
      ORDER BY currency_code, effective_date DESC, created_at DESC
    )
    SELECT
      COALESCE(SUM(CASE WHEN p.type = 'customer' THEN
        public.fn_to_base_amount(ob.currency_code, ob.amount, lr.rate_to_base) * CASE WHEN ob.direction = 'debit' THEN 1 ELSE -1 END
      ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN p.type = 'supplier' THEN
        public.fn_to_base_amount(ob.currency_code, ob.amount, lr.rate_to_base) * CASE WHEN ob.direction = 'credit' THEN 1 ELSE -1 END
      ELSE 0 END), 0)
    INTO v_opening_cust_debts, v_opening_supp_debts
    FROM public.party_opening_balances ob
    JOIN public.parties p ON p.id = ob.party_id AND p.deleted_at IS NULL AND p.type IN ('customer', 'supplier')
    LEFT JOIN latest_rates lr ON lr.currency_code = (ob.currency_code)::text
    WHERE ob.company_id = vc
      AND (
        (v_target_branch IS NOT NULL AND (ob.branch_id = v_target_branch OR p.branch_id = v_target_branch))
        OR (v_target_branch IS NULL AND (ob.branch_id = ANY(v_auth_branches) OR ob.branch_id IS NULL))
      );

    -- 2. Invoices, Payments (period & unallocated cumulative), Expenses
    WITH inv_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'sale' AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          WHEN i.type IN ('sale_return', 'return_sale') AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            -1 * public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          ELSE 0
        END), 2), 0) AS total_sales,

        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'purchase' AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          WHEN i.type IN ('purchase_return', 'return_purchase') AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            -1 * public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          ELSE 0
        END), 2), 0) AS total_purchases,

        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'sale' AND i.status IN ('posted','confirmed','partially_paid')
               AND COALESCE(i.payment_method, 'credit') <> 'cash'
               AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0 THEN
            public.fn_to_base_amount(i.currency_code, i.total_amount - COALESCE(i.paid_amount, 0), i.exchange_rate)
          WHEN i.type IN ('sale_return', 'return_sale') AND i.status IN ('posted','confirmed','partially_paid')
               AND COALESCE(i.payment_method, 'credit') <> 'cash' THEN
            -1 * public.fn_to_base_amount(i.currency_code, GREATEST(0, i.total_amount - COALESCE(i.paid_amount, 0)), i.exchange_rate)
          ELSE 0
        END), 2), 0) AS total_debts,

        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'purchase' AND i.status IN ('posted','confirmed','partially_paid')
               AND COALESCE(i.payment_method, 'credit') <> 'cash'
               AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0 THEN
            public.fn_to_base_amount(i.currency_code, i.total_amount - COALESCE(i.paid_amount, 0), i.exchange_rate)
          WHEN i.type IN ('purchase_return', 'return_purchase') AND i.status IN ('posted','confirmed','partially_paid')
               AND COALESCE(i.payment_method, 'credit') <> 'cash' THEN
            -1 * public.fn_to_base_amount(i.currency_code, GREATEST(0, i.total_amount - COALESCE(i.paid_amount, 0)), i.exchange_rate)
          ELSE 0
        END), 2), 0) AS total_supplier_debts,

        COUNT(*) FILTER (
          WHERE i.type = 'sale' AND i.status NOT IN ('draft', 'void')
            AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
            AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
        ) AS invoice_count
      FROM public.invoices i
      WHERE i.company_id = vc
        AND i.deleted_at IS NULL
        AND (
          (v_target_branch IS NOT NULL AND i.branch_id = v_target_branch)
          OR (v_target_branch IS NULL AND (i.branch_id = ANY(v_auth_branches) OR i.branch_id IS NULL))
        )
    ),
    alloc_summary AS (
      SELECT pa.payment_id, SUM(pa.amount) AS allocated_amount
      FROM public.payment_allocations pa
      WHERE pa.company_id = vc
      GROUP BY pa.payment_id
    ),
    pay_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE
          WHEN p.type = 'receipt'
               AND (p_date_from IS NULL OR p.payment_date >= p_date_from)
               AND (p_date_to IS NULL OR p.payment_date <= p_date_to) THEN
            public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)
          ELSE 0
        END), 2), 0) AS receipt_bonds,
        COALESCE(ROUND(SUM(CASE
          WHEN p.type IN ('disbursement', 'payment')
               AND (p_date_from IS NULL OR p.payment_date >= p_date_from)
               AND (p_date_to IS NULL OR p.payment_date <= p_date_to) THEN
            public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)
          ELSE 0
        END), 2), 0) AS payment_bonds,
        COALESCE(ROUND(SUM(CASE
          WHEN p.type = 'receipt' AND pt.type IN ('customer', 'both') THEN
            public.fn_to_base_amount(p.currency_code, GREATEST(0, p.amount - COALESCE(a.allocated_amount, 0)), p.exchange_rate)
          ELSE 0
        END), 2), 0) AS unalloc_cust_receipts,
        COALESCE(ROUND(SUM(CASE
          WHEN p.type IN ('disbursement', 'payment') AND pt.type IN ('supplier', 'both') THEN
            public.fn_to_base_amount(p.currency_code, GREATEST(0, p.amount - COALESCE(a.allocated_amount, 0)), p.exchange_rate)
          ELSE 0
        END), 2), 0) AS unalloc_supp_payments
      FROM public.payments p
      LEFT JOIN public.parties pt ON pt.id = p.party_id AND pt.deleted_at IS NULL
      LEFT JOIN alloc_summary a ON a.payment_id = p.id
      WHERE p.company_id = vc AND p.status = 'posted' AND p.deleted_at IS NULL
        AND (
          (v_target_branch IS NOT NULL AND p.branch_id = v_target_branch)
          OR (v_target_branch IS NULL AND (p.branch_id = ANY(v_auth_branches) OR p.branch_id IS NULL))
        )
    ),
    exp_summary AS (
      SELECT
        COALESCE(ROUND(SUM(
          public.fn_to_base_amount(e.currency_code, e.amount, e.exchange_rate)
        ), 2), 0) AS total_expenses
      FROM public.expenses e
      WHERE e.company_id = vc AND e.status IN ('posted','paid') AND e.deleted_at IS NULL
        AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
        AND (p_date_to IS NULL OR e.expense_date <= p_date_to)
        AND (
          (v_target_branch IS NOT NULL AND e.branch_id = v_target_branch)
          OR (v_target_branch IS NULL AND (e.branch_id = ANY(v_auth_branches) OR e.branch_id IS NULL))
        )
    )
    SELECT jsonb_build_object(
      'total_sales', inv.total_sales,
      'total_purchases', inv.total_purchases,
      'total_expenses', exp.total_expenses,
      'receipt_bonds', pay.receipt_bonds,
      'payment_bonds', pay.payment_bonds,
      'total_debts', ROUND(inv.total_debts + v_opening_cust_debts - pay.unalloc_cust_receipts, 2),
      'total_supplier_debts', ROUND(inv.total_supplier_debts + v_opening_supp_debts - pay.unalloc_supp_payments, 2),
      'invoice_count', inv.invoice_count
    ) INTO v_res
    FROM inv_summary inv
    CROSS JOIN pay_summary pay
    CROSS JOIN exp_summary exp;

    RETURN v_res;
END;
$function$

CREATE OR REPLACE FUNCTION public.get_sales_analytics(
  p_company_id uuid,
  p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- 1. Main Period KPI Totals (Normalized to base currency)
  SELECT
    COALESCE(SUM(CASE WHEN i.type = 'sale' THEN
      CASE 
        WHEN i.currency_code = 'SAR' OR i.currency_code IS NULL OR sc.is_base THEN i.total_amount
        WHEN sc.exchange_operator = 'divide' AND i.exchange_rate > 0 THEN ROUND(i.total_amount / i.exchange_rate, 4)
        ELSE ROUND(i.total_amount * COALESCE(i.exchange_rate, 1), 4)
      END
    ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN i.type IN ('return_sale', 'sale_return') THEN
      CASE 
        WHEN i.currency_code = 'SAR' OR i.currency_code IS NULL OR sc.is_base THEN i.total_amount
        WHEN sc.exchange_operator = 'divide' AND i.exchange_rate > 0 THEN ROUND(i.total_amount / i.exchange_rate, 4)
        ELSE ROUND(i.total_amount * COALESCE(i.exchange_rate, 1), 4)
      END
    ELSE 0 END), 0),
    COUNT(CASE WHEN i.type = 'sale' THEN 1 END)
  INTO v_total_sales, v_total_returns, v_invoice_count
  FROM public.invoices i
  LEFT JOIN public.supported_currencies sc ON sc.code = i.currency_code
  WHERE i.company_id = vc
    AND i.type IN ('sale', 'return_sale', 'sale_return')
    AND i.status IN ('posted', 'paid', 'partially_paid')
    AND i.issue_date BETWEEN v_from AND v_to
    AND i.deleted_at IS NULL;

  v_net_sales := v_total_sales - v_total_returns;
  v_avg_invoice := CASE WHEN v_invoice_count > 0 THEN ROUND(v_total_sales / v_invoice_count, 2) ELSE 0 END;

  -- 2. Previous Period KPIs (for growth calculation)
  SELECT
    COALESCE(SUM(CASE WHEN i.type = 'sale' THEN
      CASE 
        WHEN i.currency_code = 'SAR' OR i.currency_code IS NULL OR sc.is_base THEN i.total_amount
        WHEN sc.exchange_operator = 'divide' AND i.exchange_rate > 0 THEN ROUND(i.total_amount / i.exchange_rate, 4)
        ELSE ROUND(i.total_amount * COALESCE(i.exchange_rate, 1), 4)
      END
    ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN i.type IN ('return_sale', 'sale_return') THEN
      CASE 
        WHEN i.currency_code = 'SAR' OR i.currency_code IS NULL OR sc.is_base THEN i.total_amount
        WHEN sc.exchange_operator = 'divide' AND i.exchange_rate > 0 THEN ROUND(i.total_amount / i.exchange_rate, 4)
        ELSE ROUND(i.total_amount * COALESCE(i.exchange_rate, 1), 4)
      END
    ELSE 0 END), 0)
  INTO v_prev_total_sales, v_prev_total_returns
  FROM public.invoices i
  LEFT JOIN public.supported_currencies sc ON sc.code = i.currency_code
  WHERE i.company_id = vc
    AND i.type IN ('sale', 'return_sale', 'sale_return')
    AND i.status IN ('posted', 'paid', 'partially_paid')
    AND i.issue_date BETWEEN v_prev_from AND v_prev_to
    AND i.deleted_at IS NULL;

  v_prev_net_sales := v_prev_total_sales - v_prev_total_returns;

  -- 3. Top Products (Normalized with Spare Parts Details & Net Quantities)
  SELECT COALESCE(jsonb_agg(p_row), '[]'::jsonb) INTO v_top_products
  FROM (
    SELECT 
      ii.product_id AS "productId",
      COALESCE(p.name_ar, 'منتج غير معروف') AS "productName",
      p.part_number AS "partNumber",
      p.brand AS "brand",
      p.sku AS "sku",
      COALESCE(stk.current_stock, 0) AS "currentStock",
      ROUND(SUM(CASE WHEN i.type = 'sale' THEN ii.quantity WHEN i.type IN ('sale_return', 'return_sale') THEN -ii.quantity ELSE 0 END), 2) AS "quantity",
      ROUND(SUM(
        CASE 
          WHEN i.currency_code = 'SAR' OR i.currency_code IS NULL OR sc.is_base THEN
            CASE WHEN i.type = 'sale' THEN ii.total WHEN i.type IN ('sale_return', 'return_sale') THEN -ii.total ELSE 0 END
          WHEN sc.exchange_operator = 'divide' AND i.exchange_rate > 0 THEN
            (CASE WHEN i.type = 'sale' THEN ii.total WHEN i.type IN ('sale_return', 'return_sale') THEN -ii.total ELSE 0 END) / i.exchange_rate
          ELSE
            (CASE WHEN i.type = 'sale' THEN ii.total WHEN i.type IN ('sale_return', 'return_sale') THEN -ii.total ELSE 0 END) * COALESCE(i.exchange_rate, 1)
        END
      ), 2) AS "revenue"
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    LEFT JOIN public.products p ON p.id = ii.product_id
    LEFT JOIN public.supported_currencies sc ON sc.code = i.currency_code
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(quantity), 0) AS current_stock
      FROM public.product_stock s
      WHERE s.product_id = ii.product_id AND s.company_id = vc
    ) stk ON true
    WHERE i.company_id = vc
      AND i.type IN ('sale', 'sale_return', 'return_sale')
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.issue_date BETWEEN v_from AND v_to
      AND i.deleted_at IS NULL
    GROUP BY ii.product_id, p.name_ar, p.part_number, p.brand, p.sku, stk.current_stock
    HAVING SUM(CASE WHEN i.type = 'sale' THEN ii.quantity WHEN i.type IN ('sale_return', 'return_sale') THEN -ii.quantity ELSE 0 END) > 0
    ORDER BY "revenue" DESC
    LIMIT 10
  ) p_row;

  -- 4. Top Customers (Normalized)
  SELECT COALESCE(jsonb_agg(c_row), '[]'::jsonb) INTO v_top_customers
  FROM (
    SELECT 
      i.party_id AS "customerId",
      COALESCE(p.name, 'عميل نقدي') AS "customerName",
      ROUND(SUM(
        CASE 
          WHEN i.currency_code = 'SAR' OR i.currency_code IS NULL OR sc.is_base THEN i.total_amount
          WHEN sc.exchange_operator = 'divide' AND i.exchange_rate > 0 THEN i.total_amount / i.exchange_rate
          ELSE i.total_amount * COALESCE(i.exchange_rate, 1)
        END
      ), 2) AS "totalAmount",
      COUNT(i.id) AS "invoiceCount"
    FROM public.invoices i
    LEFT JOIN public.parties p ON p.id = i.party_id
    LEFT JOIN public.supported_currencies sc ON sc.code = i.currency_code
    WHERE i.company_id = vc
      AND i.type = 'sale'
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.issue_date BETWEEN v_from AND v_to
      AND i.deleted_at IS NULL
    GROUP BY i.party_id, p.name
    ORDER BY "totalAmount" DESC
    LIMIT 10
  ) c_row;

  -- 5. Sales by Day (Normalized)
  SELECT COALESCE(jsonb_agg(d_row), '[]'::jsonb) INTO v_sales_by_day
  FROM (
    SELECT 
      i.issue_date::text AS "date",
      ROUND(SUM(CASE WHEN i.type = 'sale' THEN
        CASE 
          WHEN i.currency_code = 'SAR' OR i.currency_code IS NULL OR sc.is_base THEN i.total_amount
          WHEN sc.exchange_operator = 'divide' AND i.exchange_rate > 0 THEN i.total_amount / i.exchange_rate
          ELSE i.total_amount * COALESCE(i.exchange_rate, 1)
        END
      ELSE 0 END), 2) AS "sales",
      ROUND(SUM(CASE WHEN i.type IN ('return_sale', 'sale_return') THEN
        CASE 
          WHEN i.currency_code = 'SAR' OR i.currency_code IS NULL OR sc.is_base THEN i.total_amount
          WHEN sc.exchange_operator = 'divide' AND i.exchange_rate > 0 THEN i.total_amount / i.exchange_rate
          ELSE i.total_amount * COALESCE(i.exchange_rate, 1)
        END
      ELSE 0 END), 2) AS "returns"
    FROM public.invoices i
    LEFT JOIN public.supported_currencies sc ON sc.code = i.currency_code
    WHERE i.company_id = vc
      AND i.type IN ('sale', 'return_sale', 'sale_return')
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.issue_date BETWEEN v_from AND v_to
      AND i.deleted_at IS NULL
    GROUP BY i.issue_date
    ORDER BY i.issue_date
  ) d_row;

  -- 6. Sales by Payment Method (Normalized)
  SELECT COALESCE(jsonb_agg(m_row), '[]'::jsonb) INTO v_sales_by_payment
  FROM (
    SELECT 
      COALESCE(i.payment_method, 'cash') AS "method",
      ROUND(SUM(
        CASE 
          WHEN i.currency_code = 'SAR' OR i.currency_code IS NULL OR sc.is_base THEN i.total_amount
          WHEN sc.exchange_operator = 'divide' AND i.exchange_rate > 0 THEN i.total_amount / i.exchange_rate
          ELSE i.total_amount * COALESCE(i.exchange_rate, 1)
        END
      ), 2) AS "amount"
    FROM public.invoices i
    LEFT JOIN public.supported_currencies sc ON sc.code = i.currency_code
    WHERE i.company_id = vc
      AND i.type = 'sale'
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.issue_date BETWEEN v_from AND v_to
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
$function$
