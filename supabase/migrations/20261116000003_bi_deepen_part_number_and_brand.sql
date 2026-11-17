-- ============================================================================
-- Migration: 20261116000003_bi_deepen_part_number_and_brand.sql
-- Deepen part_number, alternative_numbers, and brand (manufacturer) across
-- Product BI, Supplier Price Comparison, Inventory BI, and Entity 360.
-- Remove placeholder fallback 'أصلي' -> 'غير محدد'.
-- ============================================================================

-- ── 1. get_product_bi_analytics_v2 (with part_number, alternative_numbers, brand filter)
CREATE OR REPLACE FUNCTION public.get_product_bi_analytics_v2(
    p_company_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_category_id uuid DEFAULT NULL,
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL,
    p_view_type text DEFAULT 'profitability',
    p_page integer DEFAULT 1,
    p_page_size integer DEFAULT 25,
    p_search text DEFAULT NULL,
    p_brand text DEFAULT NULL
)
RETURNS TABLE (
    product_id uuid,
    product_sku text,
    part_number text,
    alternative_numbers text,
    product_name text,
    category_name text,
    brand_name text,
    unit text,
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
        SELECT p.id, p.sku, p.part_number, p.alternative_numbers, p.name_ar, p.brand, p.unit, p.category_id, p.cost_price, p.purchase_price, p.min_stock_level
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
$$;
GRANT EXECUTE ON FUNCTION public.get_product_bi_analytics_v2 TO authenticated;

-- ── 2. get_supplier_price_comparison_v2 (with part_number & brand_name)
CREATE OR REPLACE FUNCTION public.get_supplier_price_comparison_v2(
    p_company_id uuid,
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL,
    p_page integer DEFAULT 1,
    p_page_size integer DEFAULT 25,
    p_search text DEFAULT NULL
)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    product_sku text,
    part_number text,
    brand_name text,
    supplier_id uuid,
    supplier_name text,
    invoices_count bigint,
    total_qty_purchased numeric,
    last_purchase_price numeric,
    min_price numeric,
    max_price numeric,
    avg_price numeric,
    last_purchase_date date,
    total_records bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_date_from date := COALESCE(p_date_from, '1900-01-01'::date);
    v_date_to date := COALESCE(p_date_to, CURRENT_DATE);
    v_offset integer := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 25));
    v_limit integer := GREATEST(1, LEAST(COALESCE(p_page_size, 25), 100));
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    RETURN QUERY
    WITH base_lines AS (
        SELECT
            item.product_id,
            p.name_ar AS product_name,
            COALESCE(NULLIF(TRIM(p.sku), ''), '') AS product_sku,
            COALESCE(NULLIF(TRIM(p.part_number), ''), '') AS part_number,
            COALESCE(NULLIF(TRIM(p.brand), ''), 'غير محدد') AS brand_name,
            inv.party_id AS supplier_id,
            pty.name AS supplier_name,
            inv.id AS invoice_id,
            inv.issue_date,
            item.quantity,
            CASE
                WHEN COALESCE(item.quantity, 0) > 0 THEN
                    public.fn_invoice_to_base_amount(inv.currency_code, item.total, inv.exchange_rate) / item.quantity
                ELSE 0
            END AS unit_price_base
        FROM public.invoice_items item
        JOIN public.invoices inv ON inv.id = item.invoice_id
        JOIN public.products p ON p.id = item.product_id AND p.deleted_at IS NULL
        JOIN public.parties pty ON pty.id = inv.party_id AND pty.deleted_at IS NULL
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status = 'posted'
          AND inv.type = 'purchase'
          AND inv.issue_date BETWEEN v_date_from AND v_date_to
          AND (
              p_search IS NULL
              OR p.name_ar ILIKE '%' || p_search || '%'
              OR p.part_number ILIKE '%' || p_search || '%'
              OR p.sku ILIKE '%' || p_search || '%'
              OR p.brand ILIKE '%' || p_search || '%'
              OR p.alternative_numbers ILIKE '%' || p_search || '%'
              OR pty.name ILIKE '%' || p_search || '%'
          )
    ),
    grouped AS (
        SELECT
            bl.product_id,
            bl.product_name,
            bl.product_sku,
            bl.part_number,
            bl.brand_name,
            bl.supplier_id,
            bl.supplier_name,
            COUNT(DISTINCT bl.invoice_id) AS invoices_count,
            ROUND(COALESCE(SUM(bl.quantity), 0), 2) AS total_qty_purchased,
            ROUND((ARRAY_AGG(bl.unit_price_base ORDER BY bl.issue_date DESC, bl.invoice_id DESC))[1], 2) AS last_purchase_price,
            ROUND(COALESCE(MIN(bl.unit_price_base), 0), 2) AS min_price,
            ROUND(COALESCE(MAX(bl.unit_price_base), 0), 2) AS max_price,
            ROUND(COALESCE(AVG(bl.unit_price_base), 0), 2) AS avg_price,
            MAX(bl.issue_date) AS last_purchase_date
        FROM base_lines bl
        GROUP BY bl.product_id, bl.product_name, bl.product_sku, bl.part_number, bl.brand_name, bl.supplier_id, bl.supplier_name
    ),
    counted AS (
        SELECT COUNT(*) AS total_count FROM grouped
    )
    SELECT
        g.product_id,
        g.product_name,
        g.product_sku,
        g.part_number,
        g.brand_name,
        g.supplier_id,
        g.supplier_name,
        g.invoices_count,
        g.total_qty_purchased,
        g.last_purchase_price,
        g.min_price,
        g.max_price,
        g.avg_price,
        g.last_purchase_date,
        c.total_count AS total_records
    FROM grouped g
    CROSS JOIN counted c
    ORDER BY g.product_name ASC, g.avg_price ASC
    LIMIT v_limit
    OFFSET v_offset;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_supplier_price_comparison_v2 TO authenticated;

