-- ============================================================================
-- Wave 10B: Analytics, BI, Dashboard & Commission RPCs — 20% Profit / 80% Cost
-- ----------------------------------------------------------------------------
-- Updates all reporting / BI / dashboard / commission SQL RPCs to use
-- `public.fn_effective_line_cogs_base(...)` so products without a cost price
-- ALWAYS contribute 20% profit and 80% implied cost (never 100% profit or 30%).
-- ============================================================================

-- 1. get_dashboard_summary
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    vc uuid;
    v_auth_branches uuid[];
    v_target_branch uuid;
    v_claims text := current_setting('request.jwt.claims', true);
    v_is_privileged boolean;
    v_total_debts NUMERIC := 0;
    v_total_supplier_debts NUMERIC := 0;
    v_total_cogs NUMERIC := 0;
    v_res jsonb;
BEGIN
    vc := public.verify_company_access(p_company_id);

    v_is_privileged := public.is_super_admin()
      OR (v_claims IS NOT NULL AND btrim(v_claims) <> '' AND left(btrim(v_claims), 1) = '{' AND (v_claims::jsonb ->> 'role') = 'service_role')
      OR ((v_claims IS NULL OR btrim(v_claims) = '') AND session_user IN ('postgres', 'supabase_admin'));

    SELECT array_agg(b) INTO v_auth_branches
    FROM public.get_auth_branches(vc) b;

    IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
        IF v_is_privileged THEN
            SELECT array_agg(id) INTO v_auth_branches FROM public.branches WHERE company_id = vc;
        END IF;
    END IF;

    IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
        RETURN jsonb_build_object(
            'total_sales', 0, 'total_purchases', 0, 'total_expenses', 0,
            'total_cogs', 0, 'gross_profit', 0,
            'receipt_bonds', 0, 'payment_bonds', 0, 'total_debts', 0,
            'total_supplier_debts', 0, 'invoice_count', 0
        );
    END IF;

    IF p_branch_id IS NOT NULL THEN
        IF NOT (p_branch_id = ANY(v_auth_branches)) AND NOT v_is_privileged THEN
            RAISE EXCEPTION 'غير مصرح بالوصول إلى بيانات هذا الفرع' USING ERRCODE = '42501';
        END IF;
        v_target_branch := p_branch_id;
    END IF;

    SELECT COALESCE(ROUND(SUM(pb.balance), 2), 0)
    INTO v_total_debts
    FROM public.party_balances pb
    JOIN public.parties pt ON pt.id = pb.party_id
    WHERE pb.company_id = vc
      AND pt.deleted_at IS NULL
      AND pt.type IN ('customer', 'both')
      AND pb.balance > 0
      AND pt.name NOT ILIKE '%صندوق الفايض%'
      AND pt.name NOT ILIKE '%معالجة فوارق%'
      AND (
        (v_target_branch IS NOT NULL AND pt.branch_id = v_target_branch)
        OR (v_target_branch IS NULL AND (pt.branch_id = ANY(v_auth_branches) OR pt.branch_id IS NULL))
      );

    SELECT COALESCE(ROUND(SUM(ABS(pb.balance)), 2), 0)
    INTO v_total_supplier_debts
    FROM public.party_balances pb
    JOIN public.parties pt ON pt.id = pb.party_id
    WHERE pb.company_id = vc
      AND pt.deleted_at IS NULL
      AND pt.type IN ('supplier', 'both')
      AND pb.balance < 0
      AND pt.name NOT ILIKE '%صندوق الفايض%'
      AND pt.name NOT ILIKE '%معالجة فوارق%'
      AND (
        (v_target_branch IS NOT NULL AND pt.branch_id = v_target_branch)
        OR (v_target_branch IS NULL AND (pt.branch_id = ANY(v_auth_branches) OR pt.branch_id IS NULL))
      );

    SELECT COALESCE(ROUND(SUM(
      CASE
        WHEN i.type = 'sale' THEN
          public.fn_effective_line_cogs_base(i.currency_code, i.exchange_rate, ii.quantity, ii.total, ii.cost_price, p.cost_price, p.purchase_price)
        WHEN i.type IN ('sale_return', 'return_sale') THEN
          -public.fn_effective_line_cogs_base(i.currency_code, i.exchange_rate, ii.quantity, ii.total, ii.cost_price, p.cost_price, p.purchase_price)
        ELSE 0
      END
    ), 2), 0)
    INTO v_total_cogs
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    LEFT JOIN public.products p ON p.id = ii.product_id
    WHERE i.company_id = vc
      AND i.deleted_at IS NULL
      AND i.status IN ('posted','paid','confirmed','partially_paid')
      AND i.type IN ('sale', 'sale_return', 'return_sale')
      AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
      AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
      AND (
        (v_target_branch IS NOT NULL AND i.branch_id = v_target_branch)
        OR (v_target_branch IS NULL AND (i.branch_id = ANY(v_auth_branches) OR i.branch_id IS NULL))
      );

    WITH inv_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'sale' AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          WHEN i.type IN ('sale_return', 'return_sale') AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            -1 * public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          ELSE 0
        END), 2), 0) AS total_sales,

        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'purchase' AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          WHEN i.type IN ('purchase_return', 'return_purchase') AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            -1 * public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          ELSE 0
        END), 2), 0) AS total_purchases,

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
        END), 2), 0) AS payment_bonds
      FROM public.payments p
      WHERE p.company_id = vc AND p.status = 'posted' AND p.deleted_at IS NULL
        AND (
          (v_target_branch IS NOT NULL AND p.branch_id = v_target_branch)
          OR (v_target_branch IS NULL AND (p.branch_id = ANY(v_auth_branches) OR p.branch_id IS NULL))
        )
    ),
    exp_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE
          WHEN a.code LIKE 'MZ-3%' OR (a.type = 'expense' AND a.code NOT LIKE 'MZ-5%' AND a.code NOT LIKE '51%' AND a.code NOT LIKE '312%') THEN
            jel.debit_amount - jel.credit_amount
          ELSE 0
        END), 2), 0) AS total_expenses
      FROM public.journal_entry_lines jel
      JOIN public.accounts a ON a.id = jel.account_id
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      WHERE a.company_id = vc
        AND a.deleted_at IS NULL
        AND jel.deleted_at IS NULL
        AND je.deleted_at IS NULL
        AND je.status = 'posted'
        AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
        AND (p_date_to IS NULL OR je.entry_date <= p_date_to)
        AND (
          (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
          OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
        )
    )
    SELECT jsonb_build_object(
      'total_sales', inv.total_sales,
      'total_purchases', inv.total_purchases,
      'total_expenses', exp.total_expenses,
      'total_cogs', v_total_cogs,
      'gross_profit', ROUND(inv.total_sales - v_total_cogs, 2),
      'receipt_bonds', pay.receipt_bonds,
      'payment_bonds', pay.payment_bonds,
      'total_debts', v_total_debts,
      'total_supplier_debts', v_total_supplier_debts,
      'invoice_count', inv.invoice_count
    ) INTO v_res
    FROM inv_summary inv
    CROSS JOIN pay_summary pay
    CROSS JOIN exp_summary exp;

    RETURN v_res;
END;
$function$;

-- 2. get_executive_bi_summary
CREATE OR REPLACE FUNCTION public.get_executive_bi_summary(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_compare_period boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
    v_date_from date := COALESCE(p_date_from, '1900-01-01'::date);
    v_date_to date := COALESCE(p_date_to, CURRENT_DATE);
    v_period_days integer := GREATEST(1, (v_date_to - v_date_from));
    v_prev_from date := CASE WHEN p_date_from IS NULL THEN '1800-01-01'::date ELSE v_date_from - (v_period_days || ' days')::interval END;
    v_prev_to date := CASE WHEN p_date_from IS NULL THEN '1800-01-01'::date ELSE v_date_from - INTERVAL '1 day' END;

    v_curr_sales numeric := 0;
    v_curr_returns numeric := 0;
    v_curr_net_sales numeric := 0;
    v_curr_cogs numeric := 0;
    v_curr_gross_profit numeric := 0;
    v_curr_purchases numeric := 0;

    v_prev_net_sales numeric := 0;
    v_prev_gross_profit numeric := 0;
    v_prev_purchases numeric := 0;

    v_stock_valuation numeric := 0;
    v_receivables numeric := 0;
    v_payables numeric := 0;
    v_active_customers integer := 0;
    v_active_suppliers integer := 0;
    v_cash_liquidity numeric := 0;
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    SELECT
        COALESCE(SUM(CASE WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN inv.type IN ('sale_return', 'return_sale') THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN inv.type = 'purchase' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0)
    INTO v_curr_sales, v_curr_returns, v_curr_purchases
    FROM public.invoices inv
    WHERE inv.company_id = p_company_id
      AND inv.deleted_at IS NULL
      AND inv.status IN ('posted', 'paid', 'partially_paid')
      AND inv.issue_date BETWEEN v_date_from AND v_date_to
      AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id);

    v_curr_net_sales := v_curr_sales - v_curr_returns;

    SELECT
        COALESCE(SUM(
            CASE
                WHEN inv.type = 'sale' THEN
                    public.fn_effective_line_cogs_base(inv.currency_code, inv.exchange_rate, item.quantity, item.total, item.cost_price, prd.cost_price, prd.purchase_price)
                WHEN inv.type IN ('sale_return', 'return_sale') THEN
                    -public.fn_effective_line_cogs_base(inv.currency_code, inv.exchange_rate, item.quantity, item.total, item.cost_price, prd.cost_price, prd.purchase_price)
                ELSE 0
            END
        ), 0)
    INTO v_curr_cogs
    FROM public.invoice_items item
    JOIN public.invoices inv ON inv.id = item.invoice_id
    LEFT JOIN public.products prd ON prd.id = item.product_id
    WHERE inv.company_id = p_company_id
      AND inv.deleted_at IS NULL
      AND inv.status IN ('posted', 'paid', 'partially_paid')
      AND inv.type IN ('sale', 'sale_return', 'return_sale')
      AND inv.issue_date BETWEEN v_date_from AND v_date_to
      AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id);

    v_curr_gross_profit := v_curr_net_sales - v_curr_cogs;

    IF p_compare_period AND p_date_from IS NOT NULL THEN
        SELECT
            COALESCE(SUM(
                CASE
                    WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                    WHEN inv.type IN ('sale_return', 'return_sale') THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                    ELSE 0
                END
            ), 0),
            COALESCE(SUM(CASE WHEN inv.type = 'purchase' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0)
        INTO v_prev_net_sales, v_prev_purchases
        FROM public.invoices inv
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status IN ('posted', 'paid', 'partially_paid')
          AND inv.type IN ('sale', 'sale_return', 'return_sale', 'purchase')
          AND inv.issue_date BETWEEN v_prev_from AND v_prev_to
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id);

        SELECT
            v_prev_net_sales - COALESCE(SUM(
                CASE
                    WHEN inv.type = 'sale' THEN
                        public.fn_effective_line_cogs_base(inv.currency_code, inv.exchange_rate, item.quantity, item.total, item.cost_price, prd.cost_price, prd.purchase_price)
                    WHEN inv.type IN ('sale_return', 'return_sale') THEN
                        -public.fn_effective_line_cogs_base(inv.currency_code, inv.exchange_rate, item.quantity, item.total, item.cost_price, prd.cost_price, prd.purchase_price)
                    ELSE 0
                END
            ), 0)
        INTO v_prev_gross_profit
        FROM public.invoice_items item
        JOIN public.invoices inv ON inv.id = item.invoice_id
        LEFT JOIN public.products prd ON prd.id = item.product_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status IN ('posted', 'paid', 'partially_paid')
          AND inv.type IN ('sale', 'sale_return', 'return_sale')
          AND inv.issue_date BETWEEN v_prev_from AND v_prev_to
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id);
    END IF;

    SELECT COALESCE(SUM(ps.quantity * COALESCE(p.cost_price, p.purchase_price, 0)), 0)
    INTO v_stock_valuation
    FROM public.product_stock ps
    JOIN public.products p ON p.id = ps.product_id
    JOIN public.warehouses w ON w.id = ps.warehouse_id
    WHERE ps.company_id = p_company_id
      AND (p_branch_id IS NULL OR w.branch_id = p_branch_id);

    SELECT
        COALESCE(SUM(CASE WHEN pb.balance > 0 THEN pb.balance ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pb.balance < 0 THEN ABS(pb.balance) ELSE 0 END), 0)
    INTO v_receivables, v_payables
    FROM public.party_balances pb
    WHERE pb.company_id = p_company_id;

    SELECT
        COUNT(*) FILTER (WHERE type IN ('customer', 'both') AND status = 'active'),
        COUNT(*) FILTER (WHERE type IN ('supplier', 'both') AND status = 'active')
    INTO v_active_customers, v_active_suppliers
    FROM public.parties
    WHERE company_id = p_company_id AND deleted_at IS NULL;

    SELECT COALESCE(SUM(ab.balance), 0)
    INTO v_cash_liquidity
    FROM public.cashboxes cb
    JOIN public.account_balances ab ON ab.account_id = cb.account_id AND ab.company_id = cb.company_id
    WHERE cb.company_id = p_company_id AND cb.is_active = true;

    RETURN jsonb_build_object(
        'current', jsonb_build_object(
            'total_sales', ROUND(v_curr_sales, 2),
            'total_returns', ROUND(v_curr_returns, 2),
            'net_sales', ROUND(v_curr_net_sales, 2),
            'cogs', ROUND(v_curr_cogs, 2),
            'gross_profit', ROUND(v_curr_gross_profit, 2),
            'gross_margin_percent', ROUND(CASE WHEN v_curr_net_sales > 0 THEN (v_curr_gross_profit / v_curr_net_sales) * 100 ELSE 0 END, 2),
            'purchases', ROUND(v_curr_purchases, 2),
            'stock_valuation', ROUND(v_stock_valuation, 2),
            'receivables', ROUND(v_receivables, 2),
            'payables', ROUND(v_payables, 2),
            'active_customers', v_active_customers,
            'active_suppliers', v_active_suppliers,
            'cash_liquidity', ROUND(v_cash_liquidity, 2)
        ),
        'previous', jsonb_build_object(
            'net_sales', ROUND(v_prev_net_sales, 2),
            'gross_profit', ROUND(v_prev_gross_profit, 2),
            'purchases', ROUND(v_prev_purchases, 2)
        ),
        'growth', jsonb_build_object(
            'sales_growth_pct', ROUND(CASE WHEN v_prev_net_sales > 0 THEN ((v_curr_net_sales - v_prev_net_sales) / v_prev_net_sales) * 100 WHEN v_curr_net_sales > 0 THEN 100 ELSE 0 END, 2),
            'profit_growth_pct', ROUND(CASE WHEN v_prev_gross_profit > 0 THEN ((v_curr_gross_profit - v_prev_gross_profit) / v_prev_gross_profit) * 100 WHEN v_curr_gross_profit > 0 THEN 100 ELSE 0 END, 2),
            'purchases_growth_pct', ROUND(CASE WHEN v_prev_purchases > 0 THEN ((v_curr_purchases - v_prev_purchases) / v_prev_purchases) * 100 WHEN v_curr_purchases > 0 THEN 100 ELSE 0 END, 2)
        )
    );
