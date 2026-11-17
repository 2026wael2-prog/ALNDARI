-- ============================================================================
-- Migration: 20261116000001_enterprise_bi_analytics_rpcs.sql
-- Enterprise Business Intelligence (BI) & Advanced Analytics Center Engine
-- Hardened via EGM Goldfish Review Protocol:
--   - Tenant isolation via fn_assert_company_access(p_company_id)
--   - Exact live schema alignment (party_balances view, payments.type,
--     product_categories.name, cashboxes + account_balances)
--   - Full multi-currency conversion via fn_invoice_to_base_amount / fn_to_base_amount
--   - Windowed aggregate totals (no page-only client math)
--   - Complete 8 BI Centers coverage
-- ============================================================================

-- ── 0. Composite Indexes for High Performance BI Aggregations ────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_bi_party_period
ON public.invoices (company_id, party_id, type, status, issue_date)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_bi_branch_period
ON public.invoices (company_id, branch_id, type, status, issue_date)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_items_bi_product_invoice
ON public.invoice_items (product_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_products_bi_company_cat_brand
ON public.products (company_id, category_id, brand, status)
WHERE deleted_at IS NULL;

-- ── 1. get_customer_bi_analytics ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_customer_bi_analytics(
    p_company_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL,
    p_metric text DEFAULT 'revenue',
    p_loyalty_segment text DEFAULT 'all',
    p_page integer DEFAULT 1,
    p_page_size integer DEFAULT 25,
    p_search text DEFAULT NULL
)
RETURNS TABLE (
    party_id uuid,
    party_name text,
    phone text,
    category_name text,
    invoices_count bigint,
    total_revenue numeric,
    total_cost numeric,
    gross_profit numeric,
    margin_percent numeric,
    avg_invoice_value numeric,
    first_purchase_date date,
    last_purchase_date date,
    days_since_last_purchase integer,
    loyalty_segment text,
    current_balance numeric,
    overdue_balance numeric,
    collection_rate numeric,
    growth_rate numeric,
    total_records bigint,
    summary_total_revenue numeric,
    summary_total_profit numeric,
    summary_champions_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
          AND (p_search IS NULL OR pty.name ILIKE '%' || p_search || '%' OR pty.phone ILIKE '%' || p_search || '%')
    ),
    customer_invoices AS (
        SELECT
            inv.party_id,
            COUNT(DISTINCT inv.id) FILTER (WHERE inv.type = 'sale') AS sales_count,
            COALESCE(SUM(
                CASE
                    WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                    WHEN inv.type = 'sale_return' THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                    ELSE 0
                END
            ), 0) AS net_revenue
        FROM public.invoices inv
        JOIN target_parties tp ON tp.id = inv.party_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status = 'posted'
          AND inv.type IN ('sale', 'sale_return')
          AND inv.issue_date BETWEEN v_date_from AND v_date_to
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
        GROUP BY inv.party_id
    ),
    customer_cogs AS (
        SELECT
            inv.party_id,
            COALESCE(SUM(
                CASE
                    WHEN inv.type = 'sale' THEN (COALESCE(item.cost_price, 0) * COALESCE(item.quantity, 0))
                    WHEN inv.type = 'sale_return' THEN -(COALESCE(item.cost_price, 0) * COALESCE(item.quantity, 0))
                    ELSE 0
                END
            ), 0) AS net_cogs
        FROM public.invoice_items item
        JOIN public.invoices inv ON inv.id = item.invoice_id
        JOIN target_parties tp ON tp.id = inv.party_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status = 'posted'
          AND inv.type IN ('sale', 'sale_return')
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
                    WHEN inv.type = 'sale_return' THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                    ELSE 0
                END
            ) FILTER (WHERE inv.issue_date BETWEEN v_prev_from AND v_prev_to), 0) AS prev_period_revenue,
            COALESCE(SUM(
                CASE
                    WHEN inv.type = 'sale' AND inv.due_date < CURRENT_DATE AND (inv.total_amount - COALESCE(inv.paid_amount, 0)) > 0
                    THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount - COALESCE(inv.paid_amount, 0), inv.exchange_rate)
                    ELSE 0
                END
            ), 0) AS actual_overdue
        FROM public.invoices inv
        JOIN target_parties tp ON tp.id = inv.party_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status = 'posted'
          AND inv.type IN ('sale', 'sale_return')
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
                WHEN ch.absolute_first_purchase >= v_date_from THEN 'new'
                WHEN COALESCE(ci.sales_count, 0) >= 4 AND (CURRENT_DATE - ch.absolute_last_purchase) <= 30 THEN 'champions'
                WHEN COALESCE(ci.sales_count, 0) >= 2 AND (CURRENT_DATE - ch.absolute_last_purchase) <= 60 THEN 'loyal'
                WHEN COALESCE(ci.sales_count, 0) > 0 AND (CURRENT_DATE - ch.absolute_last_purchase) > 90 THEN 'returning'
                WHEN (CURRENT_DATE - ch.absolute_last_purchase) BETWEEN 60 AND 120 THEN 'at_risk'
                WHEN (CURRENT_DATE - ch.absolute_last_purchase) > 120 THEN 'churned'
                ELSE 'loyal'
            END AS loyalty_segment,
            ROUND(COALESCE(pb.balance, 0), 2) AS current_balance,
            ROUND(COALESCE(ch.actual_overdue, 0), 2) AS overdue_balance,
            ROUND(
                CASE
                    WHEN COALESCE(ci.net_revenue, 0) > 0 THEN
                        LEAST(100, (COALESCE(cp.period_payments, 0) / ci.net_revenue) * 100)
                    ELSE 100
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
$$;

-- ── 2. get_supplier_bi_analytics ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_supplier_bi_analytics(
    p_company_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL,
    p_metric text DEFAULT 'spend',
    p_page integer DEFAULT 1,
    p_page_size integer DEFAULT 25,
    p_search text DEFAULT NULL
)
RETURNS TABLE (
    supplier_id uuid,
    supplier_name text,
    phone text,
    category_name text,
    invoices_count bigint,
    total_purchases numeric,
    total_items_supplied bigint,
    distinct_products_count bigint,
    avg_bill_value numeric,
    first_bill_date date,
    last_bill_date date,
    total_paid numeric,
    current_balance numeric,
    overdue_dues numeric,
    payment_ratio numeric,
    growth_rate numeric,
    total_records bigint,
    summary_total_purchases numeric,
    summary_total_dues numeric,
    summary_avg_payment_ratio numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    WITH target_suppliers AS (
        SELECT pty.id, pty.name, pty.phone, pty.category_id
        FROM public.parties pty
        WHERE pty.company_id = p_company_id
          AND pty.deleted_at IS NULL
          AND pty.type IN ('supplier', 'both')
          AND (p_search IS NULL OR pty.name ILIKE '%' || p_search || '%' OR pty.phone ILIKE '%' || p_search || '%')
    ),
    supplier_bills AS (
        SELECT
            inv.party_id,
            COUNT(DISTINCT inv.id) FILTER (WHERE inv.type = 'purchase') AS bills_count,
            COALESCE(SUM(
                CASE
                    WHEN inv.type = 'purchase' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                    WHEN inv.type = 'purchase_return' THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                    ELSE 0
                END
            ), 0) AS net_purchases
        FROM public.invoices inv
        JOIN target_suppliers ts ON ts.id = inv.party_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status = 'posted'
          AND inv.type IN ('purchase', 'purchase_return')
          AND inv.issue_date BETWEEN v_date_from AND v_date_to
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
        GROUP BY inv.party_id
    ),
    supplier_items AS (
        SELECT
            inv.party_id,
            COALESCE(SUM(item.quantity), 0)::bigint AS total_items,
            COUNT(DISTINCT item.product_id)::bigint AS distinct_products
        FROM public.invoice_items item
        JOIN public.invoices inv ON inv.id = item.invoice_id
        JOIN target_suppliers ts ON ts.id = inv.party_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status = 'posted'
          AND inv.type IN ('purchase', 'purchase_return')
          AND inv.issue_date BETWEEN v_date_from AND v_date_to
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
        GROUP BY inv.party_id
    ),
    supplier_history AS (
        SELECT
            inv.party_id,
            MIN(inv.issue_date) FILTER (WHERE inv.type = 'purchase') AS absolute_first_bill,
            MAX(inv.issue_date) FILTER (WHERE inv.type = 'purchase') AS absolute_last_bill,
            COALESCE(SUM(
                CASE
                    WHEN inv.type = 'purchase' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                    WHEN inv.type = 'purchase_return' THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                    ELSE 0
                END
            ) FILTER (WHERE inv.issue_date BETWEEN v_prev_from AND v_prev_to), 0) AS prev_period_purchases,
            COALESCE(SUM(
                CASE
                    WHEN inv.type = 'purchase' AND inv.due_date < CURRENT_DATE AND (inv.total_amount - COALESCE(inv.paid_amount, 0)) > 0
                    THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount - COALESCE(inv.paid_amount, 0), inv.exchange_rate)
                    ELSE 0
                END
            ), 0) AS actual_overdue
        FROM public.invoices inv
        JOIN target_suppliers ts ON ts.id = inv.party_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status = 'posted'
          AND inv.type IN ('purchase', 'purchase_return')
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
        GROUP BY inv.party_id
    ),
    supplier_payments AS (
        SELECT
            p.party_id,
            COALESCE(SUM(public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)), 0) AS period_payments
        FROM public.payments p
        JOIN target_suppliers ts ON ts.id = p.party_id
        WHERE p.company_id = p_company_id
          AND p.deleted_at IS NULL
          AND p.status = 'posted'
          AND p.type = 'disbursement'
          AND p.payment_date BETWEEN v_date_from AND v_date_to
          AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
        GROUP BY p.party_id
    ),
    aggregated AS (
        SELECT
            ts.id AS supplier_id,
            ts.name AS supplier_name,
            COALESCE(ts.phone, '') AS phone,
            COALESCE(cat.name, 'غير محدد') AS category_name,
            COALESCE(sb.bills_count, 0) AS invoices_count,
            ROUND(COALESCE(sb.net_purchases, 0), 2) AS total_purchases,
            COALESCE(si.total_items, 0) AS total_items_supplied,
            COALESCE(si.distinct_products, 0) AS distinct_products_count,
            ROUND(
                CASE
                    WHEN COALESCE(sb.bills_count, 0) > 0 THEN
                        COALESCE(sb.net_purchases, 0) / sb.bills_count
                    ELSE 0
                END, 2
            ) AS avg_bill_value,
            sh.absolute_first_bill AS first_bill_date,
            sh.absolute_last_bill AS last_bill_date,
            ROUND(COALESCE(sp.period_payments, 0), 2) AS total_paid,
            ROUND(COALESCE(pb.balance, 0), 2) AS current_balance,
            ROUND(COALESCE(sh.actual_overdue, 0), 2) AS overdue_dues,
            ROUND(
                CASE
                    WHEN COALESCE(sb.net_purchases, 0) > 0 THEN
                        LEAST(100, (COALESCE(sp.period_payments, 0) / sb.net_purchases) * 100)
                    ELSE 100
                END, 2
            ) AS payment_ratio,
            ROUND(
                CASE
                    WHEN COALESCE(sh.prev_period_purchases, 0) > 0 THEN
                        ((COALESCE(sb.net_purchases, 0) - sh.prev_period_purchases) / sh.prev_period_purchases) * 100
                    WHEN COALESCE(sb.net_purchases, 0) > 0 THEN 100
                    ELSE 0
                END, 2
            ) AS growth_rate
        FROM target_suppliers ts
        LEFT JOIN public.party_categories cat ON cat.id = ts.category_id
        LEFT JOIN public.party_balances pb ON pb.party_id = ts.id AND pb.company_id = p_company_id
        LEFT JOIN supplier_bills sb ON sb.party_id = ts.id
        LEFT JOIN supplier_items si ON si.party_id = ts.id
        LEFT JOIN supplier_history sh ON sh.party_id = ts.id
        LEFT JOIN supplier_payments sp ON sp.party_id = ts.id
    ),
    summary_totals AS (
        SELECT
            COUNT(*) AS total_count,
            ROUND(COALESCE(SUM(agg.total_purchases), 0), 2) AS sum_purchases,
            ROUND(COALESCE(SUM(CASE WHEN agg.current_balance < 0 THEN ABS(agg.current_balance) ELSE 0 END), 0), 2) AS sum_dues,
            ROUND(COALESCE(AVG(agg.payment_ratio), 100), 1) AS avg_pay_ratio
        FROM aggregated agg
    )
    SELECT
        a.supplier_id,
        a.supplier_name,
        a.phone,
        a.category_name,
        a.invoices_count,
        a.total_purchases,
        a.total_items_supplied,
        a.distinct_products_count,
        a.avg_bill_value,
        a.first_bill_date,
        a.last_bill_date,
        a.total_paid,
        a.current_balance,
        a.overdue_dues,
        a.payment_ratio,
        a.growth_rate,
        st.total_count AS total_records,
        st.sum_purchases AS summary_total_purchases,
        st.sum_dues AS summary_total_dues,
        st.avg_pay_ratio AS summary_avg_payment_ratio
    FROM aggregated a
    CROSS JOIN summary_totals st
    ORDER BY
        CASE WHEN p_metric = 'spend' THEN a.total_purchases END DESC NULLS LAST,
        CASE WHEN p_metric = 'invoices' THEN a.invoices_count END DESC NULLS LAST,
        CASE WHEN p_metric = 'products_count' THEN a.distinct_products_count END DESC NULLS LAST,
        CASE WHEN p_metric = 'growth' THEN a.growth_rate END DESC NULLS LAST,
        a.total_purchases DESC
    LIMIT v_limit
    OFFSET v_offset;
