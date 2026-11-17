-- ============================================================================
-- Migration: 20261116000002_bi_phase2_sales_inventory_supplier_prices.sql
-- Phase 2 Enterprise BI:
--   1. Enhanced get_sales_bi_analytics (summary, by_employee, by_hour, period growth)
--   2. get_inventory_bi_analytics (branches, categories, brands, transfers, audits)
--   3. get_supplier_price_comparison (historical & cross-supplier price comparison)
-- ============================================================================

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
DECLARE
    v_date_from date := COALESCE(p_date_from, '1900-01-01'::date);
    v_date_to date := COALESCE(p_date_to, CURRENT_DATE);
    v_period_days integer := GREATEST(1, (v_date_to - v_date_from));
    v_prev_from date := CASE WHEN p_date_from IS NULL THEN '1800-01-01'::date ELSE v_date_from - (v_period_days || ' days')::interval END;
    v_prev_to date := CASE WHEN p_date_from IS NULL THEN '1800-01-01'::date ELSE v_date_from - INTERVAL '1 day' END;
    v_prev_net_sales numeric := 0;
    v_curr_net_sales numeric := 0;
    v_result jsonb;
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    IF p_date_from IS NOT NULL THEN
        SELECT COALESCE(SUM(
            CASE
                WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                WHEN inv.type = 'sale_return' THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
                ELSE 0
            END
        ), 0)
        INTO v_prev_net_sales
        FROM public.invoices inv
        WHERE inv.company_id = p_company_id
          AND inv.deleted_at IS NULL
          AND inv.status = 'posted'
          AND inv.type IN ('sale', 'sale_return')
          AND inv.issue_date BETWEEN v_prev_from AND v_prev_to
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id);
    END IF;

    SELECT COALESCE(SUM(
        CASE
            WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
            WHEN inv.type = 'sale_return' THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)
            ELSE 0
        END
    ), 0)
    INTO v_curr_net_sales
    FROM public.invoices inv
    WHERE inv.company_id = p_company_id
      AND inv.deleted_at IS NULL
      AND inv.status = 'posted'
      AND inv.type IN ('sale', 'sale_return')
      AND inv.issue_date BETWEEN v_date_from AND v_date_to
      AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id);

    SELECT jsonb_build_object(
        'summary', (
            SELECT jsonb_build_object(
                'gross_sales', ROUND(COALESCE(SUM(CASE WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0), 2),
                'returns_amount', ROUND(COALESCE(SUM(CASE WHEN inv.type = 'sale_return' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0), 2),
                'net_sales', ROUND(v_curr_net_sales, 2),
                'total_discount', ROUND(COALESCE(SUM(CASE WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, COALESCE(inv.discount_amount, 0), inv.exchange_rate) ELSE 0 END), 0), 2),
                'invoices_count', COUNT(DISTINCT inv.id) FILTER (WHERE inv.type = 'sale'),
                'avg_invoice', ROUND(COALESCE(AVG(public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)) FILTER (WHERE inv.type = 'sale'), 0), 2),
                'cash_sales', ROUND(COALESCE(SUM(CASE WHEN inv.type = 'sale' AND COALESCE(inv.payment_method, 'cash') = 'cash' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0), 2),
                'credit_sales', ROUND(COALESCE(SUM(CASE WHEN inv.type = 'sale' AND inv.payment_method = 'credit' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0), 2),
                'prev_net_sales', ROUND(v_prev_net_sales, 2),
                'growth_pct', ROUND(CASE WHEN p_date_from IS NULL THEN 0 WHEN v_prev_net_sales > 0 THEN ((v_curr_net_sales - v_prev_net_sales) / v_prev_net_sales) * 100 WHEN v_curr_net_sales > 0 THEN 100 ELSE 0 END, 2)
            )
            FROM public.invoices inv
            WHERE inv.company_id = p_company_id
              AND inv.deleted_at IS NULL
              AND inv.status = 'posted'
              AND inv.type IN ('sale', 'sale_return')
              AND inv.issue_date BETWEEN v_date_from AND v_date_to
              AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
        ),
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
        'by_employee', COALESCE((
            SELECT jsonb_agg(row_to_json(t))
            FROM (
                SELECT
                    COALESCE(pr.full_name, 'مستخدم غير محدد') AS employee_name,
                    COUNT(DISTINCT inv.id) FILTER (WHERE inv.type = 'sale') AS invoices_count,
                    ROUND(COALESCE(SUM(CASE WHEN inv.type = 'sale' THEN public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) WHEN inv.type = 'sale_return' THEN -public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0), 2) AS net_sales
                FROM public.invoices inv
                LEFT JOIN public.profiles pr ON pr.id = inv.created_by
                WHERE inv.company_id = p_company_id
                  AND inv.deleted_at IS NULL
                  AND inv.status = 'posted'
                  AND inv.type IN ('sale', 'sale_return')
                  AND inv.issue_date BETWEEN v_date_from AND v_date_to
                  AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
                GROUP BY pr.full_name
                ORDER BY net_sales DESC
                LIMIT 10
            ) t
        ), '[]'::jsonb),
        'by_hour', COALESCE((
            SELECT jsonb_agg(row_to_json(t))
            FROM (
                SELECT
                    EXTRACT(HOUR FROM inv.created_at)::integer AS hour_of_day,
                    COUNT(DISTINCT inv.id) AS invoices_count,
                    ROUND(COALESCE(SUM(public.fn_invoice_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)), 0), 2) AS total_sales
                FROM public.invoices inv
                WHERE inv.company_id = p_company_id
                  AND inv.deleted_at IS NULL
                  AND inv.status = 'posted'
                  AND inv.type = 'sale'
                  AND inv.issue_date BETWEEN v_date_from AND v_date_to
                  AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
                GROUP BY EXTRACT(HOUR FROM inv.created_at)::integer
                ORDER BY hour_of_day ASC
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
                    COALESCE(cat.name, 'عام') AS category_name,
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
                    COALESCE(NULLIF(p.brand, ''), 'أصلي / غير محدد') AS brand_name,
                    COUNT(DISTINCT p.id) AS products_count,
                    ROUND(COALESCE(SUM(ps.quantity), 0), 2) AS total_quantity,
                    ROUND(COALESCE(SUM(ps.quantity * COALESCE(p.cost_price, p.purchase_price, 0)), 0), 2) AS total_valuation
                FROM public.product_stock ps
                JOIN public.products p ON p.id = ps.product_id AND p.deleted_at IS NULL
                JOIN public.warehouses w ON w.id = ps.warehouse_id
                WHERE ps.company_id = p_company_id
                  AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
                GROUP BY COALESCE(NULLIF(p.brand, ''), 'أصلي / غير محدد')
                ORDER BY total_valuation DESC
                LIMIT 10
            ) t
        ), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_supplier_price_comparison(
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
            COALESCE(p.sku, p.part_number, '') AS product_sku,
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
          AND (p_search IS NULL OR p.name_ar ILIKE '%' || p_search || '%' OR p.sku ILIKE '%' || p_search || '%' OR pty.name ILIKE '%' || p_search || '%')
    ),
    grouped AS (
        SELECT
            bl.product_id,
            bl.product_name,
            bl.product_sku,
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
        GROUP BY bl.product_id, bl.product_name, bl.product_sku, bl.supplier_id, bl.supplier_name
    ),
    counted AS (
        SELECT COUNT(*) AS total_count FROM grouped
    )
    SELECT
        g.product_id,
        g.product_name,
        g.product_sku,
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

GRANT EXECUTE ON FUNCTION public.get_sales_bi_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_bi_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_price_comparison TO authenticated;