END;
$function$;

-- 3. get_customer_bi_analytics
CREATE OR REPLACE FUNCTION public.get_customer_bi_analytics(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_metric text DEFAULT 'revenue'::text,
  p_loyalty_segment text DEFAULT 'all'::text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_search text DEFAULT NULL::text
)
RETURNS TABLE(party_id uuid, party_name text, phone text, category_name text, invoices_count bigint, total_revenue numeric, total_cost numeric, gross_profit numeric, margin_percent numeric, avg_invoice_value numeric, first_purchase_date date, last_purchase_date date, days_since_last_purchase integer, loyalty_segment text, current_balance numeric, overdue_balance numeric, collection_rate numeric, growth_rate numeric, total_records bigint, summary_total_revenue numeric, summary_total_profit numeric, summary_champions_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
    v_date_from date := COALESCE(p_date_from, '1900-01-01'::date);
    v_date_to date := COALESCE(p_date_to, CURRENT_DATE);
    v_period_days integer := GREATEST(1, (v_date_to - v_date_from));
    v_prev_from date := CASE WHEN p_date_from IS NULL THEN '1800-01-01'::date ELSE v_date_from - (v_period_days || ' days')::interval END;
    v_prev_to date := CASE WHEN p_date_from IS NULL THEN '1800-01-01'::date ELSE v_date_from - INTERVAL '1 day' END;
    v_offset integer := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 25));
    v_limit integer := GREATEST(1, LEAST(COALESCE(p_page_size, 25), 100));
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    RETURN QUERY
    WITH target_parties AS (
        SELECT pty.id, pty.name, pty.phone, pty.category_id
        FROM public.parties pty
        WHERE pty.company_id = p_company_id
          AND pty.deleted_at IS NULL
          AND pty.type IN ('customer', 'both')
          AND pty.name NOT ILIKE '%صندوق الفايض%'
          AND (p_search IS NULL OR pty.name ILIKE '%' || p_search || '%' OR pty.phone ILIKE '%' || p_search || '%')
    ),
    customer_invoices AS (
        SELECT
            inv.party_id,
            COUNT(DISTINCT inv.id) FILTER (WHERE inv.type = 'sale') AS sales_count,
            COALESCE(SUM(
                CASE
                    WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                    WHEN inv.type IN ('sale_return', 'return_sale') THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                    ELSE 0
                END
            ), 0) AS net_revenue,
            COALESCE(SUM(
                CASE
                    WHEN inv.type = 'sale' THEN
                        public.fn_invoice_to_base_amount(
                            inv.currency_code,
                            CASE WHEN inv.status = 'paid' AND COALESCE(inv.paid_amount, 0) = 0 THEN inv.total_amount ELSE COALESCE(inv.paid_amount, 0) END,
                            inv.exchange_rate
                        )
                    ELSE 0
                END
            ), 0) AS period_invoice_paid
        FROM public.invoices inv
        JOIN target_parties tp ON tp.id = inv.party_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status IN ('posted', 'paid', 'partially_paid')
          AND inv.type IN ('sale', 'sale_return', 'return_sale')
          AND inv.issue_date BETWEEN v_date_from AND v_date_to
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
        GROUP BY inv.party_id
    ),
    customer_cogs AS (
        SELECT
            inv.party_id,
            COALESCE(SUM(
                CASE
                    WHEN inv.type = 'sale' THEN
                        public.fn_effective_line_cogs_base(inv.currency_code, inv.exchange_rate, item.quantity, item.total, item.cost_price, prd.cost_price, prd.purchase_price)
                    WHEN inv.type IN ('sale_return', 'return_sale') THEN
                        -public.fn_effective_line_cogs_base(inv.currency_code, inv.exchange_rate, item.quantity, item.total, item.cost_price, prd.cost_price, prd.purchase_price)
                    ELSE 0
                END
            ), 0) AS net_cogs
        FROM public.invoice_items item
        JOIN public.invoices inv ON inv.id = item.invoice_id
        JOIN target_parties tp ON tp.id = inv.party_id
        LEFT JOIN public.products prd ON prd.id = item.product_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status IN ('posted', 'paid', 'partially_paid')
          AND inv.type IN ('sale', 'sale_return', 'return_sale')
          AND inv.issue_date BETWEEN v_date_from AND v_date_to
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
        GROUP BY inv.party_id
    ),
    customer_history AS (
        SELECT
            inv.party_id,
            MIN(inv.issue_date) FILTER (WHERE inv.type = 'sale') AS absolute_first_purchase,
            MAX(inv.issue_date) FILTER (WHERE inv.type = 'sale') AS absolute_last_purchase,
            COALESCE(SUM(
                CASE
                    WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                    WHEN inv.type IN ('sale_return', 'return_sale') THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                    ELSE 0
                END
            ) FILTER (WHERE inv.issue_date BETWEEN v_prev_from AND v_prev_to), 0) AS prev_period_revenue,
            COALESCE(SUM(
                CASE
                    WHEN inv.type = 'sale' AND inv.status = 'posted' AND inv.due_date < CURRENT_DATE AND (inv.total_amount - COALESCE(inv.paid_amount, 0)) > 0
                    THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount - COALESCE(inv.paid_amount, 0), inv.exchange_rate)
                    ELSE 0
                END
            ), 0) AS actual_overdue
        FROM public.invoices inv
        JOIN target_parties tp ON tp.id = inv.party_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status IN ('posted', 'paid', 'partially_paid')
          AND inv.type IN ('sale', 'sale_return', 'return_sale')
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
        GROUP BY inv.party_id
    ),
    customer_payments AS (
        SELECT
            p.party_id,
            COALESCE(SUM(public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)), 0) AS period_payments
        FROM public.payments p
        JOIN target_parties tp ON tp.id = p.party_id
        WHERE p.company_id = p_company_id
          AND p.deleted_at IS NULL
          AND p.status = 'posted'
          AND p.type = 'receipt'
          AND p.payment_date BETWEEN v_date_from AND v_date_to
          AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
        GROUP BY p.party_id
    ),
    aggregated AS (
        SELECT
            tp.id AS party_id,
            tp.name AS party_name,
            COALESCE(tp.phone, '') AS phone,
            COALESCE(cat.name, 'غير محدد') AS category_name,
            COALESCE(ci.sales_count, 0) AS invoices_count,
            ROUND(COALESCE(ci.net_revenue, 0), 2) AS total_revenue,
            ROUND(COALESCE(cc.net_cogs, 0), 2) AS total_cost,
            ROUND(COALESCE(ci.net_revenue, 0) - COALESCE(cc.net_cogs, 0), 2) AS gross_profit,
            ROUND(
                CASE
                    WHEN COALESCE(ci.net_revenue, 0) > 0 THEN
                        ((COALESCE(ci.net_revenue, 0) - COALESCE(cc.net_cogs, 0)) / ci.net_revenue) * 100
                    ELSE 0
                END, 2
            ) AS margin_percent,
            ROUND(
                CASE
                    WHEN COALESCE(ci.sales_count, 0) > 0 THEN
                        COALESCE(ci.net_revenue, 0) / ci.sales_count
                    ELSE 0
                END, 2
            ) AS avg_invoice_value,
            ch.absolute_first_purchase AS first_purchase_date,
            ch.absolute_last_purchase AS last_purchase_date,
            CASE
                WHEN ch.absolute_last_purchase IS NOT NULL THEN (CURRENT_DATE - ch.absolute_last_purchase)
                ELSE 9999
            END AS days_since_last_purchase,
            CASE
                WHEN ch.absolute_last_purchase IS NULL THEN 'churned'
                WHEN (CURRENT_DATE - ch.absolute_last_purchase) > 120 THEN 'churned'
                WHEN (CURRENT_DATE - ch.absolute_last_purchase) BETWEEN 61 AND 120 THEN 'at_risk'
                WHEN ch.absolute_first_purchase >= v_date_from THEN 'new'
                WHEN COALESCE(ci.sales_count, 0) >= 4 AND (CURRENT_DATE - ch.absolute_last_purchase) <= 30 THEN 'champions'
                WHEN COALESCE(ci.sales_count, 0) >= 2 AND (CURRENT_DATE - ch.absolute_last_purchase) <= 60 THEN 'loyal'
                WHEN COALESCE(ci.sales_count, 0) > 0 AND COALESCE(ch.prev_period_revenue, 0) = 0 AND ch.absolute_first_purchase < v_date_from THEN 'returning'
                ELSE 'loyal'
            END AS loyalty_segment,
            ROUND(COALESCE(pb.balance, 0), 2) AS current_balance,
            ROUND(COALESCE(ch.actual_overdue, 0), 2) AS overdue_balance,
            ROUND(
                CASE
                    WHEN COALESCE(ci.net_revenue, 0) > 0 THEN
                        LEAST(100, (GREATEST(COALESCE(cp.period_payments, 0), COALESCE(ci.period_invoice_paid, 0)) / ci.net_revenue) * 100)
                    WHEN COALESCE(pb.balance, 0) <= 0 THEN 100
                    ELSE 0
                END, 2
            ) AS collection_rate,
            ROUND(
                CASE
                    WHEN COALESCE(ch.prev_period_revenue, 0) > 0 THEN
                        ((COALESCE(ci.net_revenue, 0) - ch.prev_period_revenue) / ch.prev_period_revenue) * 100
                    WHEN COALESCE(ci.net_revenue, 0) > 0 THEN 100
                    ELSE 0
                END, 2
            ) AS growth_rate
        FROM target_parties tp
        LEFT JOIN public.party_categories cat ON cat.id = tp.category_id
        LEFT JOIN public.party_balances pb ON pb.party_id = tp.id AND pb.company_id = p_company_id
        LEFT JOIN customer_invoices ci ON ci.party_id = tp.id
        LEFT JOIN customer_cogs cc ON cc.party_id = tp.id
        LEFT JOIN customer_history ch ON ch.party_id = tp.id
        LEFT JOIN customer_payments cp ON cp.party_id = tp.id
    ),
    filtered AS (
        SELECT *
        FROM aggregated a
        WHERE (p_loyalty_segment = 'all' OR a.loyalty_segment = p_loyalty_segment)
    ),
    summary_totals AS (
        SELECT
            COUNT(*) AS total_count,
            ROUND(COALESCE(SUM(f_sum.total_revenue), 0), 2) AS sum_rev,
            ROUND(COALESCE(SUM(f_sum.gross_profit), 0), 2) AS sum_prof,
            COUNT(*) FILTER (WHERE f_sum.loyalty_segment = 'champions') AS champ_count
        FROM filtered f_sum
    )
    SELECT
        f.party_id,
        f.party_name,
        f.phone,
        f.category_name,
        f.invoices_count,
        f.total_revenue,
        f.total_cost,
        f.gross_profit,
        f.margin_percent,
        f.avg_invoice_value,
        f.first_purchase_date,
        f.last_purchase_date,
        f.days_since_last_purchase,
        f.loyalty_segment,
        f.current_balance,
        f.overdue_balance,
        f.collection_rate,
        f.growth_rate,
        st.total_count AS total_records,
        st.sum_rev AS summary_total_revenue,
        st.sum_prof AS summary_total_profit,
        st.champ_count AS summary_champions_count
    FROM filtered f
    CROSS JOIN summary_totals st
    ORDER BY
        CASE WHEN p_metric = 'revenue' THEN f.total_revenue END DESC NULLS LAST,
        CASE WHEN p_metric = 'invoices' THEN f.invoices_count END DESC NULLS LAST,
        CASE WHEN p_metric = 'profit' THEN f.gross_profit END DESC NULLS LAST,
        CASE WHEN p_metric = 'growth' THEN f.growth_rate END DESC NULLS LAST,
        CASE WHEN p_metric = 'frequency' THEN f.invoices_count END DESC NULLS LAST,
        CASE WHEN p_metric = 'loyalty' THEN f.days_since_last_purchase END ASC NULLS LAST,
        f.total_revenue DESC
    LIMIT v_limit
    OFFSET v_offset;