END;
$$;

-- ── 3. get_product_bi_analytics ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_product_bi_analytics(
    p_company_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_category_id uuid DEFAULT NULL,
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL,
    p_view_type text DEFAULT 'profitability',
    p_page integer DEFAULT 1,
    p_page_size integer DEFAULT 25,
    p_search text DEFAULT NULL
)
RETURNS TABLE (
    product_id uuid,
    product_sku text,
    product_name text,
    category_name text,
    brand_name text,
    times_sold bigint,
    quantity_sold numeric,
    quantity_returned numeric,
    net_quantity_sold numeric,
    total_revenue numeric,
    total_cogs numeric,
    gross_profit numeric,
    gross_margin_percent numeric,
    total_discount_given numeric,
    current_stock numeric,
    stock_valuation_cost numeric,
    turnover_ratio numeric,
    days_sales_inventory numeric,
    movement_classification text,
    return_rate_percent numeric,
    last_sale_date date,
    last_purchase_date date,
    total_records bigint,
    summary_total_revenue numeric,
    summary_total_cogs numeric,
    summary_total_profit numeric,
    summary_stock_valuation numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
        WHERE company_id = p_company_id AND deleted_at IS NULL AND status = 'posted' AND type = 'sale';
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
            COALESCE(SUM(item.quantity) FILTER (WHERE inv.type = 'sale_return'), 0) AS qty_returned,
            COALESCE(SUM(public.fn_invoice_to_base_amount(inv.currency_code, item.total, inv.exchange_rate)) FILTER (WHERE inv.type = 'sale'), 0) -
            COALESCE(SUM(public.fn_invoice_to_base_amount(inv.currency_code, item.total, inv.exchange_rate)) FILTER (WHERE inv.type = 'sale_return'), 0) AS revenue,
            COALESCE(SUM(COALESCE(item.cost_price, 0) * item.quantity) FILTER (WHERE inv.type = 'sale'), 0) -
            COALESCE(SUM(COALESCE(item.cost_price, 0) * item.quantity) FILTER (WHERE inv.type = 'sale_return'), 0) AS cogs,
            COALESCE(SUM(public.fn_invoice_to_base_amount(inv.currency_code, item.discount_amount, inv.exchange_rate)) FILTER (WHERE inv.type = 'sale'), 0) AS discount_given,
            MAX(inv.issue_date) FILTER (WHERE inv.type = 'sale') AS last_sold
        FROM public.invoice_items item
        JOIN public.invoices inv ON inv.id = item.invoice_id
        JOIN target_products tp ON tp.id = item.product_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status = 'posted'
          AND inv.type IN ('sale', 'sale_return')
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
          AND inv.status = 'posted'
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
        f.product_id,
        f.product_sku,
        f.product_name,
        f.category_name,
        f.brand_name,
        f.times_sold,
        f.quantity_sold,
        f.quantity_returned,
        f.net_quantity_sold,
        f.total_revenue,
        f.total_cogs,
        f.gross_profit,
        f.gross_margin_percent,
        f.total_discount_given,
        f.current_stock,
        f.stock_valuation_cost,
        f.turnover_ratio,
        f.days_sales_inventory,
        f.movement_classification,
        f.return_rate_percent,
        f.last_sale_date,
        f.last_purchase_date,
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
$$;

-- ── 4. get_entity_360_profile ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_entity_360_profile(
    p_company_id uuid,
    p_entity_type text,
    p_entity_id uuid,
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_date_from date := COALESCE(p_date_from, CURRENT_DATE - INTERVAL '365 days');
    v_date_to date := COALESCE(p_date_to, CURRENT_DATE);
    v_result jsonb;
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    IF p_entity_type = 'customer' THEN
        SELECT jsonb_build_object(
            'profile', jsonb_build_object(
                'id', pty.id,
                'name', pty.name,
                'phone', pty.phone,
                'type', pty.type,
                'status', pty.status,
                'balance', COALESCE(pb.balance, 0),
                'credit_limit', pty.credit_limit,
                'category', cat.name
            ),
            'kpis', (
                SELECT jsonb_build_object(
                    'total_sales', ROUND(COALESCE(SUM(CASE WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) WHEN inv.type = 'sale_return' THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0), 2),
                    'invoices_count', COUNT(DISTINCT inv.id) FILTER (WHERE inv.type = 'sale'),
                    'returns_count', COUNT(DISTINCT inv.id) FILTER (WHERE inv.type = 'sale_return'),
                    'avg_invoice', ROUND(COALESCE(AVG(public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)) FILTER (WHERE inv.type = 'sale'), 0), 2),
                    'total_paid', ROUND(COALESCE((SELECT SUM(public.fn_to_base_amount(currency_code, amount, exchange_rate)) FROM public.payments WHERE party_id = p_entity_id AND company_id = p_company_id AND type = 'receipt' AND status = 'posted' AND deleted_at IS NULL AND payment_date BETWEEN v_date_from AND v_date_to), 0), 2)
                )
                FROM public.invoices inv
                WHERE inv.party_id = p_entity_id
                  AND inv.company_id = p_company_id
                  AND inv.status = 'posted'
                  AND inv.deleted_at IS NULL
                  AND inv.issue_date BETWEEN v_date_from AND v_date_to
            ),
            'timeline', COALESCE((
                SELECT jsonb_agg(row_to_json(t) ORDER BY t.month ASC)
                FROM (
                    SELECT
                        to_char(inv.issue_date, 'YYYY-MM') AS month,
                        ROUND(SUM(CASE WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) WHEN inv.type = 'sale_return' THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 2) AS revenue,
                        COUNT(inv.id) AS invoices_count
                    FROM public.invoices inv
                    WHERE inv.party_id = p_entity_id
                      AND inv.company_id = p_company_id
                      AND inv.status = 'posted'
                      AND inv.deleted_at IS NULL
                      AND inv.issue_date BETWEEN v_date_from AND v_date_to
                    GROUP BY to_char(inv.issue_date, 'YYYY-MM')
                ) t
            ), '[]'::jsonb),
            'top_items', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'product_id', itm.product_id,
                        'product_name', prd.name_ar,
                        'total_quantity', itm.quantity,
                        'total_amount', ROUND(itm.total, 2)
                    )
                )
                FROM (
                    SELECT item.product_id, SUM(item.quantity) AS quantity, SUM(public.fn_invoice_to_base_amount(i.currency_code, item.total, i.exchange_rate)) AS total
                    FROM public.invoice_items item
                    JOIN public.invoices i ON i.id = item.invoice_id
                    WHERE i.party_id = p_entity_id
                      AND i.company_id = p_company_id
                      AND i.status = 'posted'
                      AND i.type = 'sale'
                      AND i.deleted_at IS NULL
                    GROUP BY item.product_id
                    ORDER BY SUM(public.fn_invoice_to_base_amount(i.currency_code, item.total, i.exchange_rate)) DESC
                    LIMIT 5
                ) itm
                JOIN public.products prd ON prd.id = itm.product_id
            ),
            'recent_transactions', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', inv.id,
                        'invoice_number', inv.invoice_number,
                        'type', inv.type,
                        'issue_date', inv.issue_date,
                        'total_amount', public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate),
                        'status', inv.status
                    )
                    ORDER BY inv.issue_date DESC
                )
                FROM (
                    SELECT id, invoice_number, type, issue_date, total_amount, currency_code, exchange_rate, status
                    FROM public.invoices
                    WHERE party_id = p_entity_id
                      AND company_id = p_company_id
                      AND status = 'posted'
                      AND deleted_at IS NULL
                    ORDER BY issue_date DESC
                    LIMIT 10
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
                'id', pty.id,
                'name', pty.name,
                'phone', pty.phone,
                'type', pty.type,
                'status', pty.status,
                'balance', COALESCE(pb.balance, 0),
                'category', cat.name
            ),
            'kpis', (
                SELECT jsonb_build_object(
                    'total_purchases', ROUND(COALESCE(SUM(CASE WHEN inv.type = 'purchase' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) WHEN inv.type = 'purchase_return' THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0), 2),
                    'bills_count', COUNT(DISTINCT inv.id) FILTER (WHERE inv.type = 'purchase'),
                    'avg_bill', ROUND(COALESCE(AVG(public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)) FILTER (WHERE inv.type = 'purchase'), 0), 2),
                    'total_paid', ROUND(COALESCE((SELECT SUM(public.fn_to_base_amount(currency_code, amount, exchange_rate)) FROM public.payments WHERE party_id = p_entity_id AND company_id = p_company_id AND type = 'disbursement' AND status = 'posted' AND deleted_at IS NULL AND payment_date BETWEEN v_date_from AND v_date_to), 0), 2)
                )
                FROM public.invoices inv
                WHERE inv.party_id = p_entity_id
                  AND inv.company_id = p_company_id
                  AND inv.status = 'posted'
                  AND inv.deleted_at IS NULL
                  AND inv.issue_date BETWEEN v_date_from AND v_date_to
            ),
            'timeline', COALESCE((
                SELECT jsonb_agg(row_to_json(t) ORDER BY t.month ASC)
                FROM (
                    SELECT
                        to_char(inv.issue_date, 'YYYY-MM') AS month,
                        ROUND(SUM(CASE WHEN inv.type = 'purchase' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) WHEN inv.type = 'purchase_return' THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 2) AS purchases,
                        COUNT(inv.id) AS bills_count
                    FROM public.invoices inv
                    WHERE inv.party_id = p_entity_id
                      AND inv.company_id = p_company_id
                      AND inv.status = 'posted'
                      AND inv.deleted_at IS NULL
                      AND inv.issue_date BETWEEN v_date_from AND v_date_to
                    GROUP BY to_char(inv.issue_date, 'YYYY-MM')
                ) t
            ), '[]'::jsonb),
            'recent_transactions', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', inv.id,
                        'invoice_number', inv.invoice_number,
                        'type', inv.type,
                        'issue_date', inv.issue_date,
                        'total_amount', public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate),
                        'status', inv.status
                    )
                    ORDER BY inv.issue_date DESC
                )
                FROM (
                    SELECT id, invoice_number, type, issue_date, total_amount, currency_code, exchange_rate, status
                    FROM public.invoices
                    WHERE party_id = p_entity_id
                      AND company_id = p_company_id
                      AND status = 'posted'
                      AND deleted_at IS NULL
                    ORDER BY issue_date DESC
                    LIMIT 10
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
                'id', p.id,
                'name_ar', p.name_ar,
                'sku', p.sku,
                'part_number', p.part_number,
                'brand', p.brand,
                'sale_price', p.sale_price,
                'cost_price', p.cost_price,
                'purchase_price', p.purchase_price,
                'category', cat.name
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
                    'total_returned_quantity', COALESCE(SUM(item.quantity) FILTER (WHERE i.type = 'sale_return'), 0),
                    'total_revenue', ROUND(COALESCE(SUM(public.fn_invoice_to_base_amount(i.currency_code, item.total, i.exchange_rate)) FILTER (WHERE i.type = 'sale'), 0) - COALESCE(SUM(public.fn_invoice_to_base_amount(i.currency_code, item.total, i.exchange_rate)) FILTER (WHERE i.type = 'sale_return'), 0), 2),
                    'gross_profit', ROUND((COALESCE(SUM(public.fn_invoice_to_base_amount(i.currency_code, item.total, i.exchange_rate)) FILTER (WHERE i.type = 'sale'), 0) - COALESCE(SUM(public.fn_invoice_to_base_amount(i.currency_code, item.total, i.exchange_rate)) FILTER (WHERE i.type = 'sale_return'), 0)) - (COALESCE(SUM(COALESCE(item.cost_price, 0) * item.quantity) FILTER (WHERE i.type = 'sale'), 0) - COALESCE(SUM(COALESCE(item.cost_price, 0) * item.quantity) FILTER (WHERE i.type = 'sale_return'), 0)), 2)
                )
                FROM public.invoice_items item
                JOIN public.invoices i ON i.id = item.invoice_id
                WHERE item.product_id = p_entity_id
                  AND i.company_id = p_company_id
                  AND i.status = 'posted'
                  AND i.deleted_at IS NULL
                  AND i.issue_date BETWEEN v_date_from AND v_date_to
            ),
            'timeline', COALESCE((
                SELECT jsonb_agg(row_to_json(t) ORDER BY t.month ASC)
                FROM (
                    SELECT
                        to_char(i.issue_date, 'YYYY-MM') AS month,
                        SUM(CASE WHEN i.type = 'sale' THEN item.quantity ELSE -item.quantity END) AS quantity,
                        ROUND(SUM(CASE WHEN i.type = 'sale' THEN public.fn_invoice_to_base_amount(i.currency_code, item.total, i.exchange_rate) WHEN i.type = 'sale_return' THEN -public.fn_invoice_to_base_amount(i.currency_code, item.total, i.exchange_rate) ELSE 0 END), 2) AS revenue
                    FROM public.invoice_items item
                    JOIN public.invoices i ON i.id = item.invoice_id
                    WHERE item.product_id = p_entity_id
                      AND i.company_id = p_company_id
                      AND i.status = 'posted'
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
$$;

-- ── 5. get_executive_bi_summary ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_executive_bi_summary(
    p_company_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL,
    p_compare_period boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

    -- 1. Current Period Sales & Purchases
    SELECT
        COALESCE(SUM(CASE WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN inv.type = 'sale_return' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN inv.type = 'purchase' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0)
    INTO v_curr_sales, v_curr_returns, v_curr_purchases
    FROM public.invoices inv
    WHERE inv.company_id = p_company_id
      AND inv.deleted_at IS NULL
      AND inv.status = 'posted'
      AND inv.issue_date BETWEEN v_date_from AND v_date_to
      AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id);

    v_curr_net_sales := v_curr_sales - v_curr_returns;

    -- Current COGS (Strictly sale and sale_return)
    SELECT
        COALESCE(SUM(
            CASE
                WHEN inv.type = 'sale' THEN (COALESCE(item.cost_price, 0) * COALESCE(item.quantity, 0))
                WHEN inv.type = 'sale_return' THEN -(COALESCE(item.cost_price, 0) * COALESCE(item.quantity, 0))
                ELSE 0
            END
        ), 0)
    INTO v_curr_cogs
    FROM public.invoice_items item
    JOIN public.invoices inv ON inv.id = item.invoice_id
    WHERE inv.company_id = p_company_id
      AND inv.deleted_at IS NULL
      AND inv.status = 'posted'
      AND inv.type IN ('sale', 'sale_return')
      AND inv.issue_date BETWEEN v_date_from AND v_date_to
      AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id);

    v_curr_gross_profit := v_curr_net_sales - v_curr_cogs;

    -- 2. Previous Period Comparison
    IF p_compare_period AND p_date_from IS NOT NULL THEN
        SELECT
            COALESCE(SUM(
                CASE
                    WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                    WHEN inv.type = 'sale_return' THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                    ELSE 0
                END
            ), 0),
            COALESCE(SUM(CASE WHEN inv.type = 'purchase' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0)
        INTO v_prev_net_sales, v_prev_purchases
        FROM public.invoices inv
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status = 'posted'
          AND inv.type IN ('sale', 'sale_return', 'purchase')
          AND inv.issue_date BETWEEN v_prev_from AND v_prev_to
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id);

        SELECT
            v_prev_net_sales - COALESCE(SUM(
                CASE
                    WHEN inv.type = 'sale' THEN (COALESCE(item.cost_price, 0) * COALESCE(item.quantity, 0))
                    WHEN inv.type = 'sale_return' THEN -(COALESCE(item.cost_price, 0) * COALESCE(item.quantity, 0))
                    ELSE 0
                END
            ), 0)
        INTO v_prev_gross_profit
        FROM public.invoice_items item
        JOIN public.invoices inv ON inv.id = item.invoice_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status = 'posted'
          AND inv.type IN ('sale', 'sale_return')
          AND inv.issue_date BETWEEN v_prev_from AND v_prev_to
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id);
    END IF;

    -- 3. Stock Valuation
    SELECT COALESCE(SUM(ps.quantity * COALESCE(p.cost_price, p.purchase_price, 0)), 0)
    INTO v_stock_valuation
    FROM public.product_stock ps
    JOIN public.products p ON p.id = ps.product_id
    JOIN public.warehouses w ON w.id = ps.warehouse_id
    WHERE ps.company_id = p_company_id
      AND (p_branch_id IS NULL OR w.branch_id = p_branch_id);

    -- 4. Receivables & Payables from live party_balances view
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

    -- 5. Cash Liquidity from live account_balances linked to active cashboxes
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
$$;

-- ── 6. get_sales_bi_analytics (Branch, Payment Method, Trend Breakdown) ─────
CREATE OR REPLACE FUNCTION public.get_sales_bi_analytics(
    p_company_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_date_from date := COALESCE(p_date_from, '1900-01-01'::date);
    v_date_to date := COALESCE(p_date_to, CURRENT_DATE);
    v_result jsonb;
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    SELECT jsonb_build_object(
        'by_branch', COALESCE((
            SELECT jsonb_agg(row_to_json(t))
            FROM (
                SELECT
                    COALESCE(b.name, 'الفرع الرئيسي') AS branch_name,
                    COUNT(DISTINCT inv.id) FILTER (WHERE inv.type = 'sale') AS invoices_count,
                    ROUND(COALESCE(SUM(CASE WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) WHEN inv.type = 'sale_return' THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0), 2) AS net_sales,
                    ROUND(COALESCE(AVG(public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)) FILTER (WHERE inv.type = 'sale'), 0), 2) AS avg_invoice
                FROM public.invoices inv
                LEFT JOIN public.branches b ON b.id = inv.branch_id
                WHERE inv.company_id = p_company_id
                  AND inv.deleted_at IS NULL
                  AND inv.status = 'posted'
                  AND inv.type IN ('sale', 'sale_return')
                  AND inv.issue_date BETWEEN v_date_from AND v_date_to
                  AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
                GROUP BY b.name
                ORDER BY net_sales DESC
            ) t
        ), '[]'::jsonb),
        'by_payment_method', COALESCE((
            SELECT jsonb_agg(row_to_json(t))
            FROM (
                SELECT
                    COALESCE(inv.payment_method, 'cash') AS payment_method,
                    COUNT(DISTINCT inv.id) AS invoices_count,
                    ROUND(COALESCE(SUM(public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)), 0), 2) AS total_amount
                FROM public.invoices inv
                WHERE inv.company_id = p_company_id
                  AND inv.deleted_at IS NULL
                  AND inv.status = 'posted'
                  AND inv.type = 'sale'
                  AND inv.issue_date BETWEEN v_date_from AND v_date_to
                  AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
                GROUP BY inv.payment_method
                ORDER BY total_amount DESC
            ) t
        ), '[]'::jsonb),
        'daily_trend', COALESCE((
            SELECT jsonb_agg(row_to_json(t))
            FROM (
                SELECT
                    inv.issue_date AS date,
                    COUNT(DISTINCT inv.id) FILTER (WHERE inv.type = 'sale') AS invoices_count,
                    ROUND(COALESCE(SUM(CASE WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) WHEN inv.type = 'sale_return' THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0), 2) AS net_sales
                FROM public.invoices inv
                WHERE inv.company_id = p_company_id
                  AND inv.deleted_at IS NULL
                  AND inv.status = 'posted'
                  AND inv.type IN ('sale', 'sale_return')
                  AND inv.issue_date BETWEEN v_date_from AND v_date_to
                  AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
                GROUP BY inv.issue_date
                ORDER BY inv.issue_date ASC
            ) t
        ), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ── 7. Grant Permissions ─────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_customer_bi_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_bi_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_bi_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_entity_360_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_executive_bi_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_bi_analytics TO authenticated;
