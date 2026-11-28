-- Wave 48: Branch B1 Cloud-Primary + Local Failover Mirror + Outbox Replay + Backup Hub

-- 1. Offline reference traceability columns on invoices & payments
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS offline_reference text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS offline_reference text;

CREATE INDEX IF NOT EXISTS idx_invoices_company_offline_ref
  ON public.invoices (company_id, offline_reference)
  WHERE offline_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_company_offline_ref
  ON public.payments (company_id, offline_reference)
  WHERE offline_reference IS NOT NULL;

-- 2. System Backup Runs (live Google Drive & local backup audit log)
CREATE TABLE IF NOT EXISTS public.system_backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('scheduled', 'manual', 'edge_auto')),
  destination text NOT NULL CHECK (destination IN ('google_drive', 'local_disk', 'both')),
  status text NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  file_name text,
  compressed_bytes bigint DEFAULT 0,
  total_rows integer DEFAULT 0,
  sha256 text,
  drive_file_id text,
  drive_web_link text,
  local_path text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_system_backup_runs_company_started
  ON public.system_backup_runs (company_id, started_at DESC);

ALTER TABLE public.system_backup_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_backup_runs_select_policy ON public.system_backup_runs;
CREATE POLICY system_backup_runs_select_policy
  ON public.system_backup_runs
  FOR SELECT
  USING (
    public.is_super_admin()
    OR company_id IN (SELECT public.get_auth_companies())
  );

DROP POLICY IF EXISTS system_backup_runs_write_policy ON public.system_backup_runs;
CREATE POLICY system_backup_runs_write_policy
  ON public.system_backup_runs
  FOR ALL
  USING (
    public.is_super_admin()
    OR (
      company_id IN (SELECT public.get_auth_companies())
      AND EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        WHERE ucr.user_id = auth.uid()
          AND ucr.company_id = system_backup_runs.company_id
          AND ucr.role IN ('owner', 'admin', 'manager')
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      company_id IN (SELECT public.get_auth_companies())
      AND EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        WHERE ucr.user_id = auth.uid()
          AND ucr.company_id = system_backup_runs.company_id
          AND ucr.role IN ('owner', 'admin', 'manager')
      )
    )
  );

-- 3. Branch Edge Nodes (live heartbeat & mirror health per physical branch)
CREATE TABLE IF NOT EXISTS public.branch_edge_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  branch_code text NOT NULL,
  hostname text,
  edge_version text,
  status text NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline', 'syncing', 'degraded')),
  pending_outbox_count integer NOT NULL DEFAULT 0,
  failed_outbox_count integer NOT NULL DEFAULT 0,
  mirror_products_count integer NOT NULL DEFAULT 0,
  mirror_parties_count integer NOT NULL DEFAULT 0,
  last_mirror_sync_at timestamptz,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  memory_rss_mb numeric(8,2),
  UNIQUE (company_id, branch_id)
);

ALTER TABLE public.branch_edge_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS branch_edge_nodes_select_policy ON public.branch_edge_nodes;
CREATE POLICY branch_edge_nodes_select_policy
  ON public.branch_edge_nodes
  FOR SELECT
  USING (
    public.is_super_admin()
    OR company_id IN (SELECT public.get_auth_companies())
  );

DROP POLICY IF EXISTS branch_edge_nodes_write_policy ON public.branch_edge_nodes;
CREATE POLICY branch_edge_nodes_write_policy
  ON public.branch_edge_nodes
  FOR ALL
  USING (
    public.is_super_admin()
    OR company_id IN (SELECT public.get_auth_companies())
  )
  WITH CHECK (
    public.is_super_admin()
    OR company_id IN (SELECT public.get_auth_companies())
  );

