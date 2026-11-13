-- ==============================================================================
-- Migration: 20261113000004_harden_security_transfers_and_rls.sql
-- Description:
--   1. Enable RLS on public.sync_outbox.
--   2. Switch security_definer views (party_balances, party_balances_by_currency,
--      v_invoice_currency_audit) to security_invoker = true.
--   3. Harden branch-scoped RLS policies on invoices, payments, parties,
--      journal_entries, product_stock, and stock_transfer_requests.
--   4. Harden stock_transfer_requests RPCs (auth.uid, company & branch checks,
--      deleted_at IS NULL on warehouses, remove redundant 4-arg overload).
--   5. Return warehouse_id & branch_id from get_item_movements_with_balance so
--      branch-level filtering in productService.getItemMovement works accurately.
-- ==============================================================================

-- 1. Enable RLS on public.sync_outbox
ALTER TABLE IF EXISTS public.sync_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_outbox_select ON public.sync_outbox;
CREATE POLICY sync_outbox_select ON public.sync_outbox
  FOR SELECT
  USING (
    public.is_super_admin()
    OR branch_id IN (
      SELECT b.id FROM public.branches b
      WHERE b.company_id IN (SELECT public.get_auth_companies())
    )
  );

DROP POLICY IF EXISTS sync_outbox_admin_write ON public.sync_outbox;
CREATE POLICY sync_outbox_admin_write ON public.sync_outbox
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 2. Convert SECURITY DEFINER views to security_invoker = true
ALTER VIEW IF EXISTS public.party_balances SET (security_invoker = true);
ALTER VIEW IF EXISTS public.party_balances_by_currency SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_invoice_currency_audit SET (security_invoker = true);

-- 3. Harden RLS policies for branch isolation & role discipline
DROP POLICY IF EXISTS invoices_delete ON public.invoices;
CREATE POLICY invoices_delete ON public.invoices
  FOR DELETE
  USING (
    public.is_super_admin()
    OR (
      company_id IN (SELECT public.get_auth_companies())
      AND public.user_is_admin_or_manager(company_id)
      AND (branch_id IS NULL OR branch_id IN (SELECT public.get_auth_branches(company_id)))
    )
  );

DROP POLICY IF EXISTS payments_delete ON public.payments;
CREATE POLICY payments_delete ON public.payments
  FOR DELETE
  USING (
    public.is_super_admin()
    OR (
      company_id IN (SELECT public.get_auth_companies())
      AND public.user_is_admin_or_manager(company_id)
      AND (branch_id IS NULL OR branch_id IN (SELECT public.get_auth_branches(company_id)))
    )
  );

DROP POLICY IF EXISTS parties_delete ON public.parties;
CREATE POLICY parties_delete ON public.parties
  FOR DELETE
  USING (
    public.is_super_admin()
    OR (
      company_id IN (SELECT public.get_auth_companies())
      AND public.user_is_admin_or_manager(company_id)
      AND (branch_id IS NULL OR branch_id IN (SELECT public.get_auth_branches(company_id)))
    )
  );

-- Remove overly permissive company-wide update policy that bypassed branch-scoped journal_entries_update
DROP POLICY IF EXISTS journal_entries_update_status_only ON public.journal_entries;

-- Scope product_stock writes to authorized branches
DROP POLICY IF EXISTS product_stock_insert ON public.product_stock;
CREATE POLICY product_stock_insert ON public.product_stock
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      company_id IN (SELECT public.get_auth_companies())
      AND EXISTS (
        SELECT 1 FROM public.warehouses w
        WHERE w.id = product_stock.warehouse_id
          AND w.company_id = product_stock.company_id
          AND (w.branch_id IS NULL OR w.branch_id IN (SELECT public.get_auth_branches(product_stock.company_id)))
      )
    )
  );

DROP POLICY IF EXISTS product_stock_update ON public.product_stock;
CREATE POLICY product_stock_update ON public.product_stock
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR (
      company_id IN (SELECT public.get_auth_companies())
      AND EXISTS (
        SELECT 1 FROM public.warehouses w
        WHERE w.id = product_stock.warehouse_id
          AND w.company_id = product_stock.company_id
          AND (w.branch_id IS NULL OR w.branch_id IN (SELECT public.get_auth_branches(product_stock.company_id)))
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      company_id IN (SELECT public.get_auth_companies())
      AND EXISTS (
        SELECT 1 FROM public.warehouses w
        WHERE w.id = product_stock.warehouse_id
          AND w.company_id = product_stock.company_id
          AND (w.branch_id IS NULL OR w.branch_id IN (SELECT public.get_auth_branches(product_stock.company_id)))
      )
    )
  );

