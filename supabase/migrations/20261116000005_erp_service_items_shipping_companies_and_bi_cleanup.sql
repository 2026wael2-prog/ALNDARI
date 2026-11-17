-- ============================================================================
-- Migration: 20261116000005_erp_service_items_shipping_companies_and_bi_cleanup.sql
-- 1. Add item_type ('stock' | 'service') to products & mark labor/service items
-- 2. Create shipping_companies table with RLS for shipmentsApi
-- 3. Update get_customer_bi_analytics to exclude internal settlement parties
-- 4. Update get_product_bi_analytics_v2 to exclude service items from stockout/dead/slow alerts
-- ============================================================================

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'stock';

UPDATE public.products
SET item_type = 'service'
WHERE deleted_at IS NULL
  AND (
    name_ar ILIKE '%عمل يد%'
    OR name_ar ILIKE '%اجرة %'
    OR name_ar ILIKE '%أجرة %'
  );

CREATE TABLE IF NOT EXISTS public.shipping_companies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name text NOT NULL,
    phone text,
    address text,
    origin_city text DEFAULT 'صنعاء',
    origin_hub text,
    destination_city text DEFAULT 'المهرة (الغيضة)',
    destination_hub text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipping_companies_company
ON public.shipping_companies (company_id, is_active);

ALTER TABLE public.shipping_companies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shipping_companies' AND policyname = 'shipping_companies_tenant_isolation'
  ) THEN
    CREATE POLICY shipping_companies_tenant_isolation ON public.shipping_companies
    FOR ALL TO authenticated
    USING (public.is_super_admin() OR (company_id IN (SELECT public.get_auth_companies())))
    WITH CHECK (public.is_super_admin() OR (company_id IN (SELECT public.get_auth_companies())));
  END IF;
END $$;

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
 RETURNS TABLE(
    party_id uuid, party_name text, phone text, category_name text, invoices_count bigint,
    total_revenue numeric, total_cost numeric, gross_profit numeric, margin_percent numeric,
    avg_invoice_value numeric, first_purchase_date date, last_purchase_date date,
    days_since_last_purchase integer, loyalty_segment text, current_balance numeric,
    overdue_balance numeric, collection_rate numeric, growth_rate numeric,
    total_records bigint, summary_total_revenue numeric, summary_total_profit numeric,
    summary_champions_count bigint
 )
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
                    WHEN inv.type = 'sale_return' THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
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
          AND inv.status IN ('posted', 'paid')
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
                    WHEN inv.type = 'sale' THEN (
                        CASE
                            WHEN COALESCE(item.cost_price, 0) > 0
                                THEN public.fn_to_base_amount(inv.currency_code, item.cost_price, inv.exchange_rate)
                            ELSE COALESCE(NULLIF(prd.cost_price, 0), NULLIF(prd.purchase_price, 0), 0)
                        END * COALESCE(item.quantity, 0)
                    )
                    WHEN inv.type = 'sale_return' THEN -(
                        CASE
                            WHEN COALESCE(item.cost_price, 0) > 0
                                THEN public.fn_to_base_amount(inv.currency_code, item.cost_price, inv.exchange_rate)
                            ELSE COALESCE(NULLIF(prd.cost_price, 0), NULLIF(prd.purchase_price, 0), 0)
                        END * COALESCE(item.quantity, 0)
                    )
                    ELSE 0
                END
            ), 0) AS net_cogs
        FROM public.invoice_items item
        JOIN public.invoices inv ON inv.id = item.invoice_id
        JOIN target_parties tp ON tp.id = inv.party_id
        LEFT JOIN public.products prd ON prd.id = item.product_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status IN ('posted', 'paid')
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
                    WHEN inv.type = 'sale' AND inv.status = 'posted' AND inv.due_date < CURRENT_DATE AND (inv.total_amount - COALESCE(inv.paid_amount, 0)) > 0
                    THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount - COALESCE(inv.paid_amount, 0), inv.exchange_rate)
                    ELSE 0
                END
            ), 0) AS actual_overdue
        FROM public.invoices inv
        JOIN target_parties tp ON tp.id = inv.party_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status IN ('posted', 'paid')
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
 RETURNS TABLE(
    product_id uuid, product_sku text, part_number text, alternative_numbers text,
    product_name text, category_name text, brand_name text, unit text,
    times_sold bigint, quantity_sold numeric, quantity_returned numeric, net_quantity_sold numeric,
    total_revenue numeric, total_cogs numeric, gross_profit numeric, gross_margin_percent numeric,
    total_discount_given numeric, current_stock numeric, stock_valuation_cost numeric,
    turnover_ratio numeric, days_sales_inventory numeric, movement_classification text,
    return_rate_percent numeric, last_sale_date date, last_purchase_date date,
    total_records bigint, summary_total_revenue numeric, summary_total_cogs numeric,
    summary_total_profit numeric, summary_stock_valuation numeric
 )
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
        WHERE company_id = p_company_id AND deleted_at IS NULL AND status IN ('posted', 'paid') AND type = 'sale';
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
            COALESCE(SUM(item.quantity) FILTER (WHERE inv.type = 'sale_return'), 0) AS qty_returned,
            COALESCE(SUM(public.fn_to_base_amount(inv.currency_code, item.total, inv.exchange_rate)) FILTER (WHERE inv.type = 'sale'), 0) -
            COALESCE(SUM(public.fn_to_base_amount(inv.currency_code, item.total, inv.exchange_rate)) FILTER (WHERE inv.type = 'sale_return'), 0) AS revenue,
            COALESCE(SUM(
                CASE
                    WHEN COALESCE(item.cost_price, 0) > 0
                        THEN public.fn_to_base_amount(inv.currency_code, item.cost_price, inv.exchange_rate)
                    ELSE COALESCE(NULLIF(tp.cost_price, 0), NULLIF(tp.purchase_price, 0), 0)
                END * item.quantity
            ) FILTER (WHERE inv.type = 'sale'), 0) -
            COALESCE(SUM(
                CASE
                    WHEN COALESCE(item.cost_price, 0) > 0
                        THEN public.fn_to_base_amount(inv.currency_code, item.cost_price, inv.exchange_rate)
                    ELSE COALESCE(NULLIF(tp.cost_price, 0), NULLIF(tp.purchase_price, 0), 0)
                END * item.quantity
            ) FILTER (WHERE inv.type = 'sale_return'), 0) AS cogs,
            COALESCE(SUM(public.fn_to_base_amount(inv.currency_code, item.discount_amount, inv.exchange_rate)) FILTER (WHERE inv.type = 'sale'), 0) AS discount_given,
            MAX(inv.issue_date) FILTER (WHERE inv.type = 'sale') AS last_sold
        FROM public.invoice_items item
        JOIN public.invoices inv ON inv.id = item.invoice_id
        JOIN target_products tp ON tp.id = item.product_id
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status IN ('posted', 'paid')
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
          AND inv.status IN ('posted', 'paid')
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
        f.product_id,
        f.product_sku,
        f.part_number,
        f.alternative_numbers,
        f.product_name,
        f.category_name,
        f.brand_name,
        f.unit,
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
$function$;