-- 4. Paginated Delta Sync RPC for Branch Local Mirror
CREATE OR REPLACE FUNCTION public.get_branch_mirror_delta(
  p_company_id uuid,
  p_branch_id uuid,
  p_since timestamptz DEFAULT NULL,
  p_entity text DEFAULT 'reference',
  p_limit integer DEFAULT 2000,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 2000), 1), 5000);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_rows jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_has_more boolean := false;
  v_server_time timestamptz := now();
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  IF p_entity = 'reference' THEN
    RETURN jsonb_build_object(
      'server_time', v_server_time,
      'has_more', false,
      'data', jsonb_build_object(
        'company', (
          SELECT to_jsonb(c) FROM (
            SELECT id, name_ar, name_en, tax_number, base_currency, address, phone, logo_url, is_tax_enabled
            FROM public.companies WHERE id = p_company_id LIMIT 1
          ) c
        ),
        'warehouses', COALESCE((
          SELECT jsonb_agg(to_jsonb(w)) FROM (
            SELECT id, name_ar, location, is_primary, branch_id, status
            FROM public.warehouses
            WHERE company_id = p_company_id
              AND deleted_at IS NULL
              AND (p_branch_id IS NULL OR branch_id = p_branch_id)
            ORDER BY is_primary DESC, name_ar ASC
          ) w
        ), '[]'::jsonb),
        'exchange_rates', COALESCE((
          SELECT jsonb_agg(to_jsonb(er)) FROM (
            SELECT id, currency_code, rate_to_base, effective_date, created_at
            FROM public.exchange_rates
            WHERE company_id = p_company_id
            ORDER BY effective_date DESC, created_at DESC
            LIMIT 100
          ) er
        ), '[]'::jsonb),
        'accounts', COALESCE((
          SELECT jsonb_agg(to_jsonb(a)) FROM (
            SELECT id, code, name_ar, name_en, type, currency_code, allow_posting, is_system
            FROM public.accounts
            WHERE company_id = p_company_id
              AND deleted_at IS NULL
              AND COALESCE(is_active, true) = true
            ORDER BY code ASC
            LIMIT 1000
          ) a
        ), '[]'::jsonb),
        'fiscal_years', COALESCE((
          SELECT jsonb_agg(to_jsonb(fy)) FROM (
            SELECT id, name, start_date, end_date, is_closed
            FROM public.fiscal_years
            WHERE company_id = p_company_id
            ORDER BY start_date DESC
          ) fy
        ), '[]'::jsonb),
        'supported_currencies', COALESCE((
          SELECT jsonb_agg(to_jsonb(sc)) FROM (
            SELECT * FROM public.supported_currencies
          ) sc
        ), '[]'::jsonb)
      )
    );

  ELSIF p_entity = 'products' THEN
    WITH slice AS (
      SELECT
        p.id,
        p.name_ar,
        p.sku,
        p.part_number,
        p.brand,
        COALESCE(p.sale_price, 0) AS sale_price,
        COALESCE(p.purchase_price, 0) AS purchase_price,
        COALESCE(p.cost_price, 0) AS cost_price,
        COALESCE(p.min_stock_level, 0) AS min_stock_level,
        p.unit,
        p.alternative_numbers,
        p.barcode,
        COALESCE(p.is_core, false) AS is_core,
        p.updated_at
      FROM public.products p
      WHERE p.company_id = p_company_id
        AND p.deleted_at IS NULL
        AND (p_since IS NULL OR p.updated_at >= p_since)
      ORDER BY p.id ASC
      LIMIT v_limit + 1 OFFSET v_offset
    ),
    capped AS (
      SELECT * FROM slice LIMIT v_limit
    )
    SELECT
      COALESCE(jsonb_agg(to_jsonb(capped)), '[]'::jsonb),
      (SELECT COUNT(*) FROM slice)
    INTO v_rows, v_count
    FROM capped;

    v_has_more := v_count > v_limit;
    RETURN jsonb_build_object('server_time', v_server_time, 'has_more', v_has_more, 'rows', v_rows);

  ELSIF p_entity = 'stock' THEN
    WITH slice AS (
      SELECT
        ps.product_id,
        ps.warehouse_id,
        COALESCE(ps.quantity, 0) AS quantity,
        COALESCE(ps.weighted_avg_cost, 0) AS weighted_avg_cost,
        ps.updated_at
      FROM public.product_stock ps
      JOIN public.warehouses w ON w.id = ps.warehouse_id
      WHERE ps.company_id = p_company_id
        AND w.deleted_at IS NULL
        AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
        AND (p_since IS NULL OR ps.updated_at >= p_since)
      ORDER BY ps.product_id ASC, ps.warehouse_id ASC
      LIMIT v_limit + 1 OFFSET v_offset
    ),
    capped AS (
      SELECT * FROM slice LIMIT v_limit
    )
    SELECT
      COALESCE(jsonb_agg(to_jsonb(capped)), '[]'::jsonb),
      (SELECT COUNT(*) FROM slice)
    INTO v_rows, v_count
    FROM capped;

    v_has_more := v_count > v_limit;
    RETURN jsonb_build_object('server_time', v_server_time, 'has_more', v_has_more, 'rows', v_rows);

  ELSIF p_entity = 'parties' THEN
    WITH bal AS (
      SELECT
        pb.party_id,
        jsonb_object_agg(pb.currency_code, pb.balance) AS balances_json
      FROM public.party_balances_by_currency pb
      WHERE pb.company_id = p_company_id
      GROUP BY pb.party_id
    ),
    slice AS (
      SELECT
        pt.id,
        pt.name,
        pt.type,
        pt.phone,
        COALESCE(pt.credit_limit, 0) AS credit_limit,
        COALESCE(pt.payment_terms_days, 0) AS payment_terms_days,
        COALESCE(bal.balances_json, '{}'::jsonb) AS balances_json,
        pt.updated_at
      FROM public.parties pt
      LEFT JOIN bal ON bal.party_id = pt.id
      WHERE pt.company_id = p_company_id
        AND pt.deleted_at IS NULL
        AND (p_since IS NULL OR pt.updated_at >= p_since)
      ORDER BY pt.id ASC
      LIMIT v_limit + 1 OFFSET v_offset
    ),
    capped AS (
      SELECT * FROM slice LIMIT v_limit
    )
    SELECT
      COALESCE(jsonb_agg(to_jsonb(capped)), '[]'::jsonb),
      (SELECT COUNT(*) FROM slice)
    INTO v_rows, v_count
    FROM capped;

    v_has_more := v_count > v_limit;
    RETURN jsonb_build_object('server_time', v_server_time, 'has_more', v_has_more, 'rows', v_rows);

  ELSIF p_entity = 'recent_invoices' THEN
    WITH slice AS (
      SELECT
        i.id,
        i.invoice_number,
        i.offline_reference,
        i.issue_date,
        i.party_id,
        pt.name AS party_name,
        i.payment_method,
        i.currency_code,
        COALESCE(i.total_amount, 0) AS total_amount,
        COALESCE(i.total_document_amount, i.total_amount, 0) AS total_document_amount,
        i.status,
        i.created_at
      FROM public.invoices i
      LEFT JOIN public.parties pt ON pt.id = i.party_id
      WHERE i.company_id = p_company_id
        AND i.deleted_at IS NULL
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        AND i.issue_date >= (CURRENT_DATE - INTERVAL '30 days')
        AND (p_since IS NULL OR i.updated_at >= p_since)
      ORDER BY i.issue_date DESC, i.created_at DESC
      LIMIT v_limit + 1 OFFSET v_offset
    ),
    capped AS (
      SELECT * FROM slice LIMIT v_limit
    )
    SELECT
      COALESCE(jsonb_agg(to_jsonb(capped)), '[]'::jsonb),
      (SELECT COUNT(*) FROM slice)
    INTO v_rows, v_count
    FROM capped;

    v_has_more := v_count > v_limit;
    RETURN jsonb_build_object('server_time', v_server_time, 'has_more', v_has_more, 'rows', v_rows);

  ELSE
    RAISE EXCEPTION 'invalid_entity: unsupported entity %', p_entity;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_branch_mirror_delta(uuid, uuid, timestamptz, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_branch_mirror_delta(uuid, uuid, timestamptz, text, integer, integer) TO authenticated, service_role;

-- 5. Heartbeat RPC for Branch Edge Nodes
CREATE OR REPLACE FUNCTION public.upsert_branch_edge_heartbeat(
  p_company_id uuid,
  p_branch_id uuid,
  p_branch_code text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.branch_edge_nodes;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  INSERT INTO public.branch_edge_nodes (
    company_id, branch_id, branch_code, hostname, edge_version, status,
    pending_outbox_count, failed_outbox_count,
    mirror_products_count, mirror_parties_count,
    last_mirror_sync_at, last_heartbeat_at, memory_rss_mb
  )
  VALUES (
    p_company_id,
    p_branch_id,
    COALESCE(NULLIF(TRIM(p_branch_code), ''), 'B1'),
    NULLIF(TRIM(COALESCE(p_payload ->> 'hostname', '')), ''),
    NULLIF(TRIM(COALESCE(p_payload ->> 'edge_version', '')), ''),
    COALESCE(NULLIF(TRIM(COALESCE(p_payload ->> 'status', '')), ''), 'online'),
    COALESCE((p_payload ->> 'pending_outbox_count')::integer, 0),
    COALESCE((p_payload ->> 'failed_outbox_count')::integer, 0),
    COALESCE((p_payload ->> 'mirror_products_count')::integer, 0),
    COALESCE((p_payload ->> 'mirror_parties_count')::integer, 0),
    NULLIF(TRIM(COALESCE(p_payload ->> 'last_mirror_sync_at', '')), '')::timestamptz,
    now(),
    NULLIF(TRIM(COALESCE(p_payload ->> 'memory_rss_mb', '')), '')::numeric
  )
  ON CONFLICT (company_id, branch_id)
  DO UPDATE SET
    branch_code = EXCLUDED.branch_code,
    hostname = COALESCE(EXCLUDED.hostname, branch_edge_nodes.hostname),
    edge_version = COALESCE(EXCLUDED.edge_version, branch_edge_nodes.edge_version),
    status = EXCLUDED.status,
    pending_outbox_count = EXCLUDED.pending_outbox_count,
    failed_outbox_count = EXCLUDED.failed_outbox_count,
    mirror_products_count = EXCLUDED.mirror_products_count,
    mirror_parties_count = EXCLUDED.mirror_parties_count,
    last_mirror_sync_at = COALESCE(EXCLUDED.last_mirror_sync_at, branch_edge_nodes.last_mirror_sync_at),
    last_heartbeat_at = now(),
    memory_rss_mb = COALESCE(EXCLUDED.memory_rss_mb, branch_edge_nodes.memory_rss_mb)
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_branch_edge_heartbeat(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_branch_edge_heartbeat(uuid, uuid, text, jsonb) TO authenticated, service_role;