DROP POLICY IF EXISTS product_stock_delete ON public.product_stock;
CREATE POLICY product_stock_delete ON public.product_stock
  FOR DELETE
  USING (
    public.is_super_admin()
    OR (
      company_id IN (SELECT public.get_auth_companies())
      AND public.user_is_admin_or_manager(company_id)
      AND EXISTS (
        SELECT 1 FROM public.warehouses w
        WHERE w.id = product_stock.warehouse_id
          AND w.company_id = product_stock.company_id
          AND (w.branch_id IS NULL OR w.branch_id IN (SELECT public.get_auth_branches(product_stock.company_id)))
      )
    )
  );

-- Scope stock_transfer_requests to participating branches (or company admins)
DROP POLICY IF EXISTS str_select ON public.stock_transfer_requests;
CREATE POLICY str_select ON public.stock_transfer_requests
  FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      company_id IN (SELECT public.get_auth_companies())
      AND (
        public.user_is_admin_or_manager(company_id)
        OR requester_branch_id IN (SELECT public.get_auth_branches(company_id))
        OR source_branch_id IN (SELECT public.get_auth_branches(company_id))
      )
    )
  );

DROP POLICY IF EXISTS str_insert ON public.stock_transfer_requests;
CREATE POLICY str_insert ON public.stock_transfer_requests
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      company_id IN (SELECT public.get_auth_companies())
      AND (
        public.user_is_admin_or_manager(company_id)
        OR requester_branch_id IN (SELECT public.get_auth_branches(company_id))
      )
    )
  );

DROP POLICY IF EXISTS str_update ON public.stock_transfer_requests;
CREATE POLICY str_update ON public.stock_transfer_requests
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR (
      company_id IN (SELECT public.get_auth_companies())
      AND (
        public.user_is_admin_or_manager(company_id)
        OR requester_branch_id IN (SELECT public.get_auth_branches(company_id))
        OR source_branch_id IN (SELECT public.get_auth_branches(company_id))
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      company_id IN (SELECT public.get_auth_companies())
      AND (
        public.user_is_admin_or_manager(company_id)
        OR requester_branch_id IN (SELECT public.get_auth_branches(company_id))
        OR source_branch_id IN (SELECT public.get_auth_branches(company_id))
      )
    )
  );

