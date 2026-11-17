-- AI-Powered Inventory Intelligence, Demand Forecasting, Procurement & Branch Optimization Engine
-- Migration: 20261117000001_ai_inventory_intelligence_engine.sql

-- 1. Extend product_cross_references with verification workflow metadata
ALTER TABLE public.product_cross_references
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending_review', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS relationship_type text NOT NULL DEFAULT 'aftermarket_alternative'
    CHECK (relationship_type IN ('oem_equivalent', 'aftermarket_alternative', 'compatible_different_grade', 'unverified_similar')),
  ADD COLUMN IF NOT EXISTS confidence numeric(5,2) NOT NULL DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- 2. Engine Configuration & Inventory Policies (per company)
CREATE TABLE IF NOT EXISTS public.inv_intelligence_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  forecast_horizons integer[] NOT NULL DEFAULT ARRAY[7, 14, 30, 60, 90],
  default_horizon_days integer NOT NULL DEFAULT 30,
  default_lead_time_days integer NOT NULL DEFAULT 14,
  review_period_days integer NOT NULL DEFAULT 14,
  safety_stock_service_level numeric(4,2) NOT NULL DEFAULT 0.95,
  target_coverage_days integer NOT NULL DEFAULT 45,
  dead_stock_days_threshold integer NOT NULL DEFAULT 120,
  slow_moving_days_threshold integer NOT NULL DEFAULT 60,
  growth_rate_threshold numeric(5,2) NOT NULL DEFAULT 25.00,
  spike_zscore_threshold numeric(4,2) NOT NULL DEFAULT 2.50,
  min_order_qty_default integer NOT NULL DEFAULT 1,
  preferred_model text NOT NULL DEFAULT 'auto',
  analysis_schedule text NOT NULL DEFAULT 'daily',
  branch_strategies jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inv_intelligence_config_company UNIQUE (company_id)
);

-- 3. Analysis Execution & Training Runs
CREATE TABLE IF NOT EXISTS public.inv_intelligence_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
  triggered_by uuid REFERENCES auth.users(id),
  products_analyzed integer NOT NULL DEFAULT 0,
  forecasts_generated integer NOT NULL DEFAULT 0,
  transfer_recommendations_count integer NOT NULL DEFAULT 0,
  purchase_recommendations_count integer NOT NULL DEFAULT 0,
  champion_model text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 4. Demand Forecast Records (per product + branch or company-wide NULL branch)
CREATE TABLE IF NOT EXISTS public.inv_demand_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.inv_intelligence_runs(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  horizon_days integer NOT NULL,
  demand_pattern text NOT NULL,
  selected_model text NOT NULL,
  model_version text NOT NULL DEFAULT 'v1.0',
  predicted_qty numeric(14,2) NOT NULL DEFAULT 0,
  daily_rate numeric(14,4) NOT NULL DEFAULT 0,
  confidence_score numeric(5,2) NOT NULL DEFAULT 0,
  mae numeric(14,4),
  wape numeric(8,4),
  forecast_bias numeric(8,4),
  stockout_adjusted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_demand_forecasts_lookup
  ON public.inv_demand_forecasts(company_id, product_id, branch_id, horizon_days);

-- 5. Model Evaluation & Backtesting History
CREATE TABLE IF NOT EXISTS public.inv_model_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.inv_intelligence_runs(id) ON DELETE CASCADE,
  model_name text NOT NULL,
  model_version text NOT NULL DEFAULT 'v1.0',
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  demand_pattern text NOT NULL DEFAULT 'all',
  mae numeric(14,4) NOT NULL DEFAULT 0,
  wape numeric(8,4) NOT NULL DEFAULT 0,
  forecast_bias numeric(8,4) NOT NULL DEFAULT 0,
  sample_count integer NOT NULL DEFAULT 0,
  is_champion boolean NOT NULL DEFAULT false,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Auditable Recommendations & Decision History (Transfers, Purchases, Dead/Excess)
CREATE TABLE IF NOT EXISTS public.inv_intelligence_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.inv_intelligence_runs(id) ON DELETE SET NULL,
  rec_type text NOT NULL CHECK (rec_type IN ('transfer', 'purchase', 'excess_review')),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  from_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  to_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  recommended_qty numeric(14,2) NOT NULL DEFAULT 0,
  approved_qty numeric(14,2),
  urgency text NOT NULL DEFAULT 'medium' CHECK (urgency IN ('critical', 'high', 'medium', 'low')),
  confidence_score numeric(5,2) NOT NULL DEFAULT 0,
  model_version text NOT NULL DEFAULT 'v1.0',
  reason text NOT NULL,
  calculation_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'modified', 'rejected', 'postponed', 'executed')),
  decision_reason text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  linked_transfer_id uuid REFERENCES public.stock_transfers(id) ON DELETE SET NULL,
  linked_po_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_intel_recs_company_status
  ON public.inv_intelligence_recommendations(company_id, rec_type, status, created_at DESC);