END;
$function$;

-- 4. get_product_bi_analytics
CREATE OR REPLACE FUNCTION public.get_product_bi_analytics(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_category_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_view_type text DEFAULT 'profitability'::text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_search text DEFAULT NULL::text
)
RETURNS TABLE(product_id uuid, product_sku text, product_name text, category_name text, brand_name text, times_sold bigint, quantity_sold numeric, quantity_returned numeric, net_quantity_sold numeric, total_revenue numeric, total_cogs numeric, gross_profit numeric, gross_margin_percent numeric, total_discount_given numeric, current_stock numeric, stock_valuation_cost numeric, turnover_ratio numeric, days_sales_inventory numeric, movement_classification text, return_rate_percent numeric, last_sale_date date, last_purchase_date date, total_records bigint, summary_total_revenue numeric, summary_total_cogs numeric, summary_total_profit numeric, summary_stock_valuation numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
    v_date_from date := COALESCE(p_date_from, '1900-01-01'::date);
    v_date_to date := COALESCE(p_date_to, CURRENT_DATE);
    v_period_days integer;
    v_offset integer := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 25));
    v_limit integer := GREATEST(1, LEAST(COALESCE(p_page_size, 25), 100));
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    IF p_date_from IS NULL THEN
        SELECT GREATEST(1, (v_date_to - COALESCE(MIN(issue_date), v_date_to - 30)))
        INTO v_period_days
        FROM public.invoices
        WHERE company_id = p_company_id AND deleted_at IS NULL AND status IN ('posted', 'paid', 'partially_paid') AND type = 'sale';
    ELSE
        v_period_days := GREATEST(1, (v_date_to - v_date_from));
    END IF;

    RETURN QUERY
    WITH target_products AS (
        SELECT p.id, p.sku, p.part_number, p.name_ar, p.brand, p.category_id, p.cost_price, p.purchase_price, p.min_stock_level
        FROM public.products p
        WHERE p.company_id = p_company_id
          AND p.deleted_at IS NULL
          AND (p_category_id IS NULL OR p.category_id = p_category_id)
          AND (p_search IS NULL OR p.name_ar ILIKE '%' || p_search || '%' OR p.sku ILIKE '%' || p_search || '%' OR p.part_number ILIKE '%' || p_search || '%')
    ),
    product_sales AS (
        SELECT
            item.product_id,
            COUNT(DISTINCT inv.id) FILTER (WHERE inv.type = 'sale') AS times_sold,
            COALESCE(SUM(item.quantity) FILTER (WHERE inv.type = 'sale'), 0) AS qty_sold,
            COALESCE(SUM(item.quantity) FILTER (WHERE inv.type IN ('sale_return', 'return_sale')), 0) AS qty_returned,
            COALESCE(SUM(public.fn_to_base_amount(inv.currency_code, item.total, inv.exchange_rate)) FILTER (WHERE inv.type = 'sale'), 0) -
            COALESCE(SUM(public.fn_to_base_amount(inv.currency_code, item.total, inv.exchange_rate)) FILTER (WHERE inv.type IN ('sale_return', 'return_sale')), 0) AS revenue,
            COALESCE(SUM(public.fn_effective_line_cogs_base(inv.currency_code, inv.exchange_rate, item.quantity, item.total, item.cost_price, tp.cost_price, tp.purchase_price)) FILTER (WHERE inv.type = 'sale'), 0) -
            COALESCE(SUM(public.fn_effective_line_cogs_base(inv.currency_code, inv.exchange_rate, item.quantity, item.total, item.cost_price, tp.cost_price, tp.purchase_price)) FILTER (WHERE inv.type IN ('sale_return', 'return_sale')), 0) AS cogs,
            COALESCE(SUM(public.fn_to_base_amount(inv.currency_code, item.discount_amount, inv.exchange_rate)) FILTER (WHERE inv.type = 'sale'), 0) AS discount_given,
            MAX(inv.issue_date) FILTER (WHERE inv.type = 'sale') AS last_sold
        FROM public.invoice_items item
        JOIN public.invoices inv ON inv.id = item.invoice_id
        JOIN target_products tp ON tp.id = item.product_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status IN ('posted', 'paid', 'partially_paid')
          AND inv.type IN ('sale', 'sale_return', 'return_sale')
          AND inv.issue_date BETWEEN v_date_from AND v_date_to
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
        GROUP BY item.product_id
    ),
    product_purchases AS (
        SELECT
            item.product_id,
            MAX(inv.issue_date) FILTER (WHERE inv.type = 'purchase') AS last_purchased
        FROM public.invoice_items item
        JOIN public.invoices inv ON inv.id = item.invoice_id
        JOIN target_products tp ON tp.id = item.product_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status IN ('posted', 'paid', 'partially_paid')
          AND inv.type = 'purchase'
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
        GROUP BY item.product_id
    ),
    stock_calc AS (
        SELECT
            ps.product_id,
            COALESCE(SUM(ps.quantity), 0) AS on_hand
        FROM public.product_stock ps
        JOIN target_products tp ON tp.id = ps.product_id
        JOIN public.warehouses w ON w.id = ps.warehouse_id
        WHERE ps.company_id = p_company_id
          AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
        GROUP BY ps.product_id
    ),
    aggregated AS (
        SELECT
            tp.id AS product_id,
            COALESCE(tp.sku, tp.part_number, '') AS product_sku,
            COALESCE(tp.name_ar, '') AS product_name,
            COALESCE(cat.name, 'عام') AS category_name,
            COALESCE(tp.brand, 'أصلي') AS brand_name,
            COALESCE(ps.times_sold, 0)::bigint AS times_sold,
            ROUND(COALESCE(ps.qty_sold, 0), 2) AS quantity_sold,
            ROUND(COALESCE(ps.qty_returned, 0), 2) AS quantity_returned,
            ROUND(COALESCE(ps.qty_sold, 0) - COALESCE(ps.qty_returned, 0), 2) AS net_quantity_sold,
            ROUND(COALESCE(ps.revenue, 0), 2) AS total_revenue,
            ROUND(COALESCE(ps.cogs, 0), 2) AS total_cogs,
            ROUND(COALESCE(ps.revenue, 0) - COALESCE(ps.cogs, 0), 2) AS gross_profit,
            ROUND(
                CASE
                    WHEN COALESCE(ps.revenue, 0) > 0 THEN
                        ((COALESCE(ps.revenue, 0) - COALESCE(ps.cogs, 0)) / ps.revenue) * 100
                    ELSE 0
                END, 2
            ) AS gross_margin_percent,
            ROUND(COALESCE(ps.discount_given, 0), 2) AS total_discount_given,
            ROUND(COALESCE(sc.on_hand, 0), 2) AS current_stock,
            ROUND(COALESCE(sc.on_hand, 0) * COALESCE(tp.cost_price, tp.purchase_price, 0), 2) AS stock_valuation_cost,
            ROUND(
                CASE
                    WHEN COALESCE(sc.on_hand, 0) > 0 THEN
                        (COALESCE(ps.qty_sold, 0) - COALESCE(ps.qty_returned, 0)) / sc.on_hand
                    ELSE 0
                END, 2
            ) AS turnover_ratio,
            ROUND(
                CASE
                    WHEN (COALESCE(ps.qty_sold, 0) - COALESCE(ps.qty_returned, 0)) > 0 THEN
                        COALESCE(sc.on_hand, 0) / ((COALESCE(ps.qty_sold, 0) - COALESCE(ps.qty_returned, 0)) / v_period_days)
                    ELSE 999
                END, 1
            ) AS days_sales_inventory,
            CASE
                WHEN COALESCE(sc.on_hand, 0) > 0 AND (ps.last_sold IS NULL OR ps.last_sold < CURRENT_DATE - INTERVAL '180 days') THEN 'dead'
                WHEN COALESCE(sc.on_hand, 0) <= COALESCE(tp.min_stock_level, 0) AND (COALESCE(ps.qty_sold, 0) > 0) THEN 'stockout_risk'
                WHEN COALESCE(ps.times_sold, 0) >= 10 OR (COALESCE(sc.on_hand, 0) > 0 AND ((COALESCE(ps.qty_sold, 0) / sc.on_hand) >= 2.0)) THEN 'fast'
                WHEN (COALESCE(ps.qty_sold, 0) - COALESCE(ps.qty_returned, 0)) > 0 AND (COALESCE(sc.on_hand, 0) / NULLIF(((COALESCE(ps.qty_sold, 0) - COALESCE(ps.qty_returned, 0)) / v_period_days), 0)) > 90 THEN 'slow'
                ELSE 'medium'
            END AS movement_classification,
            ROUND(
                CASE
                    WHEN (COALESCE(ps.qty_sold, 0) + COALESCE(ps.qty_returned, 0)) > 0 THEN
                        (COALESCE(ps.qty_returned, 0) / (COALESCE(ps.qty_sold, 0) + COALESCE(ps.qty_returned, 0))) * 100
                    ELSE 0
                END, 2
            ) AS return_rate_percent,
            ps.last_sold AS last_sale_date,
            pp.last_purchased AS last_purchase_date
        FROM target_products tp
        LEFT JOIN public.product_categories cat ON cat.id = tp.category_id
        LEFT JOIN product_sales ps ON ps.product_id = tp.id
        LEFT JOIN product_purchases pp ON pp.product_id = tp.id
        LEFT JOIN stock_calc sc ON sc.product_id = tp.id
    ),
    filtered AS (
        SELECT *
        FROM aggregated a
        WHERE
            CASE
                WHEN p_view_type = 'slow_moving' THEN a.movement_classification = 'slow'
                WHEN p_view_type = 'dead_stock' THEN a.movement_classification = 'dead'
                WHEN p_view_type = 'velocity' THEN a.movement_classification = 'fast'
                WHEN p_view_type = 'returns' THEN a.return_rate_percent > 0
                ELSE TRUE
            END
    ),
    summary_totals AS (
        SELECT
            COUNT(*) AS total_count,
            ROUND(COALESCE(SUM(f_sum.total_revenue), 0), 2) AS sum_rev,
            ROUND(COALESCE(SUM(f_sum.total_cogs), 0), 2) AS sum_cogs,
            ROUND(COALESCE(SUM(f_sum.gross_profit), 0), 2) AS sum_prof,
            ROUND(COALESCE(SUM(f_sum.stock_valuation_cost), 0), 2) AS sum_val
        FROM filtered f_sum
    )
    SELECT
        f.product_id, f.product_sku, f.product_name, f.category_name, f.brand_name,
        f.times_sold, f.quantity_sold, f.quantity_returned, f.net_quantity_sold,
        f.total_revenue, f.total_cogs, f.gross_profit, f.gross_margin_percent,
        f.total_discount_given, f.current_stock, f.stock_valuation_cost,
        f.turnover_ratio, f.days_sales_inventory, f.movement_classification,
        f.return_rate_percent, f.last_sale_date, f.last_purchase_date,
        st.total_count AS total_records,
        st.sum_rev AS summary_total_revenue,
        st.sum_cogs AS summary_total_cogs,
        st.sum_prof AS summary_total_profit,
        st.sum_val AS summary_stock_valuation
    FROM filtered f
    CROSS JOIN summary_totals st
    ORDER BY
        CASE WHEN p_view_type = 'profitability' THEN f.gross_profit END DESC NULLS LAST,
        CASE WHEN p_view_type = 'movement' THEN f.net_quantity_sold END DESC NULLS LAST,
        CASE WHEN p_view_type = 'velocity' THEN f.times_sold END DESC NULLS LAST,
        CASE WHEN p_view_type = 'slow_moving' THEN f.days_sales_inventory END DESC NULLS LAST,
        CASE WHEN p_view_type = 'dead_stock' THEN f.current_stock END DESC NULLS LAST,
        CASE WHEN p_view_type = 'returns' THEN f.return_rate_percent END DESC NULLS LAST,
        f.total_revenue DESC
    LIMIT v_limit
    OFFSET v_offset;
