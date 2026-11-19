-- =============================================================================
-- Migration: 20261118000003_security_rls_grants_and_uom_hardening.sql
-- Purpose  : Final Security Hardening, Least-Privilege RLS + GRANT/REVOKE,
--            Protected Enqueue RPC, Clean Allocation Semantics, and
--            Strict Supplier Status / UOM Resolution.
-- SAFETY   : Local migration only. Do NOT apply to production without staging verification.
-- =============================================================================

SET search_path TO public;

-- =============================================================================
-- 1. Least-Privilege RLS & Table-Level GRANT/REVOKE on All 6 Protected Tables
-- =============================================================================

-- 1A. intelligence_dispatch_logs (read-only for company authenticated users; writes server-side only)
ALTER TABLE public.intelligence_dispatch_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS intelligence_dispatch_logs_company_isolation ON public.intelligence_dispatch_logs;
DROP POLICY IF EXISTS intel_dispatch_select_policy ON public.intelligence_dispatch_logs;
DROP POLICY IF EXISTS intel_dispatch_insert_policy ON public.intelligence_dispatch_logs;
DROP POLICY IF EXISTS intel_dispatch_read_authenticated ON public.intelligence_dispatch_logs;

REVOKE ALL ON public.intelligence_dispatch_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.intelligence_dispatch_logs TO authenticated;
GRANT ALL ON public.intelligence_dispatch_logs TO service_role;

CREATE POLICY intel_dispatch_read_authenticated
  ON public.intelligence_dispatch_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR company_id IN (SELECT public.get_auth_companies())
  );

-- 1B. inv_autonomous_jobs (read-only for company authenticated users; mutations via protected RPC / service_role)
ALTER TABLE public.inv_autonomous_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_autonomous_jobs_company_isolation ON public.inv_autonomous_jobs;
DROP POLICY IF EXISTS inv_autonomous_jobs_read_authenticated ON public.inv_autonomous_jobs;

REVOKE ALL ON public.inv_autonomous_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inv_autonomous_jobs TO authenticated;
GRANT ALL ON public.inv_autonomous_jobs TO service_role;

CREATE POLICY inv_autonomous_jobs_read_authenticated
  ON public.inv_autonomous_jobs
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR company_id IN (SELECT public.get_auth_companies())
  );

-- 1C. inv_agent_execution_logs (immutable audit evidence; read-only for authenticated)
ALTER TABLE public.inv_agent_execution_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_agent_logs_company_isolation ON public.inv_agent_execution_logs;
DROP POLICY IF EXISTS inv_agent_logs_read_authenticated ON public.inv_agent_execution_logs;

REVOKE ALL ON public.inv_agent_execution_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inv_agent_execution_logs TO authenticated;
GRANT ALL ON public.inv_agent_execution_logs TO service_role;

CREATE POLICY inv_agent_logs_read_authenticated
  ON public.inv_agent_execution_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR company_id IN (SELECT public.get_auth_companies())
  );

-- 1D. inv_decision_audit_trail (append-only audit trail; read-only for authenticated)
ALTER TABLE public.inv_decision_audit_trail ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_decision_audit_company_isolation ON public.inv_decision_audit_trail;
DROP POLICY IF EXISTS inv_decision_audit_read_authenticated ON public.inv_decision_audit_trail;

REVOKE ALL ON public.inv_decision_audit_trail FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inv_decision_audit_trail TO authenticated;
GRANT ALL ON public.inv_decision_audit_trail TO service_role;

CREATE POLICY inv_decision_audit_read_authenticated
  ON public.inv_decision_audit_trail
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR company_id IN (SELECT public.get_auth_companies())
  );

-- 1E. inv_daily_availability_snapshots (protected historical analytical records; read-only for authenticated)
ALTER TABLE public.inv_daily_availability_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_daily_avail_company_policy ON public.inv_daily_availability_snapshots;
DROP POLICY IF EXISTS inv_daily_avail_read_authenticated ON public.inv_daily_availability_snapshots;

REVOKE ALL ON public.inv_daily_availability_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inv_daily_availability_snapshots TO authenticated;
GRANT ALL ON public.inv_daily_availability_snapshots TO service_role;

CREATE POLICY inv_daily_avail_read_authenticated
  ON public.inv_daily_availability_snapshots
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR company_id IN (SELECT public.get_auth_companies())
  );

-- 1F. inv_scheduled_jobs_log (append-only scheduled job log; read-only for authenticated)
ALTER TABLE public.inv_scheduled_jobs_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_sched_jobs_company_policy ON public.inv_scheduled_jobs_log;
DROP POLICY IF EXISTS inv_scheduled_jobs_company_policy ON public.inv_scheduled_jobs_log;
DROP POLICY IF EXISTS inv_scheduled_jobs_read_authenticated ON public.inv_scheduled_jobs_log;