-- 4. Harden stock_transfer_requests RPCs
CREATE OR REPLACE FUNCTION public.create_stock_transfer_requests_batch(
  p_company_id uuid,
  p_requester_branch_id uuid,
  p_source_branch_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL::text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_batch_id     uuid := gen_random_uuid();
  v_auth_uid     uuid := auth.uid();
  v_real_uid     uuid := COALESCE(v_auth_uid, p_user_id);
  v_group_count  integer;
  v_groups_exist boolean;
  v_item         jsonb;
  v_product_id   uuid;
  v_quantity     numeric;
  v_inserted     integer := 0;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'access_denied: يتطلب تسجيل الدخول' USING ERRCODE = '42501';
  END IF;

  PERFORM public.fn_assert_company_access(p_company_id);

  IF NOT public.is_super_admin()
     AND NOT public.user_is_admin_or_manager(p_company_id)
     AND NOT (p_requester_branch_id IN (SELECT public.get_auth_branches(p_company_id))) THEN
    RAISE EXCEPTION 'access_denied: غير مصرح بالطلب نيابةً عن هذا الفرع' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.branches b1, public.branches b2
    WHERE b1.id = p_requester_branch_id
      AND b2.id = p_source_branch_id
      AND b1.company_id = p_company_id
      AND b2.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'أحد الفرعين غير تابع لهذه المنشأة';
  END IF;

  IF p_requester_branch_id = p_source_branch_id THEN
    RAISE EXCEPTION 'لا يمكن طلب نقل من الفرع نفسه';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'يجب تحديد صنف واحد على الأقل في طلب المناقلة';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.branch_visibility_groups WHERE company_id = p_company_id
  ) INTO v_groups_exist;

  IF v_groups_exist THEN
    SELECT COUNT(*) INTO v_group_count
    FROM public.branch_visibility_members bm1
    JOIN public.branch_visibility_members bm2 USING (group_id)
    WHERE bm1.branch_id = p_requester_branch_id
      AND bm2.branch_id = p_source_branch_id
      AND bm1.company_id = p_company_id;

    IF v_group_count = 0 THEN
      RAISE EXCEPTION 'الفرعان ليسا في نفس مجموعة رؤية المخزون';
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity   := (v_item->>'quantity')::numeric;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'معرف الصنف مطلوب لجميع بنود المناقلة';
    END IF;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'يجب أن تكون كمية كل صنف أكبر من الصفر';
    END IF;

    INSERT INTO public.stock_transfer_requests (
      batch_id,
      company_id,
      requester_branch_id,
      source_branch_id,
      product_id,
      requested_quantity,
      notes,
      created_by
    ) VALUES (
      v_batch_id,
      p_company_id,
      p_requester_branch_id,
      p_source_branch_id,
      v_product_id,
      v_quantity,
      p_notes,
      v_real_uid
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  PERFORM pg_notify(
    'stock_transfer_request',
    json_build_object(
      'batch_id',            v_batch_id,
      'requester_branch_id', p_requester_branch_id,
      'source_branch_id',    p_source_branch_id,
      'items_count',         v_inserted
    )::text
  );

  RETURN v_batch_id;
END;
$function$;

-- Remove redundant 4-argument overload to prevent ambiguous RPC resolution
DROP FUNCTION IF EXISTS public.respond_stock_transfer_request(uuid, text, text, uuid);

CREATE OR REPLACE FUNCTION public.respond_stock_transfer_request(
  p_request_id uuid,
  p_action text,
  p_review_notes text DEFAULT NULL::text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_approved_quantity numeric DEFAULT NULL::numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth_uid    uuid := auth.uid();
  v_real_uid    uuid := COALESCE(v_auth_uid, p_user_id);
  v_status      text;
  v_req         record;
  v_from_wh     uuid;
  v_to_wh       uuid;
  v_transfer_id uuid;
  v_qty         numeric;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'access_denied: يتطلب تسجيل الدخول' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('approve', 'reject', 'cancel') THEN
    RAISE EXCEPTION 'إجراء غير صالح: %', p_action;
  END IF;

  SELECT * INTO v_req
  FROM public.stock_transfer_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لم يتم العثور على الطلب أو تم معالجته مسبقاً';
  END IF;

  PERFORM public.fn_assert_company_access(v_req.company_id);

  IF NOT public.is_super_admin() AND NOT public.user_is_admin_or_manager(v_req.company_id) THEN
    IF p_action IN ('approve', 'reject')
       AND NOT (v_req.source_branch_id IN (SELECT public.get_auth_branches(v_req.company_id))) THEN
      RAISE EXCEPTION 'access_denied: غير مصرح باعتماد أو رفض طلبات هذا الفرع' USING ERRCODE = '42501';
    ELSIF p_action = 'cancel'
       AND NOT (v_req.requester_branch_id IN (SELECT public.get_auth_branches(v_req.company_id))) THEN
      RAISE EXCEPTION 'access_denied: غير مصرح بإلغاء طلب فرع آخر' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_action = 'approve' THEN
    v_qty := COALESCE(p_approved_quantity, v_req.requested_quantity);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'يجب أن تكون الكمية المرسلة أكبر من الصفر';
    END IF;

    SELECT id INTO v_from_wh
    FROM public.warehouses
    WHERE branch_id = v_req.source_branch_id
      AND company_id = v_req.company_id
      AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1;

    SELECT id INTO v_to_wh
    FROM public.warehouses
    WHERE branch_id = v_req.requester_branch_id
      AND company_id = v_req.company_id
      AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1;

    IF v_from_wh IS NULL OR v_to_wh IS NULL THEN
      RAISE EXCEPTION 'تعذر العثور على مستودع نشط لأحد الفرعين لإتمام النقل';
    END IF;

    INSERT INTO public.stock_transfers (
      company_id, from_warehouse_id, to_warehouse_id, notes, status, created_by
    ) VALUES (
      v_req.company_id, v_from_wh, v_to_wh,
      COALESCE(p_review_notes, 'تحويل مخزني بناء على طلب معتمد'),
      'pending', v_real_uid
    ) RETURNING id INTO v_transfer_id;

    INSERT INTO public.stock_transfer_items (
      transfer_id, company_id, product_id, quantity
    ) VALUES (
      v_transfer_id, v_req.company_id, v_req.product_id, v_qty
    );

    PERFORM public.process_stock_transfer(v_transfer_id);

    v_status := 'completed';
  ELSIF p_action = 'reject' THEN
    v_status := 'rejected';
  ELSE
    v_status := 'cancelled';
  END IF;

  UPDATE public.stock_transfer_requests
  SET status       = v_status,
      reviewed_by  = v_real_uid,
      review_notes = p_review_notes,
      updated_at   = now()
  WHERE id = p_request_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.respond_stock_transfer_requests_batch(
  p_batch_id uuid,
  p_action text,
  p_items_approved jsonb DEFAULT NULL::jsonb,
  p_review_notes text DEFAULT NULL::text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth_uid     uuid := auth.uid();
  v_real_uid     uuid := COALESCE(v_auth_uid, p_user_id);
  v_status       text;
  v_req          record;
  v_from_wh      uuid;
  v_to_wh        uuid;
  v_transfer_id  uuid;
  v_company_id   uuid;
  v_source_br    uuid;
  v_req_br       uuid;
  v_qty          numeric;
  v_override_qty numeric;
  v_item_record  jsonb;
  v_pending_cnt  integer;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'access_denied: يتطلب تسجيل الدخول' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('approve', 'reject', 'cancel') THEN
    RAISE EXCEPTION 'إجراء غير صالح: %', p_action;
  END IF;

  SELECT COUNT(*) INTO v_pending_cnt
  FROM public.stock_transfer_requests
  WHERE batch_id = p_batch_id AND status = 'pending';

  IF v_pending_cnt = 0 THEN
    RAISE EXCEPTION 'لم يتم العثور على طلبات معلقة لهذه الحزمة أو تم معالجتها مسبقاً';
  END IF;

  SELECT company_id, source_branch_id, requester_branch_id
  INTO v_company_id, v_source_br, v_req_br
  FROM public.stock_transfer_requests
  WHERE batch_id = p_batch_id AND status = 'pending'
  LIMIT 1;

  PERFORM public.fn_assert_company_access(v_company_id);

  IF NOT public.is_super_admin() AND NOT public.user_is_admin_or_manager(v_company_id) THEN
    IF p_action IN ('approve', 'reject')
       AND NOT (v_source_br IN (SELECT public.get_auth_branches(v_company_id))) THEN
      RAISE EXCEPTION 'access_denied: غير مصرح باعتماد أو رفض طلبات هذا الفرع' USING ERRCODE = '42501';
    ELSIF p_action = 'cancel'
       AND NOT (v_req_br IN (SELECT public.get_auth_branches(v_company_id))) THEN
      RAISE EXCEPTION 'access_denied: غير مصرح بإلغاء طلب فرع آخر' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_action = 'approve' THEN
    SELECT id INTO v_from_wh
    FROM public.warehouses
    WHERE branch_id = v_source_br
      AND company_id = v_company_id
      AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1;

    SELECT id INTO v_to_wh
    FROM public.warehouses
    WHERE branch_id = v_req_br
      AND company_id = v_company_id
      AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1;

    IF v_from_wh IS NULL OR v_to_wh IS NULL THEN
      RAISE EXCEPTION 'تعذر العثور على مستودع نشط لأحد الفرعين لإتمام النقل';
    END IF;

    INSERT INTO public.stock_transfers (
      company_id, from_warehouse_id, to_warehouse_id, notes, status, created_by
    ) VALUES (
      v_company_id, v_from_wh, v_to_wh,
      COALESCE(p_review_notes, 'تحويل مخزني بناء على طلب فروع معتمد'),
      'pending', v_real_uid
    ) RETURNING id INTO v_transfer_id;

    FOR v_req IN
      SELECT id, product_id, requested_quantity
      FROM public.stock_transfer_requests
      WHERE batch_id = p_batch_id AND status = 'pending'
      FOR UPDATE
    LOOP
      v_qty := v_req.requested_quantity;

      IF p_items_approved IS NOT NULL THEN
        FOR v_item_record IN SELECT * FROM jsonb_array_elements(p_items_approved)
        LOOP
          IF (v_item_record->>'request_id')::uuid = v_req.id THEN
            v_override_qty := (v_item_record->>'approved_quantity')::numeric;
            IF v_override_qty IS NOT NULL AND v_override_qty > 0 THEN
              v_qty := v_override_qty;
            END IF;
          END IF;
        END LOOP;
      END IF;

      INSERT INTO public.stock_transfer_items (
        transfer_id, company_id, product_id, quantity
      ) VALUES (
        v_transfer_id, v_company_id, v_req.product_id, v_qty
      );
    END LOOP;

    PERFORM public.process_stock_transfer(v_transfer_id);

    v_status := 'completed';
  ELSIF p_action = 'reject' THEN
    v_status := 'rejected';
  ELSE
    v_status := 'cancelled';
  END IF;

  UPDATE public.stock_transfer_requests
  SET status       = v_status,
      reviewed_by  = v_real_uid,
      review_notes = p_review_notes,
      updated_at   = now()
  WHERE batch_id = p_batch_id AND status = 'pending';
END;
$function$;

-- 5. Return warehouse_id and branch_id from get_item_movements_with_balance
DROP FUNCTION IF EXISTS public.get_item_movements_with_balance(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_item_movements_with_balance(p_company_id uuid, p_product_id uuid)
RETURNS TABLE(
  id uuid,
  date timestamp with time zone,
  quantity numeric,
  transaction_type text,
  original_type text,
  reference_type text,
  source_user text,
  source_name text,
  document_number text,
  notes text,
  raw_quantity numeric,
  balance_after numeric,
  warehouse_id uuid,
  branch_id uuid
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_curr_qty numeric;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT SUM(ps.quantity) INTO v_curr_qty
  FROM public.product_stock ps
  WHERE ps.product_id = p_product_id
    AND ps.company_id = p_company_id;

  RETURN QUERY
  WITH combined_movements AS (
    SELECT
      m.id,
      m.created_at AS mov_date,
      ABS(COALESCE(m.quantity, 0))::numeric AS qty,
      CASE
        WHEN m.transaction_type IN ('purchase', 'sales_return', 'adj_in', 'transfer_in', 'initial') THEN 'in'
        WHEN m.transaction_type IN ('sales', 'purchase_return', 'adj_out', 'transfer_out') THEN 'out'
        ELSE CASE WHEN COALESCE(m.quantity, 0) >= 0 THEN 'in' ELSE 'out' END
      END AS t_type,
      m.transaction_type::text AS orig_type,
      COALESCE(m.reference_type, 'inventory_transaction')::text AS ref_type,
      COALESCE(u.email, 'النظام')::text AS src_user,
      COALESCE(
        p.name,
        wf.name_ar || ' ◄ ' || wt.name_ar,
        CASE WHEN m.reference_type = 'stock_audit' THEN 'تسوية جردية' ELSE '---' END
      )::text AS src_name,
      COALESCE(
        CASE
          WHEN i.type = 'sale' THEN 'فاتورة بيع #' || i.invoice_number
          WHEN i.type = 'purchase' THEN 'فاتورة شراء #' || i.invoice_number
          WHEN i.type = 'sale_return' THEN 'مردود مبيعات #' || i.invoice_number
          WHEN i.type = 'purchase_return' THEN 'مردود مشتريات #' || i.invoice_number
          WHEN i.id IS NOT NULL THEN 'فاتورة #' || i.invoice_number
        END,
        CASE WHEN t.id IS NOT NULL THEN 'مناقلة مخزنية' END,
        CASE WHEN m.reference_type = 'stock_audit' THEN 'جرد مخزني' ELSE 'حركة مخزنية' END
      )::text AS doc_num,
      COALESCE(i.notes, t.notes, '')::text AS m_notes,
      COALESCE(m.quantity, 0)::numeric AS raw_qty,
      m.warehouse_id AS wh_id,
      COALESCE(i.branch_id, mw.branch_id) AS br_id
    FROM public.inventory_transactions m
    LEFT JOIN auth.users u ON m.created_by = u.id
    LEFT JOIN public.warehouses mw ON m.warehouse_id = mw.id
    LEFT JOIN public.invoices i ON m.reference_id = i.id
    LEFT JOIN public.parties p ON i.party_id = p.id
    LEFT JOIN public.stock_transfers t ON m.reference_id = t.id
    LEFT JOIN public.warehouses wf ON t.from_warehouse_id = wf.id
    LEFT JOIN public.warehouses wt ON t.to_warehouse_id = wt.id
    WHERE m.product_id = p_product_id
      AND m.company_id = p_company_id
      AND m.deleted_at IS NULL

    UNION ALL

    SELECT
      ii.id,
      COALESCE(inv.created_at, inv.issue_date::timestamp with time zone) AS mov_date,
      ABS(COALESCE(ii.quantity, 0))::numeric AS qty,
      CASE
        WHEN inv.type IN ('purchase', 'sale_return') THEN 'in'
        ELSE 'out'
      END AS t_type,
      inv.type::text AS orig_type,
      'invoice'::text AS ref_type,
      COALESCE(u.email, 'النظام')::text AS src_user,
      COALESCE(p.name, '---')::text AS src_name,
      CASE
        WHEN inv.type = 'sale' THEN 'فاتورة بيع #' || inv.invoice_number
        WHEN inv.type = 'purchase' THEN 'فاتورة شراء #' || inv.invoice_number
        WHEN inv.type = 'sale_return' THEN 'مردود مبيعات #' || inv.invoice_number
        WHEN inv.type = 'purchase_return' THEN 'مردود مشتريات #' || inv.invoice_number
        ELSE 'فاتورة #' || inv.invoice_number
      END::text AS doc_num,
      COALESCE(inv.notes, '')::text AS m_notes,
      CASE
        WHEN inv.type IN ('purchase', 'sale_return') THEN ABS(COALESCE(ii.quantity, 0))
        ELSE -ABS(COALESCE(ii.quantity, 0))
      END::numeric AS raw_qty,
      NULL::uuid AS wh_id,
      inv.branch_id AS br_id
    FROM public.invoice_items ii
    JOIN public.invoices inv ON ii.invoice_id = inv.id
    LEFT JOIN public.parties p ON inv.party_id = p.id
    LEFT JOIN auth.users u ON inv.created_by = u.id
    WHERE ii.product_id = p_product_id
      AND inv.company_id = p_company_id
      AND inv.deleted_at IS NULL
      AND inv.status != 'void'
      AND NOT EXISTS (
        SELECT 1 FROM public.inventory_transactions it
        WHERE it.reference_id = inv.id
          AND it.product_id = p_product_id
          AND it.deleted_at IS NULL
      )
  ),
  with_balance AS (
    SELECT
      cm.id,
      cm.mov_date AS date,
      cm.qty AS quantity,
      cm.t_type AS transaction_type,
      cm.orig_type AS original_type,
      cm.ref_type AS reference_type,
      cm.src_user AS source_user,
      cm.src_name AS source_name,
      cm.doc_num AS document_number,
      cm.m_notes AS notes,
      cm.raw_qty AS raw_quantity,
      CASE
        WHEN v_curr_qty IS NOT NULL THEN
          (v_curr_qty - COALESCE(SUM(cm.raw_qty) OVER (
             ORDER BY cm.mov_date DESC, cm.id DESC
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ), 0))::numeric
        ELSE
          (SUM(cm.raw_qty) OVER (
             ORDER BY cm.mov_date ASC, cm.id ASC
             ROWS UNBOUNDED PRECEDING
           ))::numeric
      END AS balance_after,
      cm.wh_id AS warehouse_id,
      cm.br_id AS branch_id
    FROM combined_movements cm
  )
  SELECT
    wb.id,
    wb.date,
    wb.quantity,
    wb.transaction_type,
    wb.original_type,
    wb.reference_type,
    wb.source_user,
    wb.source_name,
    wb.document_number,
    wb.notes,
    wb.raw_quantity,
    wb.balance_after,
    wb.warehouse_id,
    wb.branch_id
  FROM with_balance wb
  ORDER BY wb.date DESC, wb.id DESC
  LIMIT 500;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_item_movements_with_balance(uuid, uuid) TO authenticated;

