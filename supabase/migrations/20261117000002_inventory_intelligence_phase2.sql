-- Phase 2 Audit Remediation Migration (STAGING / REVIEW ONLY — DO NOT APPLY WITHOUT FINAL APPROVAL)
-- Migration: 20261117000002_inventory_intelligence_phase2.sql
-- Purpose:
--   1. Structured product origin & quality grade columns (separating Japanese & Korean aftermarket)
--   2. Explicit reserved_quantity & damaged_quantity on product_stock + forward-looking daily availability snapshots
--   3. Background scheduling log table (inv_scheduled_jobs_log) + advisory-locked runner fn_run_scheduled_inventory_intelligence
--   4. Enhanced fn_get_inventory_intelligence_snapshot with branch-level receipts, measured supplier lead times,
--      prc_supplier_products ordering constraints, product_uoms, pending_transfers, and vehicle fitments.

-- ============================================================================
-- 1. Structured Product Origin & Quality Classification (Idempotent)
-- ============================================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS origin_country text,
  ADD COLUMN IF NOT EXISTS quality_grade text
    CHECK (quality_grade IN (
      'genuine_oem',
      'japanese_aftermarket',
      'korean_aftermarket',
      'thai_aftermarket',
      'chinese_commercial',
      'other_aftermarket'
    )),
  ADD COLUMN IF NOT EXISTS classification_status text NOT NULL DEFAULT 'auto'
    CHECK (classification_status IN ('auto', 'pending_review', 'verified')),
  ADD COLUMN IF NOT EXISTS classification_reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS classification_reviewed_at timestamptz;

