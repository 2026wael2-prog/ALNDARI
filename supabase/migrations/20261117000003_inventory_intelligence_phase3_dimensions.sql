-- Phase 3: Deep Dimensions (size, customer_demand) & Channel Dispatch Tables
-- Safe, additive migration (does not alter existing financial/stock balances).
-- NOTE: Pending controlled staging validation. Do not enable pg_cron or deploy to production without sign-off.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS size text;

CREATE TABLE IF NOT EXISTS public.intelligence_dispatch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('telegram', 'whatsapp', 'both')),
  scope text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  summary_preview text,
  sent_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intelligence_dispatch_logs_company_created
  ON public.intelligence_dispatch_logs (company_id, created_at DESC);

ALTER TABLE public.intelligence_dispatch_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intelligence_dispatch_logs_company_isolation ON public.intelligence_dispatch_logs;
CREATE POLICY intelligence_dispatch_logs_company_isolation
  ON public.intelligence_dispatch_logs
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Update fn_get_inventory_intelligence_snapshot to include p.size and customer_demand
CREATE OR REPLACE FUNCTION public.fn_get_inventory_intelligence_snapshot(
  p_company_id uuid,
  p_lookback_days integer DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_main_branch_id uuid;
  v_branches jsonb;
  v_products jsonb;
  v_sales_history jsonb;
  v_monthly_sales jsonb;
  v_supplier_history jsonb;
  v_customer_demand jsonb;
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

  -- 1) Active branches + warehouses
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

  -- 2) Products + structured origin/quality/size + stock (physical, reserved, damaged)
  SELECT COALESCE(jsonb_agg(p_row), '[]'::jsonb)
  INTO v_products
  FROM (
    SELECT
      p.id,
      p.name_ar,
      p.sku,
      p.part_number,
      p.alternative_numbers,
      p.brand,
      p.origin_country,
      p.size,
      p.quality_grade,
      p.classification_status,
      p.created_at,
      p.item_type,
      p.min_stock_level,
      p.cost_price,
      p.purchase_price,
      p.sale_price,
      p.category_id,
      pc.name AS category_name,
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

  -- 3) Aggregated sales & returns per (product_id, branch_id)
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
      SUM(CASE WHEN i.type = 'sale' THEN ii.total ELSE -ii.total END) AS net_revenue_365,
      SUM(CASE WHEN i.type = 'sale' THEN ii.quantity * COALESCE(NULLIF(ii.cost_price, 0), p.cost_price, 0) ELSE -ii.quantity * COALESCE(NULLIF(ii.cost_price, 0), p.cost_price, 0) END) AS net_cogs_365,
      COUNT(DISTINCT CASE WHEN i.type = 'sale' THEN i.id END) AS sale_tx_count,
      COUNT(DISTINCT CASE WHEN i.type = 'sale' THEN i.issue_date END) AS demand_days_count,
      SUM(CASE WHEN i.type IN ('sale_return', 'sales_return') THEN ii.quantity ELSE 0 END) AS returned_qty,
      MAX(CASE WHEN i.type = 'sale' THEN i.issue_date END) AS last_sale_date,
      MIN(CASE WHEN i.type = 'sale' THEN i.issue_date END) AS first_sale_date
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    JOIN public.products p ON p.id = ii.product_id
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.type IN ('sale', 'sale_return', 'sales_return')
      AND i.issue_date >= CURRENT_DATE - GREATEST(p_lookback_days, 365)
      AND ii.product_id IS NOT NULL
    GROUP BY ii.product_id, COALESCE(i.branch_id, v_main_branch_id)
  ) s_row;

  -- 4) Monthly buckets (last 12 months) per (product_id, branch_id)
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
      AND i.type IN ('sale', 'sale_return', 'sales_return')
      AND i.issue_date >= CURRENT_DATE - 365
      AND ii.product_id IS NOT NULL
    GROUP BY ii.product_id, COALESCE(i.branch_id, v_main_branch_id), date_trunc('month', i.issue_date)
  ) m_row;

  -- 5) Supplier purchase history + measured GRN lead times & purchase returns
  SELECT COALESCE(jsonb_agg(sup_row), '[]'::jsonb)
  INTO v_supplier_history
  FROM (
    WITH grn_per_po_prod AS (
      SELECT
        grn.po_id,
        gri.product_id,
        SUM(gri.accepted_quantity) AS accepted_qty,
        MAX(grn.receipt_date) AS latest_receipt_date
      FROM public.prc_goods_receipt_items gri
      JOIN public.prc_goods_receipts grn ON grn.grn_id = gri.grn_id
      WHERE grn.company_id = p_company_id
        AND grn.status <> 'cancelled'
        AND gri.product_id IS NOT NULL
      GROUP BY grn.po_id, gri.product_id
    ),
    po_per_po_prod AS (
      SELECT
        po.po_id,
        po.supplier_id,
        poi.product_id,
        COALESCE(po.issue_date::timestamptz, po.created_at) AS po_start_at,
        SUM(poi.quantity) AS ordered_qty
      FROM public.prc_purchase_order_items poi
      JOIN public.prc_purchase_orders po ON po.po_id = poi.po_id
      WHERE po.company_id = p_company_id
        AND poi.product_id IS NOT NULL
      GROUP BY po.po_id, po.supplier_id, poi.product_id, COALESCE(po.issue_date::timestamptz, po.created_at)
    ),
    po_lead AS (
      SELECT
        p.product_id,
        p.supplier_id,
        AVG(EXTRACT(EPOCH FROM (g.latest_receipt_date - p.po_start_at)) / 86400.0) AS measured_lead_days,
        SUM(g.accepted_qty) AS total_grn_received,
        SUM(p.ordered_qty) AS total_po_ordered
      FROM po_per_po_prod p
      JOIN grn_per_po_prod g ON g.po_id = p.po_id AND g.product_id = p.product_id
      WHERE g.latest_receipt_date >= p.po_start_at
      GROUP BY p.product_id, p.supplier_id
    ),
    pur_returns AS (
      SELECT
        ii.product_id,
        i.party_id AS supplier_id,
        COUNT(DISTINCT i.id) AS return_tx_count,
        SUM(ii.quantity) AS returned_qty
      FROM public.invoice_items ii
      JOIN public.invoices i ON i.id = ii.invoice_id
      WHERE i.company_id = p_company_id
        AND i.deleted_at IS NULL
        AND i.status IN ('posted', 'paid', 'partially_paid')
        AND i.type IN ('purchase_return', 'purchases_return')
        AND ii.product_id IS NOT NULL
        AND i.party_id IS NOT NULL
      GROUP BY ii.product_id, i.party_id
    )
    SELECT
      ii.product_id,
      i.party_id AS supplier_id,
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
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.type = 'purchase'
      AND ii.product_id IS NOT NULL
      AND i.party_id IS NOT NULL
    GROUP BY ii.product_id, i.party_id, pt.name, pl.measured_lead_days, pl.total_grn_received, pl.total_po_ordered, pr.return_tx_count, pr.returned_qty
  ) sup_row;

  -- 5b) Customer-level & branch-level product demand (top 5 customers per product-branch, no duplicate invoice aggregation)
  SELECT COALESCE(jsonb_agg(cust_row), '[]'::jsonb)
  INTO v_customer_demand
  FROM (
    SELECT
      ranked.product_id,
      ranked.branch_id,
      ranked.customer_id,
      ranked.customer_name,
      ranked.qty_365d,
      ranked.revenue_365d,
      ranked.tx_count,
      ranked.last_order_date
    FROM (
      SELECT
        ii.product_id,
        COALESCE(i.branch_id, v_main_branch_id) AS branch_id,
        i.party_id AS customer_id,
        COALESCE(pt.name, 'عميل غير محدد') AS customer_name,
        SUM(CASE WHEN i.type = 'sale' THEN ii.quantity ELSE -ii.quantity END) AS qty_365d,
        SUM(CASE WHEN i.type = 'sale' THEN ii.total ELSE -ii.total END) AS revenue_365d,
        COUNT(DISTINCT CASE WHEN i.type = 'sale' THEN i.id END) AS tx_count,
        MAX(CASE WHEN i.type = 'sale' THEN i.issue_date END) AS last_order_date,
        ROW_NUMBER() OVER (
          PARTITION BY ii.product_id, COALESCE(i.branch_id, v_main_branch_id)
          ORDER BY SUM(CASE WHEN i.type = 'sale' THEN ii.quantity ELSE -ii.quantity END) DESC
        ) AS rn
      FROM public.invoice_items ii
      JOIN public.invoices i ON i.id = ii.invoice_id
      JOIN public.parties pt ON pt.id = i.party_id AND pt.company_id = p_company_id
      WHERE i.company_id = p_company_id
        AND i.deleted_at IS NULL
        AND i.status IN ('posted', 'paid', 'partially_paid')
        AND i.type IN ('sale', 'sale_return', 'sales_return')
        AND i.issue_date >= CURRENT_DATE - GREATEST(p_lookback_days, 365)
        AND ii.product_id IS NOT NULL
        AND i.party_id IS NOT NULL
      GROUP BY ii.product_id, COALESCE(i.branch_id, v_main_branch_id), i.party_id, pt.name
      HAVING SUM(CASE WHEN i.type = 'sale' THEN ii.quantity ELSE -ii.quantity END) > 0
    ) ranked
    WHERE ranked.rn <= 5
  ) cust_row;

  -- 6) Open Purchase Orders
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
  ) po_row;

  -- 6b) Pending transfers
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
      AND st.status IN ('pending', 'in_transit', 'approved')
      AND st.reversed_at IS NULL
    GROUP BY sti.product_id, fw.branch_id, tw.branch_id
  ) tr_row;

  -- 6c) Vehicle fitments
  SELECT COALESCE(jsonb_agg(fit_row), '[]'::jsonb)
  INTO v_fitments
  FROM (
    SELECT
      pf.product_id, v.make, v.model, v.year_start, v.year_end, v.engine
    FROM public.product_fitment pf
    JOIN public.vehicles v ON v.id = pf.vehicle_id AND v.deleted_at IS NULL
    WHERE pf.company_id = p_company_id AND pf.deleted_at IS NULL
  ) fit_row;

  -- 6d) Inventory receipt age & movement ledger summary per (product_id, branch_id)
  SELECT COALESCE(jsonb_agg(mv_row), '[]'::jsonb)
  INTO v_stock_movements
  FROM (
    SELECT
      it.product_id,
      COALESCE(w.branch_id, v_main_branch_id) AS branch_id,
      MAX(CASE WHEN it.quantity > 0 THEN it.created_at END) AS last_receipt_at,
      COUNT(*) AS ledger_tx_count,
      COUNT(DISTINCT CASE WHEN it.quantity < 0 THEN it.created_at::date END) AS issue_days_count
    FROM public.inventory_transactions it
    JOIN public.warehouses w ON w.id = it.warehouse_id
    WHERE it.company_id = p_company_id
      AND it.deleted_at IS NULL
      AND it.created_at >= now() - interval '365 days'
    GROUP BY it.product_id, COALESCE(w.branch_id, v_main_branch_id)
  ) mv_row;

  -- 6e) Supplier ordering constraints & verified UOM package sizes
  SELECT COALESCE(jsonb_agg(sc_row), '[]'::jsonb)
  INTO v_supplier_constraints
  FROM (
    SELECT
      sp.product_id,
      sp.supplier_id,
      sp.minimum_order_quantity,
      sp.order_multiple,
      sp.lead_time_days,
      u.uom_name,
      u.conversion_factor
    FROM public.prc_supplier_products sp
    LEFT JOIN LATERAL (
      SELECT pu.uom_name, pu.conversion_factor
      FROM public.product_uoms pu
      WHERE pu.product_id = sp.product_id
      ORDER BY pu.conversion_factor DESC
      LIMIT 1
    ) u ON true
    WHERE sp.company_id = p_company_id
      AND sp.is_active = true
  ) sc_row;

  -- 7) Product Cross References
  SELECT COALESCE(jsonb_agg(cr_row), '[]'::jsonb)
  INTO v_cross_refs
  FROM (
    SELECT
      cr.id, cr.base_product_id, cr.alternative_product_id,
      cr.match_quality, cr.relationship_type, cr.status,
      cr.confidence, cr.source, cr.notes
    FROM public.product_cross_references cr
    WHERE cr.company_id = p_company_id
  ) cr_row;

  RETURN jsonb_build_object(
    'branches', v_branches,
    'products', v_products,
    'sales_history', v_sales_history,
    'monthly_sales', v_monthly_sales,
    'supplier_history', v_supplier_history,
    'customer_demand', v_customer_demand,
    'open_pos', v_open_pos,
    'pending_transfers', v_pending_transfers,
    'fitments', v_fitments,
    'stock_movements', v_stock_movements,
    'supplier_constraints', v_supplier_constraints,
    'cross_references', v_cross_refs,
    'generated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_inventory_intelligence_snapshot(uuid, integer) TO authenticated;