END;
$function$;

-- 5. get_product_bi_analytics_v2
CREATE OR REPLACE FUNCTION public.get_product_bi_analytics_v2(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_category_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_view_type text DEFAULT 'profitability'::text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_search text DEFAULT NULL::text,
  p_brand text DEFAULT NULL::text
)
RETURNS TABLE(product_id uuid, product_sku text, part_number text, alternative_numbers text, product_name text, category_name text, brand_name text, unit text, times_sold bigint, quantity_sold numeric, quantity_returned numeric, net_quantity_sold numeric, total_revenue numeric, total_cogs numeric, gross_profit numeric, gross_margin_percent numeric, total_discount_given numeric, current_stock numeric, stock_valuation_cost numeric, turnover_ratio numeric, days_sales_inventory numeric, movement_classification text, return_rate_percent numeric, last_sale_date date, last_purchase_date date, total_records bigint, summary_total_revenue numeric, summary_total_cogs numeric, summary_total_profit numeric, summary_stock_valuation numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
    v_date_from date := COALESCE(p_date_from, '1900-01-01'::date);
    v_date_to date := COALESCE(p_date_to, CURRENT_DATE);
    v_period_days integer;
    v_offset integer := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 25));
    v_limit integer := GREATEST(1, LEAST(COALESCE(p_page_size, 25), 100));
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    IF p_date_from IS NULL THEN
        SELECT GREATEST(1, (v_date_to - COALESCE(MIN(issue_date), v_date_to - 30)))
        INTO v_period_days
        FROM public.invoices
        WHERE company_id = p_company_id AND deleted_at IS NULL AND status IN ('posted', 'paid', 'partially_paid') AND type = 'sale';
    ELSE
        v_period_days := GREATEST(1, (v_date_to - v_date_from));
    END IF;

    RETURN QUERY
    WITH target_products AS (
        SELECT p.id, p.sku, p.part_number, p.alternative_numbers, p.name_ar, p.brand, p.unit, p.category_id, p.cost_price, p.purchase_price, p.min_stock_level, p.item_type
        FROM public.products p
        WHERE p.company_id = p_company_id
          AND p.deleted_at IS NULL
          AND (p_category_id IS NULL OR p.category_id = p_category_id)
          AND (p_brand IS NULL OR NULLIF(TRIM(p_brand), '') IS NULL OR p.brand ILIKE '%' || TRIM(p_brand) || '%')
          AND (
              p_search IS NULL
              OR p.name_ar ILIKE '%' || p_search || '%'
              OR p.part_number ILIKE '%' || p_search || '%'
              OR p.sku ILIKE '%' || p_search || '%'
              OR p.brand ILIKE '%' || p_search || '%'
              OR p.alternative_numbers ILIKE '%' || p_search || '%'
              OR p.barcode ILIKE '%' || p_search || '%'
          )
    ),
    product_sales AS (
        SELECT
            item.product_id,
            COUNT(DISTINCT inv.id) FILTER (WHERE inv.type = 'sale') AS times_sold,
            COALESCE(SUM(item.quantity) FILTER (WHERE inv.type = 'sale'), 0) AS qty_sold,
            COALESCE(SUM(item.quantity) FILTER (WHERE inv.type IN ('sale_return', 'return_sale')), 0) AS qty_returned,
            COALESCE(SUM(public.fn_to_base_amount(inv.currency_code, item.total, inv.exchange_rate)) FILTER (WHERE inv.type = 'sale'), 0) -
            COALESCE(SUM(public.fn_to_base_amount(inv.currency_code, item.total, inv.exchange_rate)) FILTER (WHERE inv.type IN ('sale_return', 'return_sale')), 0) AS revenue,
            COALESCE(SUM(public.fn_effective_line_cogs_base(inv.currency_code, inv.exchange_rate, item.quantity, item.total, item.cost_price, tp.cost_price, tp.purchase_price)) FILTER (WHERE inv.type = 'sale'), 0) -
            COALESCE(SUM(public.fn_effective_line_cogs_base(inv.currency_code, inv.exchange_rate, item.quantity, item.total, item.cost_price, tp.cost_price, tp.purchase_price)) FILTER (WHERE inv.type IN ('sale_return', 'return_sale')), 0) AS cogs,
            COALESCE(SUM(public.fn_to_base_amount(inv.currency_code, item.discount_amount, inv.exchange_rate)) FILTER (WHERE inv.type = 'sale'), 0) AS discount_given,
            MAX(inv.issue_date) FILTER (WHERE inv.type = 'sale') AS last_sold
        FROM public.invoice_items item
        JOIN public.invoices inv ON inv.id = item.invoice_id
        JOIN target_products tp ON tp.id = item.product_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status IN ('posted', 'paid', 'partially_paid')
          AND inv.type IN ('sale', 'sale_return', 'return_sale')
          AND inv.issue_date BETWEEN v_date_from AND v_date_to
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
        GROUP BY item.product_id
    ),
    product_purchases AS (
        SELECT
            item.product_id,
            MAX(inv.issue_date) FILTER (WHERE inv.type = 'purchase') AS last_purchased
        FROM public.invoice_items item
        JOIN public.invoices inv ON inv.id = item.invoice_id
        JOIN target_products tp ON tp.id = item.product_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status IN ('posted', 'paid', 'partially_paid')
          AND inv.type = 'purchase'
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
        GROUP BY item.product_id
    ),
    stock_calc AS (
        SELECT
            ps.product_id,
            COALESCE(SUM(ps.quantity), 0) AS on_hand
        FROM public.product_stock ps
        JOIN target_products tp ON tp.id = ps.product_id
        JOIN public.warehouses w ON w.id = ps.warehouse_id
        WHERE ps.company_id = p_company_id
          AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
        GROUP BY ps.product_id
    ),
    aggregated AS (
        SELECT
            tp.id AS product_id,
            COALESCE(NULLIF(TRIM(tp.sku), ''), '') AS product_sku,
            COALESCE(NULLIF(TRIM(tp.part_number), ''), '') AS part_number,
            COALESCE(NULLIF(TRIM(tp.alternative_numbers), ''), '') AS alternative_numbers,
            COALESCE(tp.name_ar, '') AS product_name,
            COALESCE(cat.name, 'غير مصنف') AS category_name,
            COALESCE(NULLIF(TRIM(tp.brand), ''), 'غير محدد') AS brand_name,
            COALESCE(NULLIF(TRIM(tp.unit), ''), 'قطعة') AS unit,
            COALESCE(ps.times_sold, 0)::bigint AS times_sold,
            ROUND(COALESCE(ps.qty_sold, 0), 2) AS quantity_sold,
            ROUND(COALESCE(ps.qty_returned, 0), 2) AS quantity_returned,
            ROUND(COALESCE(ps.qty_sold, 0) - COALESCE(ps.qty_returned, 0), 2) AS net_quantity_sold,
            ROUND(COALESCE(ps.revenue, 0), 2) AS total_revenue,
            ROUND(COALESCE(ps.cogs, 0), 2) AS total_cogs,
            ROUND(COALESCE(ps.revenue, 0) - COALESCE(ps.cogs, 0), 2) AS gross_profit,
            ROUND(
                CASE
                    WHEN COALESCE(ps.revenue, 0) > 0 THEN
                        ((COALESCE(ps.revenue, 0) - COALESCE(ps.cogs, 0)) / ps.revenue) * 100
                    ELSE 0
                END, 2
            ) AS gross_margin_percent,
            ROUND(COALESCE(ps.discount_given, 0), 2) AS total_discount_given,
            CASE WHEN tp.item_type = 'service' THEN 0::numeric ELSE ROUND(COALESCE(sc.on_hand, 0), 2) END AS current_stock,
            CASE WHEN tp.item_type = 'service' THEN 0::numeric ELSE ROUND(COALESCE(sc.on_hand, 0) * COALESCE(tp.cost_price, tp.purchase_price, 0), 2) END AS stock_valuation_cost,
            ROUND(
                CASE
                    WHEN tp.item_type = 'service' THEN 0
                    WHEN COALESCE(sc.on_hand, 0) > 0 THEN
                        (COALESCE(ps.qty_sold, 0) - COALESCE(ps.qty_returned, 0)) / sc.on_hand
                    ELSE 0
                END, 2
            ) AS turnover_ratio,
            ROUND(
                CASE
                    WHEN tp.item_type = 'service' THEN 0
                    WHEN (COALESCE(ps.qty_sold, 0) - COALESCE(ps.qty_returned, 0)) > 0 THEN
                        COALESCE(sc.on_hand, 0) / ((COALESCE(ps.qty_sold, 0) - COALESCE(ps.qty_returned, 0)) / v_period_days)
                    ELSE 999
                END, 1
            ) AS days_sales_inventory,
            CASE
                WHEN tp.item_type = 'service' THEN 'service'
                WHEN COALESCE(sc.on_hand, 0) > 0 AND (ps.last_sold IS NULL OR ps.last_sold < CURRENT_DATE - INTERVAL '180 days') THEN 'dead'
                WHEN COALESCE(sc.on_hand, 0) <= COALESCE(tp.min_stock_level, 0) AND (COALESCE(ps.qty_sold, 0) > 0) THEN 'stockout_risk'
                WHEN COALESCE(ps.times_sold, 0) >= 10 OR (COALESCE(sc.on_hand, 0) > 0 AND ((COALESCE(ps.qty_sold, 0) / sc.on_hand) >= 2.0)) THEN 'fast'
                WHEN (COALESCE(ps.qty_sold, 0) - COALESCE(ps.qty_returned, 0)) > 0 AND (COALESCE(sc.on_hand, 0) / NULLIF(((COALESCE(ps.qty_sold, 0) - COALESCE(ps.qty_returned, 0)) / v_period_days), 0)) > 90 THEN 'slow'
                ELSE 'medium'
            END AS movement_classification,
            ROUND(
                CASE
                    WHEN (COALESCE(ps.qty_sold, 0) + COALESCE(ps.qty_returned, 0)) > 0 THEN
                        (COALESCE(ps.qty_returned, 0) / (COALESCE(ps.qty_sold, 0) + COALESCE(ps.qty_returned, 0))) * 100
                    ELSE 0
                END, 2
            ) AS return_rate_percent,
            ps.last_sold AS last_sale_date,
            pp.last_purchased AS last_purchase_date
        FROM target_products tp
        LEFT JOIN public.product_categories cat ON cat.id = tp.category_id
        LEFT JOIN product_sales ps ON ps.product_id = tp.id
        LEFT JOIN product_purchases pp ON pp.product_id = tp.id
        LEFT JOIN stock_calc sc ON sc.product_id = tp.id
    ),
    filtered AS (
        SELECT *
        FROM aggregated a
        WHERE
            CASE
                WHEN p_view_type = 'slow_moving' THEN a.movement_classification = 'slow'
                WHEN p_view_type = 'dead_stock' THEN a.movement_classification = 'dead'
                WHEN p_view_type = 'velocity' THEN a.movement_classification = 'fast'
                WHEN p_view_type = 'returns' THEN a.return_rate_percent > 0
                ELSE TRUE
            END
    ),
    summary_totals AS (
        SELECT
            COUNT(*) AS total_count,
            ROUND(COALESCE(SUM(f_sum.total_revenue), 0), 2) AS sum_rev,
            ROUND(COALESCE(SUM(f_sum.total_cogs), 0), 2) AS sum_cogs,
            ROUND(COALESCE(SUM(f_sum.gross_profit), 0), 2) AS sum_prof,
            ROUND(COALESCE(SUM(f_sum.stock_valuation_cost), 0), 2) AS sum_val
        FROM filtered f_sum
    )
    SELECT
        f.product_id, f.product_sku, f.part_number, f.alternative_numbers,
        f.product_name, f.category_name, f.brand_name, f.unit,
        f.times_sold, f.quantity_sold, f.quantity_returned, f.net_quantity_sold,
        f.total_revenue, f.total_cogs, f.gross_profit, f.gross_margin_percent,
        f.total_discount_given, f.current_stock, f.stock_valuation_cost,
        f.turnover_ratio, f.days_sales_inventory, f.movement_classification,
        f.return_rate_percent, f.last_sale_date, f.last_purchase_date,
        st.total_count AS total_records,
        st.sum_rev AS summary_total_revenue,
        st.sum_cogs AS summary_total_cogs,
        st.sum_prof AS summary_total_profit,
        st.sum_val AS summary_stock_valuation
    FROM filtered f
    CROSS JOIN summary_totals st
    ORDER BY
        CASE WHEN p_view_type = 'profitability' THEN f.gross_profit END DESC NULLS LAST,
        CASE WHEN p_view_type = 'movement' THEN f.net_quantity_sold END DESC NULLS LAST,
        CASE WHEN p_view_type = 'velocity' THEN f.times_sold END DESC NULLS LAST,
        CASE WHEN p_view_type = 'slow_moving' THEN f.days_sales_inventory END DESC NULLS LAST,
        CASE WHEN p_view_type = 'dead_stock' THEN f.current_stock END DESC NULLS LAST,
        CASE WHEN p_view_type = 'returns' THEN f.return_rate_percent END DESC NULLS LAST,
        f.total_revenue DESC
    LIMIT v_limit
    OFFSET v_offset;
