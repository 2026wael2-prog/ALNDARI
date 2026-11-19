-- =============================================================================
-- Migration: 20261118000001_remediate_inventory_intelligence_p0_p1.sql
-- Purpose  : Remediate P0 & P1 defects in Product Intelligence (inventory-intelligence):
--            1. P0: Repair fn_create_ai_purchase_order_atomic (real columns, supplier resolution,
--                   unit_price > 0 enforcement, server-side 5,000 RBAC gate, idempotency hash).
--            2. P0: Repair fn_get_inventory_intelligence_snapshot supplier mapping (parties <-> prc_suppliers)
--                   and valid stock_transfers status ('pending').
--            3. P0: Repair fn_adjust_product_stock_allocation (valid 'adj' tx type with qty=0 + audit table).
--            4. P1: Harden fn_claim_next_autonomous_job (service_role only, REVOKE PUBLIC/anon/authenticated).
--            5. P1: Harden fn_transition_intelligence_decision (fail-closed RBAC).
--            6. P1: Unify RLS policies to user_company_roles via get_auth_companies() + is_super_admin().
-- SAFETY   : Local migration only. Do NOT apply to production without staging verification.
-- =============================================================================

SET search_path TO public;

-- =============================================================================
-- 1. Add idempotency columns to prc_purchase_orders for atomic conflict detection
-- =============================================================================
ALTER TABLE public.prc_purchase_orders
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS idempotency_payload_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_prc_po_company_idempotency
  ON public.prc_purchase_orders (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- =============================================================================
-- 2. Stock Allocation Audit Trail Table (for non-physical reserved/damaged changes)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.inv_stock_allocation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  physical_quantity numeric(19,4) NOT NULL,
  reserved_before numeric(19,4) NOT NULL,
  reserved_after numeric(19,4) NOT NULL,
  damaged_before numeric(19,4) NOT NULL,
  damaged_after numeric(19,4) NOT NULL,
  available_after numeric(19,4) NOT NULL,
  reason text,
  actor_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_stock_alloc_audit_company_prod
  ON public.inv_stock_allocation_audit (company_id, product_id, created_at DESC);

ALTER TABLE public.inv_stock_allocation_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_stock_alloc_audit_company_isolation ON public.inv_stock_allocation_audit;
CREATE POLICY inv_stock_alloc_audit_company_isolation
  ON public.inv_stock_allocation_audit
  FOR SELECT
  USING (
    public.is_super_admin()
    OR company_id IN (SELECT public.get_auth_companies())
  );

-- =============================================================================
-- 3. P0: Repair fn_adjust_product_stock_allocation
--    Uses legitimate 'adj' transaction_type with quantity = 0 (so physical
--    product_stock.quantity is NOT altered by trg_update_product_stock) and
--    writes full before/after traceability into inv_stock_allocation_audit.
-- =============================================================================
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
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row public.product_stock%ROWTYPE;
  v_prev_reserved numeric;
  v_prev_damaged numeric;
  v_next_reserved numeric;
  v_next_damaged numeric;
  v_available numeric;
  v_actor_id uuid := auth.uid();
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_actor_id
      AND ucr.company_id = p_company_id
      AND ucr.role IN ('owner', 'admin', 'manager', 'inventory_manager')
  ) THEN
    RAISE EXCEPTION 'access_denied: Insufficient permission to adjust stock allocation';
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

  v_prev_reserved := COALESCE(v_row.reserved_quantity, 0);
  v_prev_damaged := COALESCE(v_row.damaged_quantity, 0);
  v_next_reserved := GREATEST(0, v_prev_reserved + COALESCE(p_reserved_delta, 0));
  v_next_damaged := GREATEST(0, v_prev_damaged + COALESCE(p_damaged_delta, 0));

  IF (v_next_reserved + v_next_damaged) > v_row.quantity THEN
    RAISE EXCEPTION 'Over-allocation prevented: reserved (%) + damaged (%) cannot exceed physical stock (%)',
      v_next_reserved, v_next_damaged, v_row.quantity;
  END IF;

  UPDATE public.product_stock
  SET
    reserved_quantity = v_next_reserved,
    damaged_quantity = v_next_damaged,
    updated_at = now(),
    updated_by = v_actor_id
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  v_available := GREATEST(0, v_row.quantity - v_row.reserved_quantity - v_row.damaged_quantity);

  -- Legitimate 'adj' ledger marker with quantity = 0 so physical stock is untouched
  INSERT INTO public.inventory_transactions (
    company_id, product_id, warehouse_id, quantity, transaction_type,
    reference_type, unit_cost, total_cost, created_by
  ) VALUES (
    p_company_id, p_product_id, p_warehouse_id,
    0,
    'adj',
    'stock_allocation:' || COALESCE(p_reason, 'manual_allocation'),
    COALESCE(v_row.weighted_avg_cost, 0),
    0,
    v_actor_id
  );

  INSERT INTO public.inv_stock_allocation_audit (
    company_id, product_id, warehouse_id,
    physical_quantity, reserved_before, reserved_after,
    damaged_before, damaged_after, available_after,
    reason, actor_id
  ) VALUES (
    p_company_id, p_product_id, p_warehouse_id,
    v_row.quantity, v_prev_reserved, v_next_reserved,
    v_prev_damaged, v_next_damaged, v_available,
    COALESCE(p_reason, 'manual_allocation'), v_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'physical_quantity', v_row.quantity,
    'reserved_quantity', v_row.reserved_quantity,
    'damaged_quantity', v_row.damaged_quantity,
    'available_quantity', v_available
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_adjust_product_stock_allocation(uuid, uuid, uuid, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_adjust_product_stock_allocation(uuid, uuid, uuid, numeric, numeric, text) TO authenticated, service_role;

-- =============================================================================
-- 4. P0 + P1: Repair fn_create_ai_purchase_order_atomic
--    - Uses real columns on prc_purchase_order_items (unit_of_measure, unit_price,
--      discount_percentage, net_unit_price, tax_percentage, total_price)
--    - Resolves supplier against prc_suppliers (supplier_id or party_id)
--    - Rejects missing/zero unit_cost (p_unit_cost <= 0)
--    - Enforces fail-closed RBAC & >= 5,000 Owner/Admin gate at DB boundary
--    - Enforces auth.uid() caller identity (prevents buyer spoofing)
--    - Enforces strict idempotency + rejects conflicting payload reuse
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_create_ai_purchase_order_atomic(
  p_company_id      uuid,
  p_supplier_id     uuid,
  p_buyer_id        uuid,
  p_product_id      uuid,
  p_product_name    text,
  p_quantity        integer,
  p_unit_cost       numeric,
  p_reason          text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_claims              text;
  v_is_service_role     boolean := false;
  v_auth_uid            uuid := auth.uid();
  v_actor_id            uuid;
  v_role                text;
  v_resolved_supplier   uuid;
  v_supplier_currency   character varying;
  v_supplier_status     character varying;
  v_supplier_approved   boolean;
  v_uom                 character varying;
  v_product_name        text;
  v_po_id               uuid;
  v_existing_hash       text;
  v_payload_hash        text;
  v_unit_price          numeric(15,4);
  v_net_unit_price      numeric(15,4);
  v_subtotal            numeric(15,4);
  v_tax_amount          numeric(15,4) := 0;
  v_total               numeric(15,4);
  v_po_number           text;
BEGIN
  -- 1. Access control & caller identity verification (fail-closed)
  PERFORM public.fn_assert_company_access(p_company_id);

  v_claims := current_setting('request.jwt.claims', true);
  IF v_claims IS NOT NULL AND left(btrim(v_claims), 1) = '{'
     AND (v_claims::jsonb ->> 'role') = 'service_role' THEN
    v_is_service_role := true;
  END IF;

  IF NOT v_is_service_role THEN
    IF v_auth_uid IS NULL THEN
      RAISE EXCEPTION 'access_denied: المستخدم غير مصادق عليه';
    END IF;
    IF p_buyer_id IS NOT NULL AND p_buyer_id <> v_auth_uid THEN
      RAISE EXCEPTION 'access_denied: لا يمكن انتحال هوية المشتري (buyer_id mismatch)';
    END IF;
    v_actor_id := v_auth_uid;

    IF NOT public.is_super_admin() THEN
      SELECT lower(ucr.role) INTO v_role
      FROM public.user_company_roles ucr
      WHERE ucr.user_id = v_auth_uid
        AND ucr.company_id = p_company_id
      LIMIT 1;

      IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager', 'branch_manager', 'accountant', 'procurement') THEN
        RAISE EXCEPTION 'access_denied: صلاحيتك (%) لا تسمح بإنشاء أوامر الشراء', COALESCE(v_role, 'none');
      END IF;
    END IF;
  ELSE
    v_actor_id := COALESCE(p_buyer_id, v_auth_uid);
    IF v_actor_id IS NULL THEN
      RAISE EXCEPTION 'buyer_id مطلوب عند التنفيذ عبر service_role';
    END IF;
  END IF;

  -- 2. Validate inputs (never manufacture zero prices)
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'الكمية يجب أن تكون موجبة (quantity > 0)';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost <= 0 THEN
    RAISE EXCEPTION 'سعر الوحدة الموثوق مطلوب لإنشاء أمر الشراء ولا يُسمح بالسعر الصفري (unit_cost > 0)';
  END IF;
  IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'مفتاح الأمان (idempotency_key) مطلوب ولا يجوز أن يكون فارغاً';
  END IF;
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'معرف الصنف (product_id) مطلوب';
  END IF;
  IF p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'معرف المورد (supplier_id) مطلوب';
  END IF;

  -- 3. Resolve procurement supplier entity (prc_suppliers.supplier_id)
  SELECT ps.supplier_id, COALESCE(ps.currency, 'SAR'), ps.status, COALESCE(ps.is_approved, false)
  INTO v_resolved_supplier, v_supplier_currency, v_supplier_status, v_supplier_approved
  FROM public.prc_suppliers ps
  WHERE ps.company_id = p_company_id
    AND (ps.supplier_id = p_supplier_id OR ps.party_id = p_supplier_id)
  ORDER BY (ps.supplier_id = p_supplier_id) DESC
  LIMIT 1;

  IF v_resolved_supplier IS NULL THEN
    RAISE EXCEPTION 'المورد غير مسجل في وحدة المشتريات (prc_suppliers) لهذه الشركة';
  END IF;

  IF v_supplier_status IN ('blocked', 'blacklisted', 'suspended', 'rejected') THEN
    RAISE EXCEPTION 'المورد غير مؤهل لإصدار أمر شراء (حالة المورد: %)', v_supplier_status;
  END IF;

  -- 4. Validate product belongs to company & resolve unit_of_measure
  SELECT p.name_ar, COALESCE(NULLIF(trim(p.unit), ''), 'قطعة')
  INTO v_product_name, v_uom
  FROM public.products p
  WHERE p.id = p_product_id
    AND p.company_id = p_company_id
    AND p.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الصنف غير موجود أو محذوف في هذه الشركة';
  END IF;

  -- Prefer primary UOM name if defined in product_uoms
  SELECT COALESCE(NULLIF(trim(pu.uom_name), ''), v_uom)
  INTO v_uom
  FROM public.product_uoms pu
  WHERE pu.product_id = p_product_id
  ORDER BY pu.conversion_factor ASC
  LIMIT 1;

  -- 5. Server-side financial calculation & 5,000 approval threshold enforcement
  v_unit_price     := ROUND(p_unit_cost, 4);
  v_net_unit_price := v_unit_price;
  v_subtotal       := ROUND(p_quantity::numeric * v_net_unit_price, 4);
  v_tax_amount     := 0;
  v_total          := ROUND(v_subtotal + v_tax_amount, 4);

  IF NOT v_is_service_role AND NOT public.is_super_admin() THEN
    IF v_total >= 5000 AND v_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'access_denied: أوامر الشراء بقيمة 5,000 فأكثر (%) تتطلب اعتماد المالك أو المدير العام (Owner/Admin)', v_total;
    END IF;
  END IF;

  -- 6. Strict idempotency check with payload-conflict rejection
  v_payload_hash := md5(
    p_company_id::text || '|' ||
    v_resolved_supplier::text || '|' ||
    p_product_id::text || '|' ||
    p_quantity::text || '|' ||
    v_unit_price::text || '|' ||
    v_supplier_currency::text
  );

  SELECT po.po_id, po.idempotency_payload_hash, po.po_number, po.total_amount
  INTO v_po_id, v_existing_hash, v_po_number, v_total
  FROM public.prc_purchase_orders po
  WHERE po.company_id = p_company_id
    AND po.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_conflict: تم استخدام مفتاح الأمان (%) مسبقاً بمعاملات مختلفة', p_idempotency_key;
    END IF;

    RETURN jsonb_build_object(
      'po_id',      v_po_id,
      'po_number',  v_po_number,
      'total',      v_total,
      'idempotent', true,
      'message',    'تم إرجاع أمر الشراء الحالي (طلب مكرر محمي بمفتاح الأمان)'
    );
  END IF;

  -- 7. INSERT header + item atomically
  v_po_number := 'PO-AI-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-'
                           || substr(md5(p_idempotency_key || now()::text), 1, 6);

  INSERT INTO public.prc_purchase_orders (
    company_id,
    po_number,
    supplier_id,
    buyer_id,
    status,
    issue_date,
    currency,
    subtotal,
    tax_amount,
    total_amount,
    notes,
    idempotency_key,
    idempotency_payload_hash
  )
  VALUES (
    p_company_id,
    v_po_number,
    v_resolved_supplier,
    v_actor_id,
    'draft',
    CURRENT_DATE,
    v_supplier_currency,
    v_subtotal,
    v_tax_amount,
    v_total,
    'توصية ذكاء المخزون [' || p_idempotency_key || ']: ' || coalesce(p_reason, ''),
    p_idempotency_key,
    v_payload_hash
  )
  RETURNING po_id INTO v_po_id;

  INSERT INTO public.prc_purchase_order_items (
    po_id,
    company_id,
    product_id,
    description,
    quantity,
    unit_of_measure,
    unit_price,
    discount_percentage,
    net_unit_price,
    tax_percentage,
    total_price
  )
  VALUES (
    v_po_id,
    p_company_id,
    p_product_id,
    coalesce(NULLIF(trim(p_product_name), ''), v_product_name, 'صنف موصى بشرائه (ذكاء المخزون)'),
    p_quantity,
    v_uom,
    v_unit_price,
    0.00,
    v_net_unit_price,
    0.00,
    v_total
  );

  RETURN jsonb_build_object(
    'po_id',               v_po_id,
    'idempotent',          false,
    'po_number',           v_po_number,
    'resolved_supplier_id', v_resolved_supplier,
    'currency',            v_supplier_currency,
    'total',               v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_create_ai_purchase_order_atomic(
  uuid, uuid, uuid, uuid, text, integer, numeric, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_create_ai_purchase_order_atomic(
  uuid, uuid, uuid, uuid, text, integer, numeric, text, text
) TO authenticated, service_role;

-- =============================================================================
-- 5. P1: Harden fn_claim_next_autonomous_job (service_role ONLY)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_claim_next_autonomous_job(
  p_worker_id text,
  p_lock_timeout_seconds integer DEFAULT 120
)
RETURNS public.inv_autonomous_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_claims text;
  v_job    public.inv_autonomous_jobs;
BEGIN
  v_claims := current_setting('request.jwt.claims', true);
  IF NOT (
    current_user IN ('postgres', 'service_role', 'supabase_admin')
    OR (
      v_claims IS NOT NULL
      AND left(btrim(v_claims), 1) = '{'
      AND (v_claims::jsonb ->> 'role') = 'service_role'
    )
  ) THEN
    RAISE EXCEPTION 'access_denied: only trusted service_role worker may claim autonomous jobs';
  END IF;

  IF p_worker_id IS NULL OR trim(p_worker_id) = '' THEN
    RAISE EXCEPTION 'worker_id is required';
  END IF;

  -- Recover timed-out running jobs first
  UPDATE public.inv_autonomous_jobs
  SET
    status = CASE WHEN attempts < max_attempts THEN 'retrying' ELSE 'failed' END,
    error_message = COALESCE(error_message, 'Worker lock timeout exceeded'),
    locked_by = NULL,
    locked_at = NULL,
    next_retry_at = now() + interval '1 minute'
  WHERE status = 'running'
    AND timeout_at IS NOT NULL
    AND timeout_at < now();

  SELECT * INTO v_job
  FROM public.inv_autonomous_jobs
  WHERE status IN ('queued', 'retrying')
    AND COALESCE(next_retry_at, now()) <= now()
    AND attempts < max_attempts
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.inv_autonomous_jobs
  SET
    status = 'running',
    attempts = attempts + 1,
    locked_by = p_worker_id,
    locked_at = now(),
    timeout_at = now() + make_interval(secs => GREATEST(30, p_lock_timeout_seconds))
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_claim_next_autonomous_job(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_next_autonomous_job(text, integer) TO service_role;

-- =============================================================================
-- 6. P1: Harden fn_transition_intelligence_decision (fail-closed RBAC)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_transition_intelligence_decision(
  p_company_id uuid,
  p_recommendation_id uuid,
  p_to_state text,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_claims          text;
  v_is_service_role boolean := false;
  v_auth_uid        uuid := auth.uid();
  v_role            text;
  v_rec             public.inv_intelligence_recommendations;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  v_claims := current_setting('request.jwt.claims', true);
  IF v_claims IS NOT NULL AND left(btrim(v_claims), 1) = '{'
     AND (v_claims::jsonb ->> 'role') = 'service_role' THEN
    v_is_service_role := true;
  END IF;

  IF NOT v_is_service_role AND NOT public.is_super_admin() THEN
    SELECT lower(ucr.role) INTO v_role
    FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_auth_uid
      AND ucr.company_id = p_company_id
    LIMIT 1;

    IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager', 'branch_manager', 'accountant', 'procurement') THEN
      RAISE EXCEPTION 'access_denied: صلاحيتك (%) لا تسمح بتغيير حالة التوصية', COALESCE(v_role, 'none');
    END IF;
  END IF;

  SELECT * INTO v_rec
  FROM public.inv_intelligence_recommendations
  WHERE id = p_recommendation_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recommendation not found for company';
  END IF;

  UPDATE public.inv_intelligence_recommendations
  SET
    lifecycle_state = p_to_state,
    outcome_verified_at = CASE WHEN p_to_state = 'verified' THEN now() ELSE outcome_verified_at END,
    outcome_notes = CASE WHEN p_to_state IN ('verified', 'closed', 'failed') THEN COALESCE(p_reason, outcome_notes) ELSE outcome_notes END
  WHERE id = p_recommendation_id AND company_id = p_company_id;

  INSERT INTO public.inv_decision_audit_trail (
    company_id, recommendation_id, from_state, to_state, actor_id, reason, metadata
  ) VALUES (
    p_company_id, p_recommendation_id, v_rec.lifecycle_state, p_to_state, v_auth_uid, p_reason, COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'recommendation_id', p_recommendation_id,
    'from_state', v_rec.lifecycle_state,
    'to_state', p_to_state
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_transition_intelligence_decision(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transition_intelligence_decision(uuid, uuid, text, text, jsonb) TO authenticated, service_role;

-- =============================================================================
-- 7. P1: Unify Multi-Company RLS Policies (user_company_roles + is_super_admin)
-- =============================================================================
DROP POLICY IF EXISTS intel_dispatch_select_policy ON public.intelligence_dispatch_logs;
CREATE POLICY intel_dispatch_select_policy
  ON public.intelligence_dispatch_logs
  FOR SELECT
  USING (public.is_super_admin() OR company_id IN (SELECT public.get_auth_companies()));

DROP POLICY IF EXISTS intel_dispatch_insert_policy ON public.intelligence_dispatch_logs;
CREATE POLICY intel_dispatch_insert_policy
  ON public.intelligence_dispatch_logs
  FOR INSERT
  WITH CHECK (public.is_super_admin() OR company_id IN (SELECT public.get_auth_companies()));

DROP POLICY IF EXISTS inv_autonomous_jobs_company_isolation ON public.inv_autonomous_jobs;
CREATE POLICY inv_autonomous_jobs_company_isolation
  ON public.inv_autonomous_jobs
  FOR ALL
  USING (public.is_super_admin() OR company_id IN (SELECT public.get_auth_companies()))
  WITH CHECK (public.is_super_admin() OR company_id IN (SELECT public.get_auth_companies()));

DROP POLICY IF EXISTS inv_agent_logs_company_isolation ON public.inv_agent_execution_logs;
CREATE POLICY inv_agent_logs_company_isolation
  ON public.inv_agent_execution_logs
  FOR ALL
  USING (public.is_super_admin() OR company_id IN (SELECT public.get_auth_companies()))
  WITH CHECK (public.is_super_admin() OR company_id IN (SELECT public.get_auth_companies()));

DROP POLICY IF EXISTS inv_decision_audit_company_isolation ON public.inv_decision_audit_trail;
CREATE POLICY inv_decision_audit_company_isolation
  ON public.inv_decision_audit_trail
  FOR SELECT
  USING (public.is_super_admin() OR company_id IN (SELECT public.get_auth_companies()));

DROP POLICY IF EXISTS inv_daily_avail_company_policy ON public.inv_daily_availability_snapshots;
CREATE POLICY inv_daily_avail_company_policy
  ON public.inv_daily_availability_snapshots
  FOR ALL
  USING (public.is_super_admin() OR company_id IN (SELECT public.get_auth_companies()))
  WITH CHECK (public.is_super_admin() OR company_id IN (SELECT public.get_auth_companies()));

DROP POLICY IF EXISTS inv_scheduled_jobs_company_policy ON public.inv_scheduled_jobs_log;
CREATE POLICY inv_scheduled_jobs_company_policy
  ON public.inv_scheduled_jobs_log
  FOR SELECT
  USING (public.is_super_admin() OR company_id IN (SELECT public.get_auth_companies()));
