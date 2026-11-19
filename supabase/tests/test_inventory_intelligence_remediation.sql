-- =============================================================================
-- Staging PostgreSQL Integration & Security Verification Suite
-- Target: Product Intelligence (inventory-intelligence)
-- Usage : Run in an isolated Staging PostgreSQL environment ONLY (never Production).
--         Everything runs inside a single transaction and executes ROLLBACK at end.
-- =============================================================================
BEGIN;

-- =============================================================================
-- 0. Catalog & Privilege Verification (Idempotency Index, Grants, Policies)
-- =============================================================================
DO $$
DECLARE
  v_is_unique boolean;
  v_is_valid  boolean;
  v_is_ready  boolean;
  v_cols      text;
BEGIN
  -- Verify fn_claim_next_autonomous_job is strictly service_role only
  IF has_function_privilege('anon', 'public.fn_claim_next_autonomous_job(text, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAILURE: anon can execute fn_claim_next_autonomous_job';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_claim_next_autonomous_job(text, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAILURE: authenticated can execute fn_claim_next_autonomous_job';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.fn_claim_next_autonomous_job(text, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFIG FAILURE: service_role cannot execute fn_claim_next_autonomous_job';
  END IF;

  -- Verify uq_prc_po_company_idempotency catalog metadata
  SELECT i.indisunique, i.indisvalid, i.indisready,
         string_agg(a.attname, ',' ORDER BY k.ord)
  INTO v_is_unique, v_is_valid, v_is_ready, v_cols
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
  WHERE n.nspname = 'public'
    AND c.relname = 'uq_prc_po_company_idempotency'
  GROUP BY i.indisunique, i.indisvalid, i.indisready;

  IF NOT COALESCE(v_is_unique, false) OR NOT COALESCE(v_is_valid, false) OR NOT COALESCE(v_is_ready, false) THEN
    RAISE EXCEPTION 'INDEX FAILURE: uq_prc_po_company_idempotency missing, non-unique, invalid, or not ready';
  END IF;
  IF v_cols <> 'company_id,idempotency_key' THEN
    RAISE EXCEPTION 'INDEX FAILURE: expected (company_id,idempotency_key), got (%)', v_cols;
  END IF;
END $$;

-- =============================================================================
-- 1. Isolated Test Fixtures (Company A, Company B, Users, Roles, Products, Suppliers)
-- =============================================================================
DO $$
DECLARE
  v_comp_a       uuid := '11111111-1111-4111-8111-111111111101';
  v_comp_b       uuid := '22222222-2222-4222-8222-222222222202';
  v_user_a       uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_user_b       uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_owner_a      uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
  v_super_admin  uuid := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
  v_branch_a     uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
  v_wh_a         uuid := 'ffffffff-ffff-4fff-8fff-fffffffffff1';
  v_prod_a       uuid := '12121212-1212-4121-8121-121212121201';
  v_party_a      uuid := '34343434-3434-4343-8343-343434343401';
  v_sup_a        uuid := '56565656-5656-4565-8565-565656565601';
  v_sup_a_draft  uuid := '56565656-5656-4565-8565-565656565602';
  v_sup_b        uuid := '56565656-5656-4565-8565-565656565699';
  v_job_a        uuid := '78787878-7878-4787-8787-787878787801';
  v_job_b        uuid := '78787878-7878-4787-8787-787878787802';
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES
    (v_user_a, 'staging-user-a@example.test'),
    (v_user_b, 'staging-user-b@example.test'),
    (v_owner_a, 'staging-owner-a@example.test'),
    (v_super_admin, 'staging-super@example.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.supported_currencies (code, name_ar, symbol, is_base)
  VALUES ('SAR', 'ريال سعودي', 'ر.س', true)
  ON CONFLICT (code) DO NOTHING;

  INSERT INTO public.companies (id, name_ar, is_active)
  VALUES
    (v_comp_a, 'Staging Company A', true),
    (v_comp_b, 'Staging Company B', true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_company_roles (user_id, company_id, role)
  VALUES
    (v_user_a, v_comp_a, 'manager'),
    (v_owner_a, v_comp_a, 'owner'),
    (v_user_b, v_comp_b, 'manager')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.super_admins (user_id)
  VALUES (v_super_admin)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.branches (id, company_id, name, code, is_main)
  VALUES (v_branch_a, v_comp_a, 'Main A', 'MA', true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_branch_a FROM public.branches WHERE company_id = v_comp_a LIMIT 1;

  INSERT INTO public.warehouses (id, company_id, branch_id, name_ar, is_primary)
  VALUES (v_wh_a, v_comp_a, v_branch_a, 'مستودع أ', false)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_wh_a FROM public.warehouses WHERE company_id = v_comp_a LIMIT 1;

  INSERT INTO public.products (id, company_id, name_ar, sku, unit, cost_price, sale_price)
  VALUES (v_prod_a, v_comp_a, 'فلتر اختبار', 'STG-SKU-1', 'حبة', 100, 150)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.product_stock (company_id, product_id, warehouse_id, quantity, reserved_quantity, damaged_quantity, weighted_avg_cost)
  VALUES (v_comp_a, v_prod_a, v_wh_a, 20, 2, 1, 100)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.parties (id, company_id, name, type)
  VALUES (v_party_a, v_comp_a, 'مورد أ التجاري', 'supplier')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.prc_suppliers (supplier_id, company_id, party_id, supplier_code, legal_name, supplier_type, status, country, city, currency, is_approved)
  VALUES
    (v_sup_a, v_comp_a, v_party_a, 'SUP-A-1', 'مورد أ المعتمد', 'distributor', 'active', 'SA', 'Riyadh', 'SAR', true),
    (v_sup_a_draft, v_comp_a, NULL, 'SUP-A-2', 'مورد أ غير مفعل', 'distributor', 'inactive', 'SA', 'Riyadh', 'SAR', false),
    (v_sup_b, v_comp_b, NULL, 'SUP-B-1', 'مورد ب', 'distributor', 'active', 'SA', 'Jeddah', 'SAR', true)
  ON CONFLICT (supplier_id) DO NOTHING;

  INSERT INTO public.inv_autonomous_jobs (id, company_id, job_type, status, idempotency_key)
  VALUES
    (v_job_a, v_comp_a, 'snapshot_refresh', 'queued', 'stg-job-a'),
    (v_job_b, v_comp_b, 'snapshot_refresh', 'queued', 'stg-job-b')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.inv_agent_execution_logs (company_id, agent_id, status, summary)
  VALUES
    (v_comp_a, 'demand_forecasting', 'healthy', 'Staging Log A'),
    (v_comp_b, 'demand_forecasting', 'healthy', 'Staging Log B');

  INSERT INTO public.inv_daily_availability_snapshots (company_id, product_id, warehouse_id, snapshot_date, physical_qty, reserved_qty, damaged_qty, available_qty)
  VALUES
    (v_comp_a, v_prod_a, v_wh_a, CURRENT_DATE, 20, 2, 1, 17);
END $$;

-- =============================================================================
-- 2. RLS & Cross-Company Isolation Tests under Real Roles & JWT Claims
-- =============================================================================
SET LOCAL ROLE authenticated;

-- 2a. User A reads Company A jobs (allowed) & cannot read Company B jobs
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated","company_id":"11111111-1111-4111-8111-111111111101"}', true);
DO $$
DECLARE
  v_cnt_a int;
  v_cnt_b int;
BEGIN
  SELECT count(*) INTO v_cnt_a FROM public.inv_autonomous_jobs WHERE company_id = '11111111-1111-4111-8111-111111111101';
  SELECT count(*) INTO v_cnt_b FROM public.inv_autonomous_jobs WHERE company_id = '22222222-2222-4222-8222-222222222202';
  IF v_cnt_a < 1 THEN RAISE EXCEPTION 'RLS FAILURE: User A cannot read Company A jobs'; END IF;
  IF v_cnt_b <> 0 THEN RAISE EXCEPTION 'RLS FAILURE: User A read Company B jobs (%)', v_cnt_b; END IF;
END $$;

-- 2b. Ordinary user A cannot INSERT/UPDATE/DELETE protected audit/job/snapshot tables
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    UPDATE public.inv_autonomous_jobs SET status = 'completed' WHERE company_id = '11111111-1111-4111-8111-111111111101';
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'SECURITY FAILURE: authenticated user updated inv_autonomous_jobs'; END IF;

  v_denied := false;
  BEGIN
    DELETE FROM public.inv_agent_execution_logs WHERE company_id = '11111111-1111-4111-8111-111111111101';
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'SECURITY FAILURE: authenticated user deleted inv_agent_execution_logs'; END IF;

  v_denied := false;
  BEGIN
    UPDATE public.inv_daily_availability_snapshots SET available_qty = 999 WHERE company_id = '11111111-1111-4111-8111-111111111101';
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'SECURITY FAILURE: authenticated user updated inv_daily_availability_snapshots'; END IF;

  v_denied := false;
  BEGIN
    INSERT INTO public.intelligence_dispatch_logs (company_id, channel, status) VALUES ('22222222-2222-4222-8222-222222222202', 'telegram', 'sent');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'SECURITY FAILURE: authenticated user forged intelligence_dispatch_logs'; END IF;
END $$;

-- 2c. User A cannot fetch Company B snapshot via fn_get_inventory_intelligence_snapshot
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.fn_get_inventory_intelligence_snapshot('22222222-2222-4222-8222-222222222202', 365);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'SECURITY FAILURE: User A accessed Company B snapshot'; END IF;
END $$;

-- =============================================================================
-- 3. Purchase Order RPC Transaction, Supplier, UOM & 5,000 Threshold Tests
-- =============================================================================
-- 3a. User A (branch_manager) creates valid PO < 5,000 via party_id -> resolves to prc_suppliers.supplier_id & unit 'حبة'
DO $$
DECLARE
  v_res jsonb;
  v_po_count int;
BEGIN
  v_res := public.fn_create_ai_purchase_order_atomic(
    '11111111-1111-4111-8111-111111111101',
    '34343434-3434-4343-8343-343434343401', -- party_id
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '12121212-1212-4121-8121-121212121201',
    'فلتر اختبار',
    10,
    100,
    'Staging test < 5000',
    'stg-po-key-1'
  );
  IF (v_res->>'resolved_supplier_id')::uuid <> '56565656-5656-4565-8565-565656565601' THEN
    RAISE EXCEPTION 'SUPPLIER MAPPING FAILURE: expected prc_suppliers.supplier_id';
  END IF;
  IF v_res->>'unit_of_measure' <> 'حبة' THEN
    RAISE EXCEPTION 'UOM FAILURE: expected حبة, got %', v_res->>'unit_of_measure';
  END IF;

  -- Idempotent replay returns same PO without duplicate
  v_res := public.fn_create_ai_purchase_order_atomic(
    '11111111-1111-4111-8111-111111111101',
    '56565656-5656-4565-8565-565656565601',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '12121212-1212-4121-8121-121212121201',
    'فلتر اختبار',
    10,
    100,
    'Staging test < 5000',
    'stg-po-key-1'
  );
  IF NOT (v_res->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'IDEMPOTENCY FAILURE: replay did not set idempotent=true';
  END IF;
  SELECT count(*) INTO v_po_count FROM public.prc_purchase_orders WHERE idempotency_key = 'stg-po-key-1';
  IF v_po_count <> 1 THEN
    RAISE EXCEPTION 'IDEMPOTENCY FAILURE: expected 1 PO, got %', v_po_count;
  END IF;
END $$;

-- 3b. Negative tests: >= 5,000 denied for branch_manager, zero price denied, draft supplier denied, cross-company supplier denied, key conflict denied
DO $$
DECLARE
  v_denied boolean;
BEGIN
  -- >= 5,000 for branch_manager
  v_denied := false;
  BEGIN
    PERFORM public.fn_create_ai_purchase_order_atomic(
      '11111111-1111-4111-8111-111111111101', '56565656-5656-4565-8565-565656565601',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '12121212-1212-4121-8121-121212121201',
      'فلتر اختبار', 50, 100, 'At 5000', 'stg-po-5000'
    );
  EXCEPTION WHEN OTHERS THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'THRESHOLD FAILURE: branch_manager created >= 5,000 PO'; END IF;

  -- Zero unit_cost
  v_denied := false;
  BEGIN
    PERFORM public.fn_create_ai_purchase_order_atomic(
      '11111111-1111-4111-8111-111111111101', '56565656-5656-4565-8565-565656565601',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '12121212-1212-4121-8121-121212121201',
      'فلتر اختبار', 5, 0, 'Zero price', 'stg-po-zero'
    );
  EXCEPTION WHEN OTHERS THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'PRICE FAILURE: zero unit_cost PO allowed'; END IF;

  -- Draft supplier
  v_denied := false;
  BEGIN
    PERFORM public.fn_create_ai_purchase_order_atomic(
      '11111111-1111-4111-8111-111111111101', '56565656-5656-4565-8565-565656565602',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '12121212-1212-4121-8121-121212121201',
      'فلتر اختبار', 5, 100, 'Draft supplier', 'stg-po-draft-sup'
    );
  EXCEPTION WHEN OTHERS THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'SUPPLIER FAILURE: draft supplier allowed'; END IF;

  -- Cross-company supplier
  v_denied := false;
  BEGIN
    PERFORM public.fn_create_ai_purchase_order_atomic(
      '11111111-1111-4111-8111-111111111101', '56565656-5656-4565-8565-565656565699',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '12121212-1212-4121-8121-121212121201',
      'فلتر اختبار', 5, 100, 'Cross company sup', 'stg-po-cross-sup'
    );
  EXCEPTION WHEN OTHERS THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'TENANT FAILURE: cross-company supplier allowed'; END IF;

  -- Idempotency key conflict (different qty)
  v_denied := false;
  BEGIN
    PERFORM public.fn_create_ai_purchase_order_atomic(
      '11111111-1111-4111-8111-111111111101', '56565656-5656-4565-8565-565656565601',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '12121212-1212-4121-8121-121212121201',
      'فلتر اختبار', 99, 100, 'Conflict', 'stg-po-key-1'
    );
  EXCEPTION WHEN OTHERS THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'IDEMPOTENCY FAILURE: conflicting payload allowed'; END IF;
END $$;

-- =============================================================================
-- 4. Stock Allocation Audit Semantics (No Fictitious inventory_transactions)
-- =============================================================================
DO $$
DECLARE
  v_wh_a uuid;
  v_res jsonb;
  v_tx_cnt int;
  v_audit_cnt int;
BEGIN
  SELECT id INTO v_wh_a FROM public.warehouses WHERE company_id = '11111111-1111-4111-8111-111111111101' LIMIT 1;
  v_res := public.fn_adjust_product_stock_allocation(
    '11111111-1111-4111-8111-111111111101',
    '12121212-1212-4121-8121-121212121201',
    v_wh_a,
    3, 1, 'staging_alloc_test'
  );
  IF (v_res->>'available_quantity')::numeric <> 13 THEN
    RAISE EXCEPTION 'ALLOCATION FAILURE: expected available=13, got %', v_res->>'available_quantity';
  END IF;

  SELECT count(*) INTO v_tx_cnt FROM public.inventory_transactions WHERE product_id = '12121212-1212-4121-8121-121212121201';
  IF v_tx_cnt <> 0 THEN
    RAISE EXCEPTION 'SEMANTIC FAILURE: allocation created fictitious inventory_transactions row';
  END IF;

  SELECT count(*) INTO v_audit_cnt FROM public.inv_stock_allocation_audit WHERE product_id = '12121212-1212-4121-8121-121212121201';
  IF v_audit_cnt <> 1 THEN
    RAISE EXCEPTION 'AUDIT FAILURE: expected 1 inv_stock_allocation_audit row, got %', v_audit_cnt;
  END IF;
END $$;

-- =============================================================================
-- 5. Anonymous Role Access Denied & Service Role Worker Claim Works
-- =============================================================================
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.inv_autonomous_jobs LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'ANON FAILURE: anon read inv_autonomous_jobs'; END IF;
END $$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
DECLARE
  v_job public.inv_autonomous_jobs;
BEGIN
  SELECT * INTO v_job FROM public.fn_claim_next_autonomous_job('staging-worker-1', 120);
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'WORKER FAILURE: service_role could not claim queued job';
  END IF;
END $$;

ROLLBACK;