-- Enable RLS on all new tables
ALTER TABLE public.inv_intelligence_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_intelligence_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_demand_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_model_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_intelligence_recommendations ENABLE ROW LEVEL SECURITY;

-- Company-scoped RLS policies
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inv_intelligence_config',
    'inv_intelligence_runs',
    'inv_demand_forecasts',
    'inv_model_evaluations',
    'inv_intelligence_recommendations'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_company_policy', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (company_id IN (SELECT company_id FROM public.user_company_roles WHERE user_id = auth.uid())) WITH CHECK (company_id IN (SELECT company_id FROM public.user_company_roles WHERE user_id = auth.uid()))',
      t || '_company_policy', t
    );
  END LOOP;
END $$;

-- 7. Analytical Snapshot RPC (pre-aggregated server-side so daily POS/Sales never slow down)
CREATE OR REPLACE FUNCTION public.fn_get_inventory_intelligence_snapshot(
  p_company_id uuid,
  p_lookback_days integer DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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
      b.id,
      b.name,
      b.code,
      b.is_main,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', w.id, 'name_ar', w.name_ar, 'is_primary', w.is_primary))
        FROM public.warehouses w
        WHERE w.company_id = p_company_id AND w.branch_id = b.id AND w.deleted_at IS NULL
      ), '[]'::jsonb) AS warehouses
    FROM public.branches b
    WHERE b.company_id = p_company_id
  ) b_row;

  -- 2) Products + per-branch stock & WAC
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

  -- 3) Aggregated sales & returns per (product_id, branch_id) across windows (7, 30, 90, 180, 365)
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

  -- 4) Monthly buckets (last 12 months) per (product_id, branch_id) for ML/Time-Series backtesting & seasonality
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

  -- 5) Real Supplier Purchase History per (product_id, supplier_id) mined from purchase invoices
  SELECT COALESCE(jsonb_agg(sup_row), '[]'::jsonb)
  INTO v_supplier_history
  FROM (
    SELECT
      ii.product_id,
      i.party_id AS supplier_id,
      COALESCE(pt.name, 'مورد غير محدد') AS supplier_name,
      COUNT(DISTINCT i.id) AS purchase_tx_count,
      SUM(ii.quantity) AS total_qty_supplied,
      AVG(ii.unit_price) AS avg_unit_price,
      (ARRAY_AGG(ii.unit_price ORDER BY i.issue_date DESC, i.created_at DESC))[1] AS last_unit_price,
      (ARRAY_AGG(ii.quantity ORDER BY i.issue_date DESC, i.created_at DESC))[1] AS last_qty,
      MAX(i.issue_date) AS last_purchase_date
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    LEFT JOIN public.parties pt ON pt.id = i.party_id
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.type = 'purchase'
      AND ii.product_id IS NOT NULL
      AND i.party_id IS NOT NULL
    GROUP BY ii.product_id, i.party_id, pt.name
  ) sup_row;

  -- 6) Open Purchase Orders (incoming quantities not yet fully received)
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

  -- 6b) Pending inter-branch stock transfers
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

  -- 6c) Vehicle Fitments
  SELECT COALESCE(jsonb_agg(fit_row), '[]'::jsonb)
  INTO v_fitments
  FROM (
    SELECT
      pf.product_id,
      v.make,
      v.model,
      v.year_start,
      v.year_end,
      v.engine
    FROM public.product_fitment pf
    JOIN public.vehicles v ON v.id = pf.vehicle_id AND v.deleted_at IS NULL
    WHERE pf.company_id = p_company_id
      AND pf.deleted_at IS NULL
  ) fit_row;

  -- 7) Product Cross References / Alternatives
  SELECT COALESCE(jsonb_agg(cr_row), '[]'::jsonb)
  INTO v_cross_refs
  FROM (
    SELECT
      cr.id,
      cr.base_product_id,
      cr.alternative_product_id,
      cr.match_quality,
      cr.relationship_type,
      cr.status,
      cr.confidence,
      cr.source,
      cr.notes
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
    'cross_references', v_cross_refs,
    'generated_at', now()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_get_inventory_intelligence_snapshot(uuid, integer) TO authenticated;