-- ── 3. get_inventory_bi_analytics (clean brand fallback + top_products_by_value)
CREATE OR REPLACE FUNCTION public.get_inventory_bi_analytics(
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
DECLARE
    v_date_from date := COALESCE(p_date_from, '1900-01-01'::date);
    v_date_to date := COALESCE(p_date_to, CURRENT_DATE);
    v_result jsonb;
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    SELECT jsonb_build_object(
        'summary', (
            WITH stock_agg AS (
                SELECT
                    p.id,
                    COALESCE(SUM(ps.quantity), 0) AS qty,
                    COALESCE(SUM(ps.quantity), 0) * COALESCE(p.cost_price, p.purchase_price, 0) AS valuation,
                    COALESCE(p.min_stock_level, 0) AS min_lvl
                FROM public.products p
                LEFT JOIN public.product_stock ps ON ps.product_id = p.id AND ps.company_id = p_company_id
                LEFT JOIN public.warehouses w ON w.id = ps.warehouse_id
                WHERE p.company_id = p_company_id
                  AND p.deleted_at IS NULL
                  AND (p_branch_id IS NULL OR w.branch_id = p_branch_id OR ps.warehouse_id IS NULL)
                GROUP BY p.id, p.cost_price, p.purchase_price, p.min_stock_level
            ),
            transfers_agg AS (
                SELECT
                    COUNT(DISTINCT st.id) AS transfers_count,
                    COALESCE(SUM(sti.quantity), 0) AS transfers_qty
                FROM public.stock_transfers st
                LEFT JOIN public.stock_transfer_items sti ON sti.transfer_id = st.id
                LEFT JOIN public.warehouses wf ON wf.id = st.from_warehouse_id
                LEFT JOIN public.warehouses wt ON wt.id = st.to_warehouse_id
                WHERE st.company_id = p_company_id
                  AND st.created_at::date BETWEEN v_date_from AND v_date_to
                  AND (p_branch_id IS NULL OR wf.branch_id = p_branch_id OR wt.branch_id = p_branch_id)
            ),
            audits_agg AS (
                SELECT
                    COUNT(DISTINCT ases.id) AS audit_sessions_count,
                    COALESCE(SUM(ai.counted_quantity - ai.expected_quantity), 0) AS variance_qty,
                    COALESCE(SUM((ai.counted_quantity - ai.expected_quantity) * COALESCE(p.cost_price, p.purchase_price, 0)), 0) AS variance_value
                FROM public.audit_sessions ases
                LEFT JOIN public.audit_items ai ON ai.session_id = ases.id
                LEFT JOIN public.products p ON p.id = ai.product_id
                LEFT JOIN public.warehouses w ON w.id = ases.warehouse_id
                WHERE ases.company_id = p_company_id
                  AND ases.created_at::date BETWEEN v_date_from AND v_date_to
                  AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
            )
            SELECT jsonb_build_object(
                'total_products', (SELECT COUNT(*) FROM stock_agg),
                'total_quantity', ROUND((SELECT COALESCE(SUM(qty), 0) FROM stock_agg), 2),
                'total_valuation', ROUND((SELECT COALESCE(SUM(valuation), 0) FROM stock_agg), 2),
                'out_of_stock_count', (SELECT COUNT(*) FROM stock_agg WHERE qty <= 0),
                'low_stock_count', (SELECT COUNT(*) FROM stock_agg WHERE qty > 0 AND qty <= min_lvl),
                'transfers_count', (SELECT transfers_count FROM transfers_agg),
                'transfers_quantity', ROUND((SELECT transfers_qty FROM transfers_agg), 2),
                'audit_sessions_count', (SELECT audit_sessions_count FROM audits_agg),
                'audit_variance_qty', ROUND((SELECT variance_qty FROM audits_agg), 2),
                'audit_variance_value', ROUND((SELECT variance_value FROM audits_agg), 2)
            )
        ),
        'by_branch', COALESCE((
            SELECT jsonb_agg(row_to_json(t))
            FROM (
                SELECT
                    COALESCE(b.name, 'الفرع الرئيسي') AS branch_name,
                    COUNT(DISTINCT ps.product_id) FILTER (WHERE ps.quantity > 0) AS products_count,
                    ROUND(COALESCE(SUM(ps.quantity), 0), 2) AS total_quantity,
                    ROUND(COALESCE(SUM(ps.quantity * COALESCE(p.cost_price, p.purchase_price, 0)), 0), 2) AS total_valuation
                FROM public.product_stock ps
                JOIN public.products p ON p.id = ps.product_id AND p.deleted_at IS NULL
                JOIN public.warehouses w ON w.id = ps.warehouse_id
                LEFT JOIN public.branches b ON b.id = w.branch_id
                WHERE ps.company_id = p_company_id
                  AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
                GROUP BY b.name
                ORDER BY total_valuation DESC
            ) t
        ), '[]'::jsonb),
        'by_category', COALESCE((
            SELECT jsonb_agg(row_to_json(t))
            FROM (
                SELECT
                    COALESCE(cat.name, 'غير مصنف') AS category_name,
                    COUNT(DISTINCT p.id) AS products_count,
                    ROUND(COALESCE(SUM(ps.quantity), 0), 2) AS total_quantity,
                    ROUND(COALESCE(SUM(ps.quantity * COALESCE(p.cost_price, p.purchase_price, 0)), 0), 2) AS total_valuation
                FROM public.product_stock ps
                JOIN public.products p ON p.id = ps.product_id AND p.deleted_at IS NULL
                JOIN public.warehouses w ON w.id = ps.warehouse_id
                LEFT JOIN public.product_categories cat ON cat.id = p.category_id
                WHERE ps.company_id = p_company_id
                  AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
                GROUP BY cat.name
                ORDER BY total_valuation DESC
                LIMIT 10
            ) t
        ), '[]'::jsonb),
        'by_brand', COALESCE((
            SELECT jsonb_agg(row_to_json(t))
            FROM (
                SELECT
                    COALESCE(NULLIF(TRIM(p.brand), ''), 'غير محدد') AS brand_name,
                    COUNT(DISTINCT p.id) AS products_count,
                    ROUND(COALESCE(SUM(ps.quantity), 0), 2) AS total_quantity,
                    ROUND(COALESCE(SUM(ps.quantity * COALESCE(p.cost_price, p.purchase_price, 0)), 0), 2) AS total_valuation
                FROM public.product_stock ps
                JOIN public.products p ON p.id = ps.product_id AND p.deleted_at IS NULL
                JOIN public.warehouses w ON w.id = ps.warehouse_id
                WHERE ps.company_id = p_company_id
                  AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
                GROUP BY COALESCE(NULLIF(TRIM(p.brand), ''), 'غير محدد')
                ORDER BY total_valuation DESC
                LIMIT 10
            ) t
        ), '[]'::jsonb),
        'top_products_by_value', COALESCE((
            SELECT jsonb_agg(row_to_json(t))
            FROM (
                SELECT
                    p.id AS product_id,
                    p.name_ar AS product_name,
                    COALESCE(NULLIF(TRIM(p.part_number), ''), '') AS part_number,
                    COALESCE(NULLIF(TRIM(p.brand), ''), 'غير محدد') AS brand_name,
                    ROUND(COALESCE(SUM(ps.quantity), 0), 2) AS current_stock,
                    ROUND(COALESCE(SUM(ps.quantity * COALESCE(p.cost_price, p.purchase_price, 0)), 0), 2) AS stock_valuation
                FROM public.product_stock ps
                JOIN public.products p ON p.id = ps.product_id AND p.deleted_at IS NULL
                JOIN public.warehouses w ON w.id = ps.warehouse_id
                WHERE ps.company_id = p_company_id
                  AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
                GROUP BY p.id, p.name_ar, p.part_number, p.brand
                HAVING COALESCE(SUM(ps.quantity), 0) > 0
                ORDER BY stock_valuation DESC
                LIMIT 10
            ) t
        ), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_inventory_bi_analytics TO authenticated;