-- ============================================================================
-- 2. Explicit Stock Availability Columns + Transactional Sync Helper
-- ============================================================================
ALTER TABLE public.product_stock
  ADD COLUMN IF NOT EXISTS reserved_quantity numeric(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damaged_quantity numeric(19,4) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.inv_daily_availability_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  physical_qty numeric(19,4) NOT NULL DEFAULT 0,
  reserved_qty numeric(19,4) NOT NULL DEFAULT 0,
  damaged_qty numeric(19,4) NOT NULL DEFAULT 0,
  available_qty numeric(19,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inv_daily_avail_snap UNIQUE (company_id, product_id, warehouse_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_inv_daily_avail_lookup
  ON public.inv_daily_availability_snapshots(company_id, snapshot_date DESC, product_id);

ALTER TABLE public.inv_daily_availability_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inv_daily_avail_company_policy ON public.inv_daily_availability_snapshots;
CREATE POLICY inv_daily_avail_company_policy
  ON public.inv_daily_availability_snapshots
  FOR ALL
  USING (company_id IN (SELECT company_id FROM public.user_company_roles WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_company_roles WHERE user_id = auth.uid()));

-- Transactional RPC to adjust reserved/damaged stock with audit trail
CREATE OR REPLACE FUNCTION public.fn_adjust_product_stock_allocation(
  p_company_id uuid,
  p_product_id uuid,
  p_warehouse_id uuid,
  p_reserved_delta numeric DEFAULT 0,
  p_damaged_delta numeric DEFAULT 0,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.product_stock%ROWTYPE;
  v_next_reserved numeric;
  v_next_damaged numeric;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.role IN ('owner', 'admin', 'manager', 'inventory_manager')
  ) THEN
    RAISE EXCEPTION 'Insufficient permission to adjust stock allocation';
  END IF;

  SELECT * INTO v_row
  FROM public.product_stock
  WHERE company_id = p_company_id
    AND product_id = p_product_id
    AND warehouse_id = p_warehouse_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock record not found for product % in warehouse %', p_product_id, p_warehouse_id;
  END IF;

  v_next_reserved := GREATEST(0, v_row.reserved_quantity + COALESCE(p_reserved_delta, 0));
  v_next_damaged := GREATEST(0, v_row.damaged_quantity + COALESCE(p_damaged_delta, 0));

  IF (v_next_reserved + v_next_damaged) > v_row.quantity THEN
    RAISE EXCEPTION 'Over-allocation prevented: reserved (%) + damaged (%) cannot exceed physical stock (%)',
      v_next_reserved, v_next_damaged, v_row.quantity;
  END IF;

  UPDATE public.product_stock
  SET
    reserved_quantity = v_next_reserved,
    damaged_quantity = v_next_damaged,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  INSERT INTO public.inventory_transactions (
    company_id, product_id, warehouse_id, quantity, transaction_type,
    reference_type, unit_cost, total_cost, created_by
  ) VALUES (
    p_company_id, p_product_id, p_warehouse_id,
    COALESCE(p_damaged_delta, 0) * -1,
    CASE WHEN COALESCE(p_damaged_delta, 0) <> 0 THEN 'damage_adjustment' ELSE 'reservation_adjustment' END,
    COALESCE(p_reason, 'manual_allocation'),
    COALESCE(v_row.weighted_avg_cost, 0),
    ABS(COALESCE(p_damaged_delta, 0)) * COALESCE(v_row.weighted_avg_cost, 0),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true,
    'physical_quantity', v_row.quantity,
    'reserved_quantity', v_row.reserved_quantity,
    'damaged_quantity', v_row.damaged_quantity,
    'available_quantity', GREATEST(0, v_row.quantity - v_row.reserved_quantity - v_row.damaged_quantity)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_adjust_product_stock_allocation(uuid, uuid, uuid, numeric, numeric, text) TO authenticated;

-- ============================================================================
-- 3. Background Scheduling Log + Safe Advisory-Locked Runner (Not Activated)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inv_scheduled_jobs_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  job_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'skipped_locked')),
  attempt_count integer NOT NULL DEFAULT 1,
  stale_recommendations_marked integer NOT NULL DEFAULT 0,
  snapshots_captured integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_inv_sched_jobs_company_started
  ON public.inv_scheduled_jobs_log(company_id, started_at DESC);

ALTER TABLE public.inv_scheduled_jobs_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inv_sched_jobs_company_policy ON public.inv_scheduled_jobs_log;
CREATE POLICY inv_sched_jobs_company_policy
  ON public.inv_scheduled_jobs_log
  FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.user_company_roles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.fn_run_scheduled_inventory_intelligence(
  p_company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_locked boolean;
  v_log_id uuid;
  v_stale_count integer := 0;
  v_snap_count integer := 0;
  v_attempt integer := 1;
BEGIN
  -- Transaction-scoped advisory lock: automatically released on commit/rollback, safe under PgBouncer pooling
  v_locked := pg_try_advisory_xact_lock(hashtext('inv_intelligence_scheduled_job'));
  IF NOT v_locked THEN
    INSERT INTO public.inv_scheduled_jobs_log (company_id, job_name, status, completed_at, error_message)
    VALUES (p_company_id, 'inv_intelligence_maintenance', 'skipped_locked', now(), 'Another job instance holds advisory lock');
    RETURN jsonb_build_object('status', 'skipped_locked');
  END IF;

  SELECT COALESCE(MAX(attempt_count), 0) + 1 INTO v_attempt
  FROM public.inv_scheduled_jobs_log
  WHERE job_name = 'inv_intelligence_maintenance'
    AND status = 'failed'
    AND started_at >= CURRENT_DATE::timestamptz
    AND (p_company_id IS NULL OR company_id = p_company_id);

  INSERT INTO public.inv_scheduled_jobs_log (company_id, job_name, status, attempt_count)
  VALUES (p_company_id, 'inv_intelligence_maintenance', 'running', v_attempt)
  RETURNING id INTO v_log_id;

  -- 1) Detect & mark stale pending recommendations (> 7 days old)
  WITH updated_recs AS (
    UPDATE public.inv_intelligence_recommendations
    SET
      status = 'postponed',
      decision_reason = COALESCE(decision_reason, 'توصية قديمة انتهت صلاحيتها تلقائياً (>7 أيام)'),
      updated_at = now()
    WHERE status = 'pending'
      AND created_at < now() - interval '7 days'
      AND (p_company_id IS NULL OR company_id = p_company_id)
    RETURNING id
  )
  SELECT count(*) INTO v_stale_count FROM updated_recs;

  -- 2) Capture daily availability snapshots for future historical stockout reconstruction
  WITH inserted_snaps AS (
    INSERT INTO public.inv_daily_availability_snapshots (
      company_id, product_id, warehouse_id, snapshot_date,
      physical_qty, reserved_qty, damaged_qty, available_qty
    )
    SELECT
      ps.company_id,
      ps.product_id,
      ps.warehouse_id,
      CURRENT_DATE,
      ps.quantity,
      ps.reserved_quantity,
      ps.damaged_quantity,
      GREATEST(0, ps.quantity - ps.reserved_quantity - ps.damaged_quantity)
    FROM public.product_stock ps
    WHERE (p_company_id IS NULL OR ps.company_id = p_company_id)
    ON CONFLICT (company_id, product_id, warehouse_id, snapshot_date)
    DO UPDATE SET
      physical_qty = EXCLUDED.physical_qty,
      reserved_qty = EXCLUDED.reserved_qty,
      damaged_qty = EXCLUDED.damaged_qty,
      available_qty = EXCLUDED.available_qty
    RETURNING id
  )
  SELECT count(*) INTO v_snap_count FROM inserted_snaps;

  UPDATE public.inv_scheduled_jobs_log
  SET
    status = 'completed',
    stale_recommendations_marked = v_stale_count,
    snapshots_captured = v_snap_count,
    completed_at = now()
  WHERE id = v_log_id;

  RETURN jsonb_build_object(
    'status', 'completed',
    'attempt_count', v_attempt,
    'stale_marked', v_stale_count,
    'snapshots_captured', v_snap_count
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE public.inv_scheduled_jobs_log
  SET status = 'failed', error_message = SQLERRM, completed_at = now()
  WHERE id = v_log_id;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_run_scheduled_inventory_intelligence(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_run_scheduled_inventory_intelligence(uuid) TO service_role;

-- NOTE: Production pg_cron activation is intentionally commented out until final deployment approval:
-- SELECT cron.schedule('inv-intelligence-daily-maintenance', '30 2 * * *', 'SELECT public.fn_run_scheduled_inventory_intelligence(NULL)');

-- ============================================================================
-- 4. Performance Index for Inventory Transactions Ledger
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_inv_tx_company_prod_created
  ON public.inventory_transactions(company_id, product_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 5. Enhanced Analytical Snapshot RPC (Phase 2)
-- ============================================================================
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

  -- 2) Products + structured origin/quality + stock (physical, reserved, damaged)
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