REVOKE ALL ON public.inv_scheduled_jobs_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inv_scheduled_jobs_log TO authenticated;
GRANT ALL ON public.inv_scheduled_jobs_log TO service_role;

CREATE POLICY inv_scheduled_jobs_read_authenticated
  ON public.inv_scheduled_jobs_log
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR company_id IN (SELECT public.get_auth_companies())
  );

-- 1G. inv_stock_allocation_audit (read-only for authenticated; writes via fn_adjust_product_stock_allocation)
REVOKE ALL ON public.inv_stock_allocation_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inv_stock_allocation_audit TO authenticated;
GRANT ALL ON public.inv_stock_allocation_audit TO service_role;

DROP POLICY IF EXISTS inv_stock_alloc_audit_company_isolation ON public.inv_stock_allocation_audit;
CREATE POLICY inv_stock_alloc_audit_company_isolation
  ON public.inv_stock_allocation_audit
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR company_id IN (SELECT public.get_auth_companies())
  );

-- =============================================================================
-- 2. Protected RPC for Enqueueing Autonomous Jobs (replaces direct client upsert)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_enqueue_autonomous_job(
  p_company_id uuid,
  p_job_type text,
  p_idempotency_key text DEFAULT NULL
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
  v_key             text;
  v_job_id          uuid;
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

    IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager', 'branch_manager', 'inventory_manager', 'procurement') THEN
      RAISE EXCEPTION 'access_denied: صلاحيتك (%) لا تسمح بجدولة مهام ذكاء المخزون', COALESCE(v_role, 'none');
    END IF;
  END IF;

  IF p_job_type NOT IN ('full_orchestration', 'outcome_verification', 'snapshot_refresh') THEN
    RAISE EXCEPTION 'Invalid job_type: %', p_job_type;
  END IF;

  v_key := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    p_job_type || ':' || p_company_id::text || ':' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24')
  );

  INSERT INTO public.inv_autonomous_jobs (
    company_id, job_type, status, idempotency_key
  ) VALUES (
    p_company_id, p_job_type, 'queued', v_key
  )
  ON CONFLICT (company_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    SELECT id INTO v_job_id
    FROM public.inv_autonomous_jobs
    WHERE company_id = p_company_id AND idempotency_key = v_key
    LIMIT 1;

    RETURN jsonb_build_object('queued', false, 'job_id', v_job_id, 'idempotent', true);
  END IF;

  RETURN jsonb_build_object('queued', true, 'job_id', v_job_id, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_enqueue_autonomous_job(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_enqueue_autonomous_job(uuid, text, text) TO authenticated, service_role;

-- =============================================================================
-- 3. Clean Stock Allocation Semantics (No Fictitious 0-Qty Ledger Entries)
--    Updates reserved_quantity / damaged_quantity on product_stock atomically
--    and records full before/after traceability in inv_stock_allocation_audit.
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
-- 4. Strict Supplier Status ('active' only) & Base/Configured UOM Resolution
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
  v_uom                 character varying;
  v_product_name        text;
  v_po_id               uuid;
  v_existing_hash       text;
  v_existing_total      numeric(15,4);
  v_payload_hash        text;
  v_unit_price          numeric(15,4);
  v_net_unit_price      numeric(15,4);
  v_subtotal            numeric(15,4);
  v_tax_amount          numeric(15,4) := 0;
  v_total               numeric(15,4);
  v_po_number           text;
BEGIN
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

  -- Strictly require status = 'active' on prc_suppliers
  SELECT ps.supplier_id, COALESCE(ps.currency, 'SAR'), ps.status
  INTO v_resolved_supplier, v_supplier_currency, v_supplier_status
  FROM public.prc_suppliers ps
  WHERE ps.company_id = p_company_id
    AND (ps.supplier_id = p_supplier_id OR ps.party_id = p_supplier_id)
  ORDER BY (ps.supplier_id = p_supplier_id) DESC
  LIMIT 1;

  IF v_resolved_supplier IS NULL THEN
    RAISE EXCEPTION 'المورد غير مسجل في وحدة المشتريات (prc_suppliers) لهذه الشركة';
  END IF;

  IF v_supplier_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'المورد غير مؤهل لإصدار أمر شراء (حالة المورد: %)', COALESCE(v_supplier_status, 'NULL');
  END IF;

  -- Validate product & resolve explicit configured unit first, then base UOM (conversion_factor = 1)
  SELECT p.name_ar, NULLIF(trim(p.unit), '')
  INTO v_product_name, v_uom
  FROM public.products p
  WHERE p.id = p_product_id
    AND p.company_id = p_company_id
    AND p.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الصنف غير موجود أو محذوف في هذه الشركة';
  END IF;

  IF v_uom IS NULL THEN
    SELECT NULLIF(trim(pu.uom_name), '')
    INTO v_uom
    FROM public.product_uoms pu
    WHERE pu.product_id = p_product_id
    ORDER BY (pu.conversion_factor = 1) DESC, pu.conversion_factor ASC
    LIMIT 1;
  END IF;

  v_uom := COALESCE(v_uom, 'قطعة');

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

  v_payload_hash := md5(
    p_company_id::text || '|' ||
    v_resolved_supplier::text || '|' ||
    p_product_id::text || '|' ||
    p_quantity::text || '|' ||
    v_unit_price::text || '|' ||
    v_supplier_currency::text
  );

  SELECT po.po_id, po.idempotency_payload_hash, po.po_number, po.total_amount
  INTO v_po_id, v_existing_hash, v_po_number, v_existing_total
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
      'total',      v_existing_total,
      'idempotent', true,
      'message',    'تم إرجاع أمر الشراء الحالي (طلب مكرر محمي بمفتاح الأمان)'
    );
  END IF;

  v_po_number := 'PO-AI-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-'
                           || substr(md5(p_idempotency_key || now()::text), 1, 6);

  INSERT INTO public.prc_purchase_orders (
    company_id, po_number, supplier_id, buyer_id, status, issue_date,
    currency, subtotal, tax_amount, total_amount, notes,
    idempotency_key, idempotency_payload_hash
  )
  VALUES (
    p_company_id, v_po_number, v_resolved_supplier, v_actor_id, 'draft', CURRENT_DATE,
    v_supplier_currency, v_subtotal, v_tax_amount, v_total,
    'توصية ذكاء المخزون [' || p_idempotency_key || ']: ' || coalesce(p_reason, ''),
    p_idempotency_key, v_payload_hash
  )
  RETURNING po_id INTO v_po_id;

  INSERT INTO public.prc_purchase_order_items (
    po_id, company_id, product_id, description, quantity,
    unit_of_measure, unit_price, discount_percentage,
    net_unit_price, tax_percentage, total_price
  )
  VALUES (
    v_po_id, p_company_id, p_product_id,
    coalesce(NULLIF(trim(p_product_name), ''), v_product_name, 'صنف موصى بشرائه (ذكاء المخزون)'),
    p_quantity, v_uom, v_unit_price, 0.00, v_net_unit_price, 0.00, v_total
  );

  RETURN jsonb_build_object(
    'po_id',                v_po_id,
    'idempotent',           false,
    'po_number',            v_po_number,
    'resolved_supplier_id', v_resolved_supplier,
    'unit_of_measure',      v_uom,
    'currency',             v_supplier_currency,
    'total',                v_total
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
-- 5. Fix log_audit_event() for tables with non-'id' PKs (e.g. prc_purchase_orders.po_id)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company_id uuid;
  v_entity_id  uuid;
  v_rec_json   jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.* IS NOT DISTINCT FROM NEW.* THEN
      RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'parties' THEN
      IF (OLD.name, OLD.phone, OLD.type, OLD.tax_number, OLD.address, OLD.status, OLD.credit_limit)
         IS NOT DISTINCT FROM
         (NEW.name, NEW.phone, NEW.type, NEW.tax_number, NEW.address, NEW.status, NEW.credit_limit) THEN
        RETURN NEW;
      END IF;
    ELSIF TG_TABLE_NAME = 'products' THEN
      IF (OLD.name_ar, OLD.sku, OLD.part_number, OLD.brand, OLD.purchase_price, OLD.sale_price, OLD.status)
         IS NOT DISTINCT FROM
         (NEW.name_ar, NEW.sku, NEW.part_number, NEW.brand, NEW.purchase_price, NEW.sale_price, NEW.status) THEN
        RETURN NEW;
      END IF;
    ELSIF TG_TABLE_NAME = 'invoices' THEN
      IF (OLD.invoice_number, OLD.type, OLD.status, OLD.total_amount, OLD.party_id, OLD.branch_id)
         IS NOT DISTINCT FROM
         (NEW.invoice_number, NEW.type, NEW.status, NEW.total_amount, NEW.party_id, NEW.branch_id) THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  v_rec_json := COALESCE(to_jsonb(NEW), to_jsonb(OLD));
  v_company_id := NULLIF(v_rec_json->>'company_id', '')::uuid;
  v_entity_id := COALESCE(
    NULLIF(v_rec_json->>'id', '')::uuid,
    NULLIF(v_rec_json->>'po_id', '')::uuid,
    NULLIF(v_rec_json->>'po_item_id', '')::uuid,
    NULLIF(v_rec_json->>'supplier_id', '')::uuid
  );

  INSERT INTO public.audit_logs (
    company_id,
    user_id,
    action,
    entity,
    entity_id,
    details,
    created_at,
    updated_at
  ) VALUES (
    v_company_id,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_entity_id,
    jsonb_build_object(
      'old_data', CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
      'new_data', CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    ),
    now(),
    now()
  );

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;