END;
$function$;

-- 6. get_entity_360_profile (uses fn_effective_line_cogs_base for product gross_profit)
CREATE OR REPLACE FUNCTION public.get_entity_360_profile(
  p_company_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_date_from date := COALESCE(p_date_from, CURRENT_DATE - INTERVAL '365 days');
    v_date_to date := COALESCE(p_date_to, CURRENT_DATE);
    v_result jsonb;
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    IF p_entity_type = 'customer' THEN
        SELECT jsonb_build_object(
            'profile', jsonb_build_object(
                'id', pty.id, 'name', pty.name, 'phone', pty.phone, 'type', pty.type,
                'status', pty.status, 'balance', COALESCE(pb.balance, 0),
                'credit_limit', pty.credit_limit, 'category', cat.name
            ),
            'kpis', (
                SELECT jsonb_build_object(
                    'total_sales', ROUND(COALESCE(SUM(CASE WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) WHEN inv.type IN ('sale_return', 'return_sale') THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0), 2),
                    'invoices_count', COUNT(DISTINCT inv.id) FILTER (WHERE inv.type = 'sale'),
                    'returns_count', COUNT(DISTINCT inv.id) FILTER (WHERE inv.type IN ('sale_return', 'return_sale')),
                    'avg_invoice', ROUND(COALESCE(AVG(public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)) FILTER (WHERE inv.type = 'sale'), 0), 2),
                    'total_paid', ROUND(GREATEST(
                        COALESCE((SELECT SUM(public.fn_to_base_amount(currency_code, amount, exchange_rate)) FROM public.payments WHERE party_id = p_entity_id AND company_id = p_company_id AND type = 'receipt' AND status = 'posted' AND deleted_at IS NULL AND payment_date BETWEEN v_date_from AND v_date_to), 0),
                        COALESCE(SUM(CASE WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, CASE WHEN inv.status = 'paid' AND COALESCE(inv.paid_amount, 0) = 0 THEN inv.total_amount ELSE COALESCE(inv.paid_amount, 0) END, inv.exchange_rate) ELSE 0 END), 0)
                    ), 2)
                )
                FROM public.invoices inv
                WHERE inv.party_id = p_entity_id
                  AND inv.company_id = p_company_id
                  AND inv.status IN ('posted', 'paid', 'partially_paid')
                  AND inv.deleted_at IS NULL
                  AND inv.issue_date BETWEEN v_date_from AND v_date_to
            ),
            'timeline', COALESCE((
                SELECT jsonb_agg(row_to_json(t) ORDER BY t.month ASC)
                FROM (
                    SELECT
                        to_char(inv.issue_date, 'YYYY-MM') AS month,
                        ROUND(SUM(CASE WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) WHEN inv.type IN ('sale_return', 'return_sale') THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 2) AS revenue,
                        COUNT(inv.id) AS invoices_count
                    FROM public.invoices inv
                    WHERE inv.party_id = p_entity_id
                      AND inv.company_id = p_company_id
                      AND inv.status IN ('posted', 'paid', 'partially_paid')
                      AND inv.deleted_at IS NULL
                      AND inv.issue_date BETWEEN v_date_from AND v_date_to
                    GROUP BY to_char(inv.issue_date, 'YYYY-MM')
                ) t
            ), '[]'::jsonb),
            'top_items', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'product_id', itm.product_id, 'product_name', prd.name_ar,
                        'part_number', COALESCE(NULLIF(TRIM(prd.part_number), ''), ''),
                        'brand', COALESCE(NULLIF(TRIM(prd.brand), ''), 'غير محدد'),
                        'total_quantity', itm.quantity, 'total_amount', ROUND(itm.total, 2)
                    )
                )
                FROM (
                    SELECT item.product_id, SUM(item.quantity) AS quantity, SUM(public.fn_to_base_amount(i.currency_code, item.total, i.exchange_rate)) AS total
                    FROM public.invoice_items item
                    JOIN public.invoices i ON i.id = item.invoice_id
                    WHERE i.party_id = p_entity_id AND i.company_id = p_company_id
                      AND i.status IN ('posted', 'paid', 'partially_paid') AND i.type = 'sale' AND i.deleted_at IS NULL
                    GROUP BY item.product_id
                    ORDER BY SUM(public.fn_to_base_amount(i.currency_code, item.total, i.exchange_rate)) DESC
                    LIMIT 5
                ) itm
                JOIN public.products prd ON prd.id = itm.product_id
            ),
            'recent_transactions', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', inv.id, 'invoice_number', inv.invoice_number, 'type', inv.type,
                        'issue_date', inv.issue_date,
                        'total_amount', public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate),
                        'status', inv.status
                    ) ORDER BY inv.issue_date DESC
                )
                FROM (
                    SELECT id, invoice_number, type, issue_date, total_amount, currency_code, exchange_rate, status
                    FROM public.invoices
                    WHERE party_id = p_entity_id AND company_id = p_company_id
                      AND status IN ('posted', 'paid', 'partially_paid') AND deleted_at IS NULL
                    ORDER BY issue_date DESC LIMIT 10
                ) inv
            )
        ) INTO v_result
        FROM public.parties pty
        LEFT JOIN public.party_categories cat ON cat.id = pty.category_id
        LEFT JOIN public.party_balances pb ON pb.party_id = pty.id AND pb.company_id = p_company_id
        WHERE pty.id = p_entity_id AND pty.company_id = p_company_id;

    ELSIF p_entity_type = 'supplier' THEN
        SELECT jsonb_build_object(
            'profile', jsonb_build_object(
                'id', pty.id, 'name', pty.name, 'phone', pty.phone, 'type', pty.type,
                'status', pty.status, 'balance', COALESCE(pb.balance, 0), 'category', cat.name
            ),
            'kpis', (
                SELECT jsonb_build_object(
                    'total_purchases', ROUND(COALESCE(SUM(CASE WHEN inv.type = 'purchase' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) WHEN inv.type IN ('purchase_return', 'return_purchase') THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0), 2),
                    'bills_count', COUNT(DISTINCT inv.id) FILTER (WHERE inv.type = 'purchase'),
                    'avg_bill', ROUND(COALESCE(AVG(public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)) FILTER (WHERE inv.type = 'purchase'), 0), 2),
                    'total_paid', ROUND(GREATEST(
                        COALESCE((SELECT SUM(public.fn_to_base_amount(currency_code, amount, exchange_rate)) FROM public.payments WHERE party_id = p_entity_id AND company_id = p_company_id AND type = 'disbursement' AND status = 'posted' AND deleted_at IS NULL AND payment_date BETWEEN v_date_from AND v_date_to), 0),
                        COALESCE(SUM(CASE WHEN inv.type = 'purchase' THEN public.fn_invoice_to_base_amount(inv.currency_code, CASE WHEN inv.status = 'paid' AND COALESCE(inv.paid_amount, 0) = 0 THEN inv.total_amount ELSE COALESCE(inv.paid_amount, 0) END, inv.exchange_rate) ELSE 0 END), 0)
                    ), 2)
                )
                FROM public.invoices inv
                WHERE inv.party_id = p_entity_id AND inv.company_id = p_company_id
                  AND inv.status IN ('posted', 'paid', 'partially_paid') AND inv.deleted_at IS NULL
                  AND inv.issue_date BETWEEN v_date_from AND v_date_to
            ),
            'timeline', COALESCE((
                SELECT jsonb_agg(row_to_json(t) ORDER BY t.month ASC)
                FROM (
                    SELECT
                        to_char(inv.issue_date, 'YYYY-MM') AS month,
                        ROUND(SUM(CASE WHEN inv.type = 'purchase' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) WHEN inv.type IN ('purchase_return', 'return_purchase') THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 2) AS purchases,
                        COUNT(inv.id) AS bills_count
                    FROM public.invoices inv
                    WHERE inv.party_id = p_entity_id AND inv.company_id = p_company_id
                      AND inv.status IN ('posted', 'paid', 'partially_paid') AND inv.deleted_at IS NULL
                      AND inv.issue_date BETWEEN v_date_from AND v_date_to
                    GROUP BY to_char(inv.issue_date, 'YYYY-MM')
                ) t
            ), '[]'::jsonb),
            'recent_transactions', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', inv.id, 'invoice_number', inv.invoice_number, 'type', inv.type,
                        'issue_date', inv.issue_date,
                        'total_amount', public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate),
                        'status', inv.status
                    ) ORDER BY inv.issue_date DESC
                )
                FROM (
                    SELECT id, invoice_number, type, issue_date, total_amount, currency_code, exchange_rate, status
                    FROM public.invoices
                    WHERE party_id = p_entity_id AND company_id = p_company_id
                      AND status IN ('posted', 'paid', 'partially_paid') AND deleted_at IS NULL
                    ORDER BY issue_date DESC LIMIT 10
                ) inv
            )
        ) INTO v_result
        FROM public.parties pty
        LEFT JOIN public.party_categories cat ON cat.id = pty.category_id
        LEFT JOIN public.party_balances pb ON pb.party_id = pty.id AND pb.company_id = p_company_id
        WHERE pty.id = p_entity_id AND pty.company_id = p_company_id;

    ELSIF p_entity_type = 'product' THEN
        SELECT jsonb_build_object(
            'profile', jsonb_build_object(
                'id', p.id, 'name_ar', p.name_ar, 'sku', p.sku, 'part_number', p.part_number,
                'alternative_numbers', p.alternative_numbers,
                'brand', COALESCE(NULLIF(TRIM(p.brand), ''), 'غير محدد'),
                'unit', COALESCE(NULLIF(TRIM(p.unit), ''), 'قطعة'),
                'sale_price', p.sale_price, 'cost_price', p.cost_price,
                'purchase_price', p.purchase_price, 'category', cat.name
            ),
            'stock', (
                SELECT jsonb_build_object(
                    'total_quantity', COALESCE(SUM(ps.quantity), 0),
                    'total_valuation', ROUND(COALESCE(SUM(ps.quantity), 0) * COALESCE(p.cost_price, p.purchase_price, 0), 2)
                )
                FROM public.product_stock ps
                WHERE ps.product_id = p_entity_id AND ps.company_id = p_company_id
            ),
            'kpis', (
                SELECT jsonb_build_object(
                    'total_sold_quantity', COALESCE(SUM(item.quantity) FILTER (WHERE i.type = 'sale'), 0),
                    'total_returned_quantity', COALESCE(SUM(item.quantity) FILTER (WHERE i.type IN ('sale_return', 'return_sale')), 0),
                    'total_revenue', ROUND(COALESCE(SUM(public.fn_to_base_amount(i.currency_code, item.total, i.exchange_rate)) FILTER (WHERE i.type = 'sale'), 0) - COALESCE(SUM(public.fn_to_base_amount(i.currency_code, item.total, i.exchange_rate)) FILTER (WHERE i.type IN ('sale_return', 'return_sale')), 0), 2),
                    'gross_profit', ROUND(
                        (COALESCE(SUM(public.fn_to_base_amount(i.currency_code, item.total, i.exchange_rate)) FILTER (WHERE i.type = 'sale'), 0) - COALESCE(SUM(public.fn_to_base_amount(i.currency_code, item.total, i.exchange_rate)) FILTER (WHERE i.type IN ('sale_return', 'return_sale')), 0)) -
                        (COALESCE(SUM(public.fn_effective_line_cogs_base(i.currency_code, i.exchange_rate, item.quantity, item.total, item.cost_price, p.cost_price, p.purchase_price)) FILTER (WHERE i.type = 'sale'), 0) -
                         COALESCE(SUM(public.fn_effective_line_cogs_base(i.currency_code, i.exchange_rate, item.quantity, item.total, item.cost_price, p.cost_price, p.purchase_price)) FILTER (WHERE i.type IN ('sale_return', 'return_sale')), 0)),
                    2)
                )
                FROM public.invoice_items item
                JOIN public.invoices i ON i.id = item.invoice_id
                WHERE item.product_id = p_entity_id
                  AND i.company_id = p_company_id
                  AND i.status IN ('posted', 'paid', 'partially_paid')
                  AND i.deleted_at IS NULL
                  AND i.issue_date BETWEEN v_date_from AND v_date_to
            ),
            'timeline', COALESCE((
                SELECT jsonb_agg(row_to_json(t) ORDER BY t.month ASC)
                FROM (
                    SELECT
                        to_char(i.issue_date, 'YYYY-MM') AS month,
                        SUM(CASE WHEN i.type = 'sale' THEN item.quantity ELSE -item.quantity END) AS quantity,
                        ROUND(SUM(CASE WHEN i.type = 'sale' THEN public.fn_to_base_amount(i.currency_code, item.total, i.exchange_rate) WHEN i.type IN ('sale_return', 'return_sale') THEN -public.fn_to_base_amount(i.currency_code, item.total, i.exchange_rate) ELSE 0 END), 2) AS revenue
                    FROM public.invoice_items item
                    JOIN public.invoices i ON i.id = item.invoice_id
                    WHERE item.product_id = p_entity_id
                      AND i.company_id = p_company_id
                      AND i.status IN ('posted', 'paid', 'partially_paid')
                      AND i.deleted_at IS NULL
                      AND i.issue_date BETWEEN v_date_from AND v_date_to
                    GROUP BY to_char(i.issue_date, 'YYYY-MM')
                ) t
            ), '[]'::jsonb)
        ) INTO v_result
        FROM public.products p
        LEFT JOIN public.product_categories cat ON cat.id = p.category_id
        WHERE p.id = p_entity_id AND p.company_id = p_company_id;
    END IF;

    RETURN v_result;
