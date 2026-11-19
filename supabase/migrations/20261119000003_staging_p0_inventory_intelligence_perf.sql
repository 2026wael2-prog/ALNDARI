-- Phase 2 Batch 4 (Staging P0): Inventory Intelligence summary-first + pagination + snapshot optimization
-- Target: Staging (adrgddwoksskzoryshgv)

-- 1. Targeted covering indexes for inventory intelligence & sales aggregations
CREATE INDEX IF NOT EXISTS idx_product_stock_company_product_cov
  ON public.product_stock (company_id, product_id)
  INCLUDE (warehouse_id, quantity, reserved_quantity, damaged_quantity, weighted_avg_cost);

CREATE INDEX IF NOT EXISTS idx_invoices_company_active_date
  ON public.invoices (company_id, issue_date DESC, type)
  INCLUDE (branch_id, party_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_prod_cov
  ON public.invoice_items (invoice_id, product_id)
  INCLUDE (quantity, unit_price, cost_price, total);

-- 2. Summary-first RPC (< 100 KB, < 500 ms)
CREATE OR REPLACE FUNCTION public.fn_get_inventory_intelligence_summary(
  p_company_id uuid,
  p_lookback_days integer DEFAULT 365,
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_main_branch_id uuid;
  v_branches jsonb;
  v_totals jsonb;
  v_top_alerts jsonb;
  v_open_pos jsonb;
  v_pending_transfers jsonb;
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

  WITH prod_stock AS (
    SELECT
      ps.product_id,
      SUM(ps.quantity) AS total_qty,
      SUM(GREATEST(ps.quantity - COALESCE(ps.reserved_quantity, 0) - COALESCE(ps.damaged_quantity, 0), 0)) AS avail_qty,
      SUM(ps.quantity * COALESCE(NULLIF(ps.weighted_avg_cost, 0), p.cost_price, p.purchase_price, 0)) AS stock_cost_val,
      SUM(ps.quantity * COALESCE(p.sale_price, 0)) AS stock_sale_val,
      BOOL_OR(ps.quantity <= 0) AS has_out,
      MAX(p.min_stock_level) AS min_stock,
      MAX(p.name_ar) AS name_ar,
      MAX(p.sku) AS sku
    FROM public.products p
    LEFT JOIN public.product_stock ps ON ps.company_id = p_company_id AND ps.product_id = p.id
    LEFT JOIN public.warehouses w ON w.id = ps.warehouse_id AND w.deleted_at IS NULL
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND COALESCE(p.item_type, 'stock') <> 'service'
      AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
    GROUP BY ps.product_id, p.id
  ),
  sales_agg AS (
    SELECT
      SUM(CASE WHEN i.issue_date >= CURRENT_DATE - 30 THEN CASE WHEN i.type = 'sale' THEN ii.quantity ELSE -ii.quantity END ELSE 0 END) AS net_qty_30d,
      SUM(CASE WHEN i.issue_date >= CURRENT_DATE - 90 THEN CASE WHEN i.type = 'sale' THEN ii.quantity ELSE -ii.quantity END ELSE 0 END) AS net_qty_90d,
      SUM(CASE WHEN i.type = 'sale' THEN ii.quantity ELSE -ii.quantity END) AS net_qty_lookback,
      SUM(CASE WHEN i.type = 'sale' THEN ii.total ELSE -ii.total END) AS net_revenue_lookback
    FROM public.invoices i
    JOIN public.invoice_items ii ON ii.invoice_id = i.id
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.type IN ('sale', 'sale_return', 'sales_return')
      AND i.issue_date >= CURRENT_DATE - GREATEST(p_lookback_days, 30)
      AND (p_branch_id IS NULL OR COALESCE(i.branch_id, v_main_branch_id) = p_branch_id)
  )
  SELECT jsonb_build_object(
    'total_products', (SELECT count(*) FROM public.products WHERE company_id = p_company_id AND deleted_at IS NULL AND COALESCE(item_type, 'stock') <> 'service'),
    'total_stock_qty', COALESCE((SELECT sum(total_qty) FROM prod_stock), 0),
    'total_avail_qty', COALESCE((SELECT sum(avail_qty) FROM prod_stock), 0),
    'total_stock_cost', COALESCE(round((SELECT sum(stock_cost_val) FROM prod_stock), 2), 0),
    'total_stock_sale', COALESCE(round((SELECT sum(stock_sale_val) FROM prod_stock), 2), 0),
    'out_of_stock_count', COALESCE((SELECT count(*) FROM prod_stock WHERE COALESCE(avail_qty, 0) <= 0), 0),
    'low_stock_count', COALESCE((SELECT count(*) FROM prod_stock WHERE COALESCE(avail_qty, 0) > 0 AND COALESCE(avail_qty, 0) <= COALESCE(min_stock, 0)), 0),
    'net_sales_qty_30d', COALESCE((SELECT net_qty_30d FROM sales_agg), 0),
    'net_sales_qty_90d', COALESCE((SELECT net_qty_90d FROM sales_agg), 0),
    'net_sales_qty_lookback', COALESCE((SELECT net_qty_lookback FROM sales_agg), 0),
    'net_revenue_lookback', COALESCE(round((SELECT net_revenue_lookback FROM sales_agg), 2), 0)
  ) INTO v_totals;

  SELECT COALESCE(jsonb_agg(a_row), '[]'::jsonb)
  INTO v_top_alerts
  FROM (
    SELECT
      p.id AS product_id,
      p.sku,
      p.name_ar,
      p.min_stock_level,
      COALESCE(SUM(ps.quantity), 0) AS total_qty,
      COALESCE(SUM(GREATEST(ps.quantity - COALESCE(ps.reserved_quantity, 0) - COALESCE(ps.damaged_quantity, 0), 0)), 0) AS avail_qty
    FROM public.products p
    LEFT JOIN public.product_stock ps ON ps.company_id = p_company_id AND ps.product_id = p.id
    LEFT JOIN public.warehouses w ON w.id = ps.warehouse_id AND w.deleted_at IS NULL
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND COALESCE(p.item_type, 'stock') <> 'service'
      AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
    GROUP BY p.id, p.sku, p.name_ar, p.min_stock_level
    HAVING COALESCE(SUM(GREATEST(ps.quantity - COALESCE(ps.reserved_quantity, 0) - COALESCE(ps.damaged_quantity, 0), 0)), 0) <= COALESCE(p.min_stock_level, 0)
    ORDER BY COALESCE(SUM(GREATEST(ps.quantity - COALESCE(ps.reserved_quantity, 0) - COALESCE(ps.damaged_quantity, 0), 0)), 0) ASC, p.min_stock_level DESC NULLS LAST
    LIMIT 50
  ) a_row;

  SELECT COALESCE(jsonb_agg(po_row), '[]'::jsonb)
  INTO v_open_pos
  FROM (
    SELECT
      poi.product_id,
      SUM(GREATEST(poi.quantity - COALESCE(poi.received_quantity, 0), 0)) AS incoming_qty,
      MIN(po.expected_delivery_date) AS earliest_eta
    FROM public.prc_purchase_order_items poi
    JOIN public.prc_purchase_orders po ON po.po_id = poi.po_id
    WHERE po.company_id = p_company_id
      AND po.status IN ('approved', 'issued', 'confirmed', 'partially_received')
      AND poi.product_id IS NOT NULL
    GROUP BY poi.product_id
    HAVING SUM(GREATEST(poi.quantity - COALESCE(poi.received_quantity, 0), 0)) > 0
    LIMIT 200
  ) po_row;

  SELECT COALESCE(jsonb_agg(tr_row), '[]'::jsonb)
  INTO v_pending_transfers
  FROM (
    SELECT
      sti.product_id,
      fw.branch_id AS from_branch_id,
      tw.branch_id AS to_branch_id,
      SUM(sti.quantity) AS quantity
    FROM public.stock_transfer_items sti
    JOIN public.stock_transfers st ON st.id = sti.transfer_id
    JOIN public.warehouses fw ON fw.id = st.from_warehouse_id
    JOIN public.warehouses tw ON tw.id = st.to_warehouse_id
    WHERE st.company_id = p_company_id
      AND st.status = 'pending'
      AND st.reversed_at IS NULL
    GROUP BY sti.product_id, fw.branch_id, tw.branch_id
    LIMIT 200
  ) tr_row;

  RETURN jsonb_build_object(
    'branches', v_branches,
    'totals', v_totals,
    'top_alerts', v_top_alerts,
    'open_pos', v_open_pos,
    'pending_transfers', v_pending_transfers,
    'generated_at', now()
  );
END;
$function$;

-- 3. Server-side paginated product intelligence slice
CREATE OR REPLACE FUNCTION public.fn_get_inventory_intelligence_products_page(
  p_company_id uuid,
  p_lookback_days integer DEFAULT 365,
  p_branch_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(btrim(p_search), '');
  v_total integer;
  v_items jsonb;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT count(*)::integer INTO v_total
  FROM public.products p
  WHERE p.company_id = p_company_id
    AND p.deleted_at IS NULL
    AND COALESCE(p.item_type, 'stock') <> 'service'
    AND (
      v_search IS NULL
      OR p.name_ar ILIKE '%' || v_search || '%'
      OR p.sku ILIKE '%' || v_search || '%'
      OR p.part_number ILIKE '%' || v_search || '%'
    );

  WITH page_prods AS (
    SELECT p.id, p.name_ar, p.sku, p.part_number, p.brand, p.min_stock_level,
           p.cost_price, p.purchase_price, p.sale_price, p.category_id, pc.name AS category_name
    FROM public.products p
    LEFT JOIN public.product_categories pc ON pc.id = p.category_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND COALESCE(p.item_type, 'stock') <> 'service'
      AND (
        v_search IS NULL
        OR p.name_ar ILIKE '%' || v_search || '%'
        OR p.sku ILIKE '%' || v_search || '%'
        OR p.part_number ILIKE '%' || v_search || '%'
      )
    ORDER BY p.created_at DESC, p.id ASC
    LIMIT v_limit OFFSET v_offset
  ),
  stock_agg AS (
    SELECT
      ps.product_id,
      jsonb_agg(jsonb_build_object(
        'warehouse_id', ps.warehouse_id,
        'branch_id', w.branch_id,
        'quantity', ps.quantity,
        'reserved_quantity', COALESCE(ps.reserved_quantity, 0),
        'damaged_quantity', COALESCE(ps.damaged_quantity, 0),
        'weighted_avg_cost', COALESCE(NULLIF(ps.weighted_avg_cost, 0), pp.cost_price, pp.purchase_price, 0)
      )) AS stock_by_warehouse
    FROM page_prods pp
    JOIN public.product_stock ps ON ps.company_id = p_company_id AND ps.product_id = pp.id
    JOIN public.warehouses w ON w.id = ps.warehouse_id AND w.deleted_at IS NULL
    WHERE (p_branch_id IS NULL OR w.branch_id = p_branch_id)
    GROUP BY ps.product_id
  ),
  sales_agg AS (
    SELECT
      ii.product_id,
      SUM(CASE WHEN i.issue_date >= CURRENT_DATE - 30 THEN CASE WHEN i.type = 'sale' THEN ii.quantity ELSE -ii.quantity END ELSE 0 END) AS net_qty_30,
      SUM(CASE WHEN i.issue_date >= CURRENT_DATE - 90 THEN CASE WHEN i.type = 'sale' THEN ii.quantity ELSE -ii.quantity END ELSE 0 END) AS net_qty_90,
      SUM(CASE WHEN i.type = 'sale' THEN ii.quantity ELSE -ii.quantity END) AS net_qty_lookback,
      SUM(CASE WHEN i.type = 'sale' THEN ii.total ELSE -ii.total END) AS net_revenue_lookback
    FROM page_prods pp
    JOIN public.invoice_items ii ON ii.product_id = pp.id
    JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.type IN ('sale', 'sale_return', 'sales_return')
      AND i.issue_date >= CURRENT_DATE - GREATEST(p_lookback_days, 30)
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    GROUP BY ii.product_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pp.id,
    'name_ar', pp.name_ar,
    'sku', pp.sku,
    'part_number', pp.part_number,
    'brand', pp.brand,
    'category_name', pp.category_name,
    'min_stock_level', pp.min_stock_level,
    'cost_price', pp.cost_price,
    'sale_price', pp.sale_price,
    'stock_by_warehouse', COALESCE(sa.stock_by_warehouse, '[]'::jsonb),
    'net_qty_30', COALESCE(sl.net_qty_30, 0),
    'net_qty_90', COALESCE(sl.net_qty_90, 0),
    'net_qty_lookback', COALESCE(sl.net_qty_lookback, 0),
    'net_revenue_lookback', COALESCE(sl.net_revenue_lookback, 0)
  )), '[]'::jsonb)
  INTO v_items
  FROM page_prods pp
  LEFT JOIN stock_agg sa ON sa.product_id = pp.id
  LEFT JOIN sales_agg sl ON sl.product_id = pp.id;

  RETURN jsonb_build_object(
    'total_count', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'items', v_items
  );
END;
$function$;