END;
$function$;

-- 7. get_top_products_and_customers (replaces old 0.70 fallback with canonical 0.80 / 20% profit)
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

  WITH item_base_calc AS (
    SELECT
      ii.product_id,
      i.type AS inv_type,
      ii.quantity,
      ii.total,
      COALESCE(i.currency_code, v_base_currency) AS curr_code,
      i.exchange_rate,
      ii.cost_price AS item_cost,
      prd.cost_price AS prod_cost,
      prd.purchase_price AS prod_purchase_cost
    FROM public.invoices i
    JOIN public.invoice_items ii
      ON ii.invoice_id = i.id
     AND ii.company_id = p_company_id
    LEFT JOIN public.products prd
      ON prd.id = ii.product_id
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
      SUM(CASE WHEN ibc.inv_type = 'sale' THEN (CASE WHEN UPPER(ibc.curr_code) = 'YER' THEN ibc.total ELSE ibc.total * v_yer_rate END)
               WHEN ibc.inv_type IN ('sale_return', 'return_sale') THEN -(CASE WHEN UPPER(ibc.curr_code) = 'YER' THEN ibc.total ELSE ibc.total * v_yer_rate END)
               ELSE 0 END) AS net_revenue_yer,
      SUM(CASE WHEN ibc.inv_type = 'sale' THEN
                 public.fn_effective_line_cogs_base(ibc.curr_code, ibc.exchange_rate, ibc.quantity, ibc.total, ibc.item_cost, ibc.prod_cost, ibc.prod_purchase_cost)
               WHEN ibc.inv_type IN ('sale_return', 'return_sale') THEN
                 -public.fn_effective_line_cogs_base(ibc.curr_code, ibc.exchange_rate, ibc.quantity, ibc.total, ibc.item_cost, ibc.prod_cost, ibc.prod_purchase_cost)
               ELSE 0 END) AS net_cost_base
    FROM item_base_calc ibc
    GROUP BY ibc.product_id
    HAVING SUM(CASE WHEN ibc.inv_type = 'sale' THEN ibc.quantity WHEN ibc.inv_type IN ('sale_return', 'return_sale') THEN -ibc.quantity ELSE 0 END) > 0
  ),
  top_p_ids AS (
    SELECT
      ps.product_id, ps.net_quantity, ps.net_revenue_base, ps.net_revenue_yer, ps.net_cost_base
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
      p.name_ar, p.part_number, p.brand, p.sku, p.sale_price, p.image_url, p.min_stock_level,
      cat.name AS category_name,
      COALESCE(stk.current_stock, 0) AS current_stock
    FROM top_p_ids tp
    JOIN public.products p ON p.id = tp.product_id
    LEFT JOIN public.product_categories cat ON cat.id = p.category_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(quantity), 0) AS current_stock
      FROM public.product_stock s
      WHERE s.product_id = tp.product_id AND s.company_id = p_company_id
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

  WITH customer_sales AS (
    SELECT
      i.party_id,
      SUM(
        CASE
          WHEN i.type = 'sale' THEN public.fn_invoice_to_base_amount(COALESCE(i.currency_code, v_base_currency), i.total_amount, i.exchange_rate)
          WHEN i.type IN ('sale_return', 'return_sale') THEN -public.fn_invoice_to_base_amount(COALESCE(i.currency_code, v_base_currency), i.total_amount, i.exchange_rate)
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
$function$;

-- 8. get_top_selling_products (3-arg overload)
CREATE OR REPLACE FUNCTION public.get_top_selling_products(
  p_company_id uuid,
  p_limit integer DEFAULT 10,
  p_days integer DEFAULT 30
)
RETURNS TABLE(id uuid, name_ar text, sku text, category_id uuid, total_sold numeric, total_revenue numeric, total_cost numeric, gross_profit numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  RETURN QUERY
  WITH recent_invoices AS (
    SELECT inv.id, inv.currency_code, inv.exchange_rate
    FROM public.invoices inv
    WHERE inv.company_id = p_company_id
      AND inv.type = 'sale'
      AND inv.status IN ('posted', 'paid', 'partially_paid')
      AND inv.deleted_at IS NULL
      AND inv.issue_date >= CURRENT_DATE - p_days
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
    ti.product_id AS id,
    p.name_ar,
    p.sku,
    p.category_id,
    ti.total_sold,
    ti.total_revenue,
    ti.total_cost,
    ROUND(ti.total_revenue - ti.total_cost, 2)::numeric AS gross_profit
  FROM top_items ti
  JOIN public.products p ON p.id = ti.product_id;
END;
$function$;

-- 9. get_top_selling_products (4-arg overload)
CREATE OR REPLACE FUNCTION public.get_top_selling_products(
  p_company_id uuid,
  p_limit integer DEFAULT 10,
  p_days integer DEFAULT 30,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(id uuid, name_ar text, sku text, category_id uuid, total_sold numeric, total_revenue numeric, total_cost numeric, gross_profit numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
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

-- 10. incentive_calculate_period (commissions gross_profit uses 20% margin for zero-cost items + base currency)
CREATE OR REPLACE FUNCTION public.incentive_calculate_period(p_company_id uuid, p_period_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_period record;
  v_actor uuid;
  v_count integer := 0;
  v_user record;
  v_rule record;
  v_tier record;
  v_tier_id uuid;
  v_calc_id uuid;
  v_gross_sales numeric(16,2);
  v_net_sales numeric(16,2);
  v_gross_profit numeric(16,2);
  v_collected numeric(16,2);
  v_invoice_count integer;
  v_customer_count integer;
  v_target_value numeric(14,2);
  v_target_pct numeric(7,2);
  v_base numeric(16,2);
  v_rule_amount numeric(16,2);
  v_base_commission numeric(16,2);
  v_bonus numeric(16,2);
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  IF NOT (public.user_is_admin_or_manager(p_company_id) OR public.has_permission('commission:calculate', p_company_id)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_period
  FROM public.incentive_periods
  WHERE id = p_period_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'period_not_found';
  END IF;

  PERFORM public.incentive_assert_period_allows(p_period_id, 'calculate');
  v_actor := public.incentive_actor(p_company_id);

  IF EXISTS (
    SELECT 1 FROM public.incentive_calculations
    WHERE company_id = p_company_id
      AND period_id = p_period_id
      AND status IN ('approved','partially_paid','paid','cancelled','reversed')
  ) THEN
    RAISE EXCEPTION 'period_has_immutable_calculations';
  END IF;

  UPDATE public.incentive_periods
     SET state = 'calculating', updated_at = now()
   WHERE id = p_period_id AND company_id = p_company_id;

  DELETE FROM public.incentive_calculations
   WHERE company_id = p_company_id
     AND period_id = p_period_id
     AND status IN ('draft','calculated','eligible');

  FOR v_user IN
    SELECT DISTINCT a.user_id, a.plan_id
    FROM public.incentive_assignments a
    JOIN public.incentive_plans p ON p.id = a.plan_id
      AND p.company_id = p_company_id
      AND p.status = 'active'
      AND p.deleted_at IS NULL
    WHERE a.company_id = p_company_id
      AND a.status = 'active'
      AND a.effective_from <= v_period.period_end
      AND (a.effective_to IS NULL OR a.effective_to >= v_period.period_start)
  LOOP
    SELECT
      COALESCE(SUM(COALESCE(i.subtotal, i.total_amount, 0) * l.allocation_pct / 100), 0),
      COALESCE(SUM(COALESCE(i.total_amount, 0) * l.allocation_pct / 100), 0),
      COALESCE(SUM(COALESCE(ii_metrics.gross_profit, 0) * l.allocation_pct / 100), 0),
      COALESCE(SUM(COALESCE(i.paid_amount, 0) * l.allocation_pct / 100), 0),
      COUNT(DISTINCT i.id),
      COUNT(DISTINCT i.party_id)
    INTO v_gross_sales, v_net_sales, v_gross_profit, v_collected,
         v_invoice_count, v_customer_count
    FROM public.incentive_engineer_links l
    JOIN public.invoices i ON i.id = l.invoice_id
      AND i.company_id = p_company_id
      AND i.type = 'sale'
      AND i.status NOT IN ('cancelled','void')
      AND i.deleted_at IS NULL
      AND i.issue_date BETWEEN v_period.period_start AND v_period.period_end
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(
        public.fn_to_base_amount(i.currency_code, COALESCE(ii.total, 0), i.exchange_rate) -
        public.fn_effective_line_cogs_base(i.currency_code, i.exchange_rate, ii.quantity, ii.total, ii.cost_price, prd.cost_price, prd.purchase_price)
      ), 0) AS gross_profit
      FROM public.invoice_items ii
      LEFT JOIN public.products prd ON prd.id = ii.product_id
      WHERE ii.invoice_id = i.id AND ii.company_id = p_company_id
    ) ii_metrics ON true
    WHERE l.company_id = p_company_id
      AND l.user_id = v_user.user_id
      AND l.status = 'assigned'
      AND l.allocation_status = 'assigned';

    IF v_invoice_count = 0 THEN
      CONTINUE;
    END IF;

    SELECT t.target_value
      INTO v_target_value
    FROM public.incentive_targets t
    WHERE t.company_id = p_company_id
      AND t.target_scope = 'employee'
      AND t.user_id = v_user.user_id
      AND t.status = 'active'
      AND t.period_start <= v_period.period_end
      AND t.period_end >= v_period.period_start
    ORDER BY t.period_start DESC
    LIMIT 1;

    v_target_pct := CASE
      WHEN COALESCE(v_target_value, 0) > 0 THEN ROUND((v_net_sales / v_target_value) * 100, 2)
      ELSE NULL
    END;
    v_base_commission := 0;
    v_bonus := 0;

    INSERT INTO public.incentive_calculations (
      company_id, period_id, plan_id, user_id,
      gross_sales, net_sales, gross_profit, collected_amount,
      invoice_count, customer_count, target_value, target_achievement_pct,
      base_commission, bonus_amount, adjustment_amount, deduction_amount,
      total_commission, currency_code, status, calculated_at, calculated_by
    )
    SELECT p_company_id, p_period_id, v_user.plan_id, v_user.user_id,
      v_gross_sales, v_net_sales, v_gross_profit, v_collected,
      v_invoice_count, v_customer_count, v_target_value, v_target_pct,
      0, 0, 0, 0, 0, p.currency_code, 'calculated', now(), v_actor
    FROM public.incentive_plans p
    WHERE p.id = v_user.plan_id
    RETURNING id INTO v_calc_id;

    FOR v_rule IN
      SELECT * FROM public.incentive_rules
      WHERE company_id = p_company_id
        AND plan_id = v_user.plan_id
        AND is_active = true
        AND deleted_at IS NULL
      ORDER BY priority, created_at, id
    LOOP
      v_tier := NULL;
      v_tier_id := NULL;
      v_base := CASE v_rule.rule_type
        WHEN 'sales' THEN v_gross_sales
        WHEN 'profit' THEN v_gross_profit
        WHEN 'collection' THEN v_collected
        WHEN 'invoice_count' THEN v_invoice_count
        WHEN 'customer_count' THEN v_customer_count
        WHEN 'target_achievement' THEN COALESCE(v_target_pct, 0)
        ELSE v_net_sales
      END;
      v_rule_amount := 0;

      IF v_rule.calculation_method = 'percentage' THEN
        v_rule_amount := ROUND(v_base * COALESCE(v_rule.rate, 0) / 100, 2);
      ELSIF v_rule.calculation_method = 'fixed_amount' THEN
        v_rule_amount := COALESCE(v_rule.fixed_amount, 0);
      ELSE
        SELECT * INTO v_tier
        FROM public.incentive_tiers
        WHERE company_id = p_company_id
          AND plan_id = v_user.plan_id
          AND (rule_id = v_rule.id OR rule_id IS NULL)
          AND v_base >= from_amount
          AND (to_amount IS NULL OR v_base <= to_amount)
        ORDER BY tier_order DESC
        LIMIT 1;
        IF FOUND THEN
          v_tier_id := v_tier.id;
          v_rule_amount := COALESCE(ROUND(v_base * v_tier.rate / 100, 2), v_tier.fixed_bonus, 0);
        END IF;
      END IF;

      IF v_rule_amount <> 0 THEN
        IF v_rule.rule_type = 'target_achievement' OR v_rule.calculation_method = 'tiered' THEN
          v_bonus := v_bonus + v_rule_amount;
        ELSE
          v_base_commission := v_base_commission + v_rule_amount;
        END IF;
        INSERT INTO public.incentive_calculation_lines (
          calculation_id, company_id, source_type, source_id, rule_id,
          tier_id, description, base_amount, rate, calculated_amount, currency_code
        )
        SELECT v_calc_id, p_company_id,
          CASE WHEN v_rule.rule_type = 'target_achievement' THEN 'target_bonus' ELSE 'invoice_sale' END,
          NULL, v_rule.id, v_tier_id, v_rule.name, v_base, v_rule.rate,
          v_rule_amount, p.currency_code
        FROM public.incentive_plans p
        WHERE p.id = v_user.plan_id;
      END IF;
    END LOOP;

    UPDATE public.incentive_calculations
       SET base_commission = v_base_commission,
           bonus_amount = v_bonus,
           total_commission = v_base_commission + v_bonus,
           updated_at = now()
     WHERE id = v_calc_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.incentive_periods
     SET state = 'calculated', calculated_at = now(), updated_at = now()
   WHERE id = p_period_id AND company_id = p_company_id;

  PERFORM public.incentive_log_audit(
    p_company_id,
    'CALCULATE',
    'incentive_period',
    p_period_id,
    jsonb_build_object('calculation_count', v_count, 'period_state', 'calculated')
  );

  RETURN v_count;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.incentive_periods
       SET state = 'open', updated_at = now()
     WHERE id = p_period_id AND company_id = p_company_id AND state = 'calculating';
    RAISE;
END;
$function$;

-- 11. fn_get_inventory_intelligence_snapshot (net_cogs_365 uses fn_effective_line_cogs_base)
CREATE OR REPLACE FUNCTION public.fn_get_inventory_intelligence_snapshot(
  p_company_id uuid,
  p_lookback_days integer DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_main_branch_id uuid;
  v_branches jsonb;
  v_products jsonb;
  v_sales_history jsonb;
  v_monthly_sales jsonb;
  v_supplier_history jsonb;
  v_open_pos jsonb;
  v_pending_transfers jsonb;
  v_fitments jsonb;
  v_cross_refs jsonb;
  v_stock_movements jsonb;
  v_supplier_constraints jsonb;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT id INTO v_main_branch_id
  FROM public.branches
  WHERE company_id = p_company_id AND is_main = true
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(b_row ORDER BY b_row.is_main DESC, b_row.name), '[]'::jsonb)
  INTO v_branches
  FROM (
    SELECT
      b.id, b.name, b.code, b.is_main,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', w.id, 'name_ar', w.name_ar, 'is_primary', w.is_primary))
        FROM public.warehouses w
        WHERE w.company_id = p_company_id AND w.branch_id = b.id AND w.deleted_at IS NULL
      ), '[]'::jsonb) AS warehouses
    FROM public.branches b
    WHERE b.company_id = p_company_id
  ) b_row;

  SELECT COALESCE(jsonb_agg(p_row), '[]'::jsonb)
  INTO v_products
  FROM (
    SELECT
      p.id, p.name_ar, p.sku, p.part_number, p.alternative_numbers, p.brand,
      p.origin_country, p.quality_grade, p.classification_status, p.created_at,
      p.item_type, p.min_stock_level, p.cost_price, p.purchase_price, p.sale_price,
      p.category_id, pc.name AS category_name,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'warehouse_id', ps.warehouse_id,
          'branch_id', w.branch_id,
          'quantity', ps.quantity,
          'reserved_quantity', COALESCE(ps.reserved_quantity, 0),
          'damaged_quantity', COALESCE(ps.damaged_quantity, 0),
          'weighted_avg_cost', COALESCE(NULLIF(ps.weighted_avg_cost, 0), p.cost_price, p.purchase_price, 0)
        ))
        FROM public.product_stock ps
        JOIN public.warehouses w ON w.id = ps.warehouse_id AND w.deleted_at IS NULL
        WHERE ps.company_id = p_company_id AND ps.product_id = p.id
      ), '[]'::jsonb) AS stock_by_warehouse
    FROM public.products p
    LEFT JOIN public.product_categories pc ON pc.id = p.category_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND COALESCE(p.item_type, 'stock') <> 'service'
  ) p_row;

  SELECT COALESCE(jsonb_agg(s_row), '[]'::jsonb)
  INTO v_sales_history
  FROM (
    SELECT
      ii.product_id,
      COALESCE(i.branch_id, v_main_branch_id) AS branch_id,
      SUM(CASE WHEN i.type = 'sale' THEN ii.quantity ELSE -ii.quantity END) AS net_qty_365,
      SUM(CASE WHEN i.issue_date >= CURRENT_DATE - 180 THEN CASE WHEN i.type = 'sale' THEN ii.quantity ELSE -ii.quantity END ELSE 0 END) AS net_qty_180,
      SUM(CASE WHEN i.issue_date >= CURRENT_DATE - 90  THEN CASE WHEN i.type = 'sale' THEN ii.quantity ELSE -ii.quantity END ELSE 0 END) AS net_qty_90,
      SUM(CASE WHEN i.issue_date >= CURRENT_DATE - 30  THEN CASE WHEN i.type = 'sale' THEN ii.quantity ELSE -ii.quantity END ELSE 0 END) AS net_qty_30,
      SUM(CASE WHEN i.issue_date >= CURRENT_DATE - 7   THEN CASE WHEN i.type = 'sale' THEN ii.quantity ELSE -ii.quantity END ELSE 0 END) AS net_qty_7,
      SUM(CASE WHEN i.type = 'sale' THEN public.fn_to_base_amount(i.currency_code, ii.total, i.exchange_rate) ELSE -public.fn_to_base_amount(i.currency_code, ii.total, i.exchange_rate) END) AS net_revenue_365,
      SUM(CASE WHEN i.type = 'sale' THEN public.fn_effective_line_cogs_base(i.currency_code, i.exchange_rate, ii.quantity, ii.total, ii.cost_price, p.cost_price, p.purchase_price) ELSE -public.fn_effective_line_cogs_base(i.currency_code, i.exchange_rate, ii.quantity, ii.total, ii.cost_price, p.cost_price, p.purchase_price) END) AS net_cogs_365,
      COUNT(DISTINCT CASE WHEN i.type = 'sale' THEN i.id END) AS sale_tx_count,
      COUNT(DISTINCT CASE WHEN i.type = 'sale' THEN i.issue_date END) AS demand_days_count,
      SUM(CASE WHEN i.type IN ('sale_return', 'sales_return', 'return_sale') THEN ii.quantity ELSE 0 END) AS returned_qty,
      MAX(CASE WHEN i.type = 'sale' THEN i.issue_date END) AS last_sale_date,
      MIN(CASE WHEN i.type = 'sale' THEN i.issue_date END) AS first_sale_date
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    JOIN public.products p ON p.id = ii.product_id
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.type IN ('sale', 'sale_return', 'sales_return', 'return_sale')
      AND i.issue_date >= CURRENT_DATE - GREATEST(p_lookback_days, 365)
      AND ii.product_id IS NOT NULL
    GROUP BY ii.product_id, COALESCE(i.branch_id, v_main_branch_id)
  ) s_row;

  SELECT COALESCE(jsonb_agg(m_row), '[]'::jsonb)
  INTO v_monthly_sales
  FROM (
    SELECT
      ii.product_id,
      COALESCE(i.branch_id, v_main_branch_id) AS branch_id,
      to_char(date_trunc('month', i.issue_date), 'YYYY-MM') AS month_key,
      SUM(CASE WHEN i.type = 'sale' THEN ii.quantity ELSE -ii.quantity END) AS net_qty
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.type IN ('sale', 'sale_return', 'sales_return', 'return_sale')
      AND i.issue_date >= CURRENT_DATE - 365
      AND ii.product_id IS NOT NULL
    GROUP BY ii.product_id, COALESCE(i.branch_id, v_main_branch_id), date_trunc('month', i.issue_date)
  ) m_row;

  SELECT COALESCE(jsonb_agg(sup_row), '[]'::jsonb)
  INTO v_supplier_history
  FROM (
    WITH grn_per_po_prod AS (
      SELECT grn.po_id, gri.product_id, SUM(gri.accepted_quantity) AS accepted_qty, MAX(grn.receipt_date) AS latest_receipt_date
      FROM public.prc_goods_receipt_items gri
      JOIN public.prc_goods_receipts grn ON grn.grn_id = gri.grn_id
      WHERE grn.company_id = p_company_id AND grn.status <> 'cancelled' AND gri.product_id IS NOT NULL
      GROUP BY grn.po_id, gri.product_id
    ),
    po_per_po_prod AS (
      SELECT po.po_id, po.supplier_id, poi.product_id, COALESCE(po.issue_date::timestamptz, po.created_at) AS po_start_at, SUM(poi.quantity) AS ordered_qty
      FROM public.prc_purchase_order_items poi
      JOIN public.prc_purchase_orders po ON po.po_id = poi.po_id
      WHERE po.company_id = p_company_id AND poi.product_id IS NOT NULL
      GROUP BY po.po_id, po.supplier_id, poi.product_id, COALESCE(po.issue_date::timestamptz, po.created_at)
    ),
    po_lead AS (
      SELECT p.product_id, p.supplier_id,
        AVG(EXTRACT(EPOCH FROM (g.latest_receipt_date - p.po_start_at)) / 86400.0) AS measured_lead_days,
        SUM(g.accepted_qty) AS total_grn_received, SUM(p.ordered_qty) AS total_po_ordered
      FROM po_per_po_prod p
      JOIN grn_per_po_prod g ON g.po_id = p.po_id AND g.product_id = p.product_id
      WHERE g.latest_receipt_date >= p.po_start_at
      GROUP BY p.product_id, p.supplier_id
    ),
    pur_returns AS (
      SELECT ii.product_id, i.party_id AS supplier_id, COUNT(DISTINCT i.id) AS return_tx_count, SUM(ii.quantity) AS returned_qty
      FROM public.invoice_items ii
      JOIN public.invoices i ON i.id = ii.invoice_id
      WHERE i.company_id = p_company_id AND i.deleted_at IS NULL
        AND i.status IN ('posted', 'paid', 'partially_paid')
        AND i.type IN ('purchase_return', 'purchases_return', 'return_purchase')
        AND ii.product_id IS NOT NULL AND i.party_id IS NOT NULL
      GROUP BY ii.product_id, i.party_id
    )
    SELECT
      ii.product_id, i.party_id AS supplier_id,
      COALESCE(pt.name, 'مورد غير محدد') AS supplier_name,
      COUNT(DISTINCT i.id) AS purchase_tx_count,
      SUM(ii.quantity) AS total_qty_supplied,
      AVG(ii.unit_price) AS avg_unit_price,
      (ARRAY_AGG(ii.unit_price ORDER BY i.issue_date DESC, i.created_at DESC))[1] AS last_unit_price,
      (ARRAY_AGG(ii.quantity ORDER BY i.issue_date DESC, i.created_at DESC))[1] AS last_qty,
      MAX(i.issue_date) AS last_purchase_date,
      pl.measured_lead_days,
      CASE WHEN pl.total_po_ordered > 0 THEN LEAST(100, (pl.total_grn_received / pl.total_po_ordered) * 100) ELSE NULL END AS fulfillment_rate_pct,
      COALESCE(pr.return_tx_count, 0) AS return_count,
      COALESCE(pr.returned_qty, 0) AS returned_qty
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    LEFT JOIN public.parties pt ON pt.id = i.party_id
    LEFT JOIN po_lead pl ON pl.product_id = ii.product_id AND pl.supplier_id = i.party_id
    LEFT JOIN pur_returns pr ON pr.product_id = ii.product_id AND pr.supplier_id = i.party_id
    WHERE i.company_id = p_company_id AND i.deleted_at IS NULL
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.type = 'purchase' AND ii.product_id IS NOT NULL AND i.party_id IS NOT NULL
    GROUP BY ii.product_id, i.party_id, pt.name, pl.measured_lead_days, pl.total_grn_received, pl.total_po_ordered, pr.return_tx_count, pr.returned_qty
  ) sup_row;

  SELECT COALESCE(jsonb_agg(po_row), '[]'::jsonb)
  INTO v_open_pos
  FROM (
    SELECT poi.product_id, SUM(GREATEST(poi.quantity - COALESCE(poi.received_quantity, 0), 0)) AS incoming_qty, MIN(po.expected_delivery_date) AS earliest_eta
    FROM public.prc_purchase_order_items poi
    JOIN public.prc_purchase_orders po ON po.po_id = poi.po_id
    WHERE po.company_id = p_company_id AND po.status IN ('approved', 'issued', 'confirmed', 'partially_received') AND poi.product_id IS NOT NULL
    GROUP BY poi.product_id
    HAVING SUM(GREATEST(poi.quantity - COALESCE(poi.received_quantity, 0), 0)) > 0
  ) po_row;

  SELECT COALESCE(jsonb_agg(tr_row), '[]'::jsonb)
  INTO v_pending_transfers
  FROM (
    SELECT sti.product_id, fw.branch_id AS from_branch_id, tw.branch_id AS to_branch_id, SUM(sti.quantity) AS quantity
    FROM public.stock_transfer_items sti
    JOIN public.stock_transfers st ON st.id = sti.transfer_id
    JOIN public.warehouses fw ON fw.id = st.from_warehouse_id
    JOIN public.warehouses tw ON tw.id = st.to_warehouse_id
    WHERE st.company_id = p_company_id AND st.status IN ('pending', 'in_transit', 'approved') AND st.reversed_at IS NULL
    GROUP BY sti.product_id, fw.branch_id, tw.branch_id
  ) tr_row;

  SELECT COALESCE(jsonb_agg(fit_row), '[]'::jsonb)
  INTO v_fitments
  FROM (
    SELECT pf.product_id, v.make, v.model, v.year_start, v.year_end, v.engine
    FROM public.product_fitment pf
    JOIN public.vehicles v ON v.id = pf.vehicle_id AND v.deleted_at IS NULL
    WHERE pf.company_id = p_company_id AND pf.deleted_at IS NULL
  ) fit_row;

  SELECT COALESCE(jsonb_agg(mv_row), '[]'::jsonb)
  INTO v_stock_movements
  FROM (
    SELECT it.product_id, COALESCE(w.branch_id, v_main_branch_id) AS branch_id,
      MAX(CASE WHEN it.quantity > 0 THEN it.created_at END) AS last_receipt_at,
      COUNT(*) AS ledger_tx_count,
      COUNT(DISTINCT CASE WHEN it.quantity < 0 THEN it.created_at::date END) AS issue_days_count
    FROM public.inventory_transactions it
    JOIN public.warehouses w ON w.id = it.warehouse_id
    WHERE it.company_id = p_company_id AND it.deleted_at IS NULL AND it.created_at >= now() - interval '365 days'
    GROUP BY it.product_id, COALESCE(w.branch_id, v_main_branch_id)
  ) mv_row;

  SELECT COALESCE(jsonb_agg(sc_row), '[]'::jsonb)
  INTO v_supplier_constraints
  FROM (
    SELECT sp.product_id, sp.supplier_id, sp.minimum_order_quantity, sp.order_multiple, sp.lead_time_days, u.uom_name, u.conversion_factor
    FROM public.prc_supplier_products sp
    LEFT JOIN LATERAL (
      SELECT pu.uom_name, pu.conversion_factor FROM public.product_uoms pu
      WHERE pu.product_id = sp.product_id ORDER BY pu.conversion_factor DESC LIMIT 1
    ) u ON true
    WHERE sp.company_id = p_company_id AND sp.is_active = true
  ) sc_row;

  SELECT COALESCE(jsonb_agg(cr_row), '[]'::jsonb)
  INTO v_cross_refs
  FROM (
    SELECT cr.id, cr.base_product_id, cr.alternative_product_id, cr.match_quality, cr.relationship_type, cr.status, cr.confidence, cr.source, cr.notes
    FROM public.product_cross_references cr
    WHERE cr.company_id = p_company_id
  ) cr_row;

  RETURN jsonb_build_object(
    'branches', v_branches,
    'products', v_products,
    'sales_history', v_sales_history,
    'monthly_sales', v_monthly_sales,
    'supplier_history', v_supplier_history,
    'open_pos', v_open_pos,
    'pending_transfers', v_pending_transfers,
    'fitments', v_fitments,
    'stock_movements', v_stock_movements,
    'supplier_constraints', v_supplier_constraints,
    'cross_references', v_cross_refs,
    'generated_at', now()
  );
END;
$function$;
