-- ============================================================================
-- Wave 43: Fix Stock Transfer Approval & Cross-Branch Inventory Posting
-- ============================================================================
-- Root causes fixed:
-- 1. fn_post_inventory_movement enforced fn_assert_branch_access on BOTH
--    from_warehouse_id AND to_warehouse_id, causing branch-scoped managers to
--    fail with 42501 on the transfer_in leg when approving cross-branch transfers.
-- 2. process_stock_transfer raised raw UUID errors with trailing .0000 decimals
--    and rejected branch-authorized transfer approvers whose role was not in
--    the narrow manager subset.
-- 3. respond_stock_transfer_requests_batch & respond_stock_transfer_request
--    checked only the primary warehouse of source_branch_id instead of
--    allocating across active warehouses in the source branch and reporting
--    clear Arabic stock-availability messages with product names.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_post_inventory_movement(
  p_company_id uuid,
  p_product_id uuid,
  p_warehouse_id uuid,
  p_quantity numeric,
  p_transaction_type text,
  p_reference_type text,
  p_reference_id uuid,
  p_created_by uuid,
  p_unit_cost numeric DEFAULT NULL::numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cost numeric;
  v_id uuid;
  v_branch_id uuid;
  v_is_authorized_transfer_in boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT branch_id INTO v_branch_id
  FROM public.warehouses
  WHERE id = p_warehouse_id AND company_id = p_company_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'warehouse_not_found' USING ERRCODE = '22023';
  END IF;

  -- Allow the destination transfer_in leg ONLY when invoked inside
  -- process_stock_transfer() for the exact transfer ID being posted
  -- (process_stock_transfer already verified company + source branch access).
  IF p_transaction_type = 'transfer_in'
     AND p_reference_type = 'stock_transfer'
     AND p_reference_id IS NOT NULL
     AND current_setting('app.stock_transfer_posting_id', true) = p_reference_id::text THEN
    v_is_authorized_transfer_in := true;
  END IF;

  IF v_is_authorized_transfer_in THEN
    PERFORM public.fn_assert_company_access(p_company_id);
  ELSE
    PERFORM public.fn_assert_branch_access(p_company_id, v_branch_id);
  END IF;

  IF p_unit_cost IS NOT NULL THEN
    v_cost := p_unit_cost;
  ELSE
    SELECT weighted_avg_cost INTO v_cost
    FROM public.product_stock
    WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

    IF v_cost IS NULL THEN
      SELECT cost_price INTO v_cost
      FROM public.products
      WHERE id = p_product_id AND company_id = p_company_id;
    END IF;
    v_cost := COALESCE(v_cost, 0);
  END IF;

  INSERT INTO public.inventory_transactions(
    company_id, product_id, warehouse_id, quantity, unit_cost,
    transaction_type, reference_type, reference_id, created_by
  ) VALUES (
    p_company_id, p_product_id, p_warehouse_id, p_quantity, v_cost,
    p_transaction_type, p_reference_type, p_reference_id, COALESCE(auth.uid(), p_created_by)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_stock_transfer(p_transfer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_avail_qty numeric;
  v_unit_cost numeric;
  v_from_branch_id uuid;
  v_from_wh_name text;
  v_to_wh_exists boolean := false;
  v_product_name text;
  v_via_request boolean := false;
BEGIN
  SELECT * INTO v_transfer
  FROM public.stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF v_transfer IS NULL THEN
    RAISE EXCEPTION 'التحويل غير موجود: %', p_transfer_id;
  END IF;

  PERFORM public.fn_assert_company_access(v_transfer.company_id);

  v_via_request := (current_setting('app.stock_transfer_request_authorized', true) = 'true');

  IF NOT v_via_request
     AND NOT public.is_super_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.user_company_roles ucr
       WHERE ucr.user_id = auth.uid()
         AND ucr.company_id = v_transfer.company_id
         AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
     ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية تنفيذ التحويل المخزني' USING ERRCODE = '42501';
  END IF;

  IF v_transfer.from_warehouse_id = v_transfer.to_warehouse_id THEN
    RAISE EXCEPTION 'لا يمكن تنفيذ مناقلة من وإلى نفس المستودع';
  END IF;

  SELECT branch_id, name_ar
  INTO v_from_branch_id, v_from_wh_name
  FROM public.warehouses
  WHERE id = v_transfer.from_warehouse_id
    AND company_id = v_transfer.company_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستودع المصدر غير موجود أو غير نشط';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.warehouses
    WHERE id = v_transfer.to_warehouse_id
      AND company_id = v_transfer.company_id
      AND deleted_at IS NULL
  ) INTO v_to_wh_exists;

  IF NOT v_to_wh_exists THEN
    RAISE EXCEPTION 'المستودع المستلم غير موجود أو غير نشط';
  END IF;

  PERFORM public.fn_assert_branch_access(v_transfer.company_id, v_from_branch_id);

  IF v_transfer.status = 'completed' THEN
    RAISE EXCEPTION 'تم تنفيذ هذا التحويل مسبقاً';
  END IF;
  IF v_transfer.status = 'cancelled' THEN
    RAISE EXCEPTION 'لا يمكن تنفيذ تحويل ملغى';
  END IF;

  PERFORM set_config('app.stock_transfer_posting_id', p_transfer_id::text, true);

  FOR v_item IN
    SELECT *
    FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id
  LOOP
    SELECT COALESCE(ps.quantity, 0), ps.weighted_avg_cost
    INTO v_avail_qty, v_unit_cost
    FROM public.product_stock ps
    WHERE ps.product_id = v_item.product_id
      AND ps.warehouse_id = v_transfer.from_warehouse_id
    FOR UPDATE;

    IF COALESCE(v_avail_qty, 0) < v_item.quantity THEN
      SELECT name_ar INTO v_product_name
      FROM public.products
      WHERE id = v_item.product_id AND company_id = v_transfer.company_id;

      PERFORM set_config('app.stock_transfer_posting_id', '', true);

      RAISE EXCEPTION 'الكمية المتوفرة للصنف "%" في المستودع المصدر "%" هي (%) فقط، بينما الكمية المطلوبة (%)',
        COALESCE(v_product_name, v_item.product_id::text),
        COALESCE(v_from_wh_name, v_transfer.from_warehouse_id::text),
        trim_scale(COALESCE(v_avail_qty, 0)),
        trim_scale(v_item.quantity);
    END IF;

    IF v_unit_cost IS NULL OR v_unit_cost = 0 THEN
      SELECT COALESCE(NULLIF(cost_price, 0), purchase_price, 0)
      INTO v_unit_cost
      FROM public.products
      WHERE id = v_item.product_id AND company_id = v_transfer.company_id;
    END IF;
    v_unit_cost := COALESCE(v_unit_cost, 0);

    PERFORM public.fn_post_inventory_movement(
      v_transfer.company_id, v_item.product_id, v_transfer.from_warehouse_id,
      v_item.quantity, 'transfer_out', 'stock_transfer', p_transfer_id,
      COALESCE(auth.uid(), v_transfer.created_by), v_unit_cost
    );
    PERFORM public.fn_post_inventory_movement(
      v_transfer.company_id, v_item.product_id, v_transfer.to_warehouse_id,
      v_item.quantity, 'transfer_in', 'stock_transfer', p_transfer_id,
      COALESCE(auth.uid(), v_transfer.created_by), v_unit_cost
    );
  END LOOP;

  PERFORM set_config('app.stock_transfer_posting_id', '', true);

  UPDATE public.stock_transfers
  SET status = 'completed', updated_at = now()
  WHERE id = p_transfer_id;

  RETURN p_transfer_id;
END;
$function$;

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
  v_auth_uid     uuid := auth.uid();
  v_real_uid     uuid := COALESCE(v_auth_uid, p_user_id);
  v_status       text;
  v_req          record;
  v_to_wh        uuid;
  v_has_src_wh   boolean := false;
  v_transfer_id  uuid;
  v_qty          numeric;
  v_remaining    numeric;
  v_take         numeric;
  v_branch_avail numeric;
  v_product_name text;
  v_wh_rec       record;
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

  IF NOT public.fn_has_all_branch_access(v_req.company_id) THEN
    IF p_action IN ('approve', 'reject')
       AND NOT (v_req.source_branch_id IN (SELECT public.get_auth_branches(v_req.company_id))) THEN
      RAISE EXCEPTION 'access_denied: ليس لديك صلاحية الرد على طلبات هذا الفرع' USING ERRCODE = '42501';
    ELSIF p_action = 'cancel'
       AND NOT (v_req.requester_branch_id IN (SELECT public.get_auth_branches(v_req.company_id))) THEN
      RAISE EXCEPTION 'access_denied: ليس لديك صلاحية إلغاء هذا الطلب' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_action = 'approve' THEN
    v_qty := COALESCE(p_approved_quantity, v_req.requested_quantity);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'يجب أن تكون الكمية المعتمدة أكبر من الصفر';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.warehouses
      WHERE branch_id = v_req.source_branch_id
        AND company_id = v_req.company_id
        AND deleted_at IS NULL
    ) INTO v_has_src_wh;

    SELECT id INTO v_to_wh
    FROM public.warehouses
    WHERE branch_id = v_req.requester_branch_id
      AND company_id = v_req.company_id
      AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1;

    IF NOT v_has_src_wh OR v_to_wh IS NULL THEN
      RAISE EXCEPTION 'تعذر العثور على مستودع نشط لأحد الفرعين لإتمام النقل';
    END IF;

    SELECT COALESCE(SUM(GREATEST(COALESCE(ps.quantity, 0), 0)), 0)
    INTO v_branch_avail
    FROM public.warehouses w
    LEFT JOIN public.product_stock ps
      ON ps.warehouse_id = w.id
     AND ps.product_id = v_req.product_id
    WHERE w.branch_id = v_req.source_branch_id
      AND w.company_id = v_req.company_id
      AND w.deleted_at IS NULL;

    IF v_branch_avail < v_qty THEN
      SELECT name_ar INTO v_product_name
      FROM public.products
      WHERE id = v_req.product_id AND company_id = v_req.company_id;

      RAISE EXCEPTION 'الكمية المتوفرة للصنف "%" في فرع المصدر هي (%) فقط، بينما الكمية المعتمدة (%). يرجى تعديل الكمية المعتمدة بما لا يتجاوز المتوفر.',
        COALESCE(v_product_name, v_req.product_id::text),
        trim_scale(v_branch_avail),
        trim_scale(v_qty);
    END IF;

    v_remaining := v_qty;

    PERFORM set_config('app.stock_transfer_request_authorized', 'true', true);

    FOR v_wh_rec IN
      SELECT w.id AS warehouse_id, GREATEST(COALESCE(ps.quantity, 0), 0) AS avail_qty
      FROM public.warehouses w
      JOIN public.product_stock ps
        ON ps.warehouse_id = w.id
       AND ps.product_id = v_req.product_id
      WHERE w.branch_id = v_req.source_branch_id
        AND w.company_id = v_req.company_id
        AND w.deleted_at IS NULL
        AND ps.quantity > 0
      ORDER BY w.is_primary DESC, ps.quantity DESC, w.created_at ASC
      FOR UPDATE OF ps
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_take := LEAST(v_remaining, v_wh_rec.avail_qty);
      IF v_take <= 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.stock_transfers (
        company_id, from_warehouse_id, to_warehouse_id, notes, status, created_by
      ) VALUES (
        v_req.company_id, v_wh_rec.warehouse_id, v_to_wh,
        COALESCE(p_review_notes, 'مناقلة مخزنية بناءً على طلب تحويل'),
        'pending', v_real_uid
      ) RETURNING id INTO v_transfer_id;

      INSERT INTO public.stock_transfer_items (
        transfer_id, company_id, product_id, quantity
      ) VALUES (
        v_transfer_id, v_req.company_id, v_req.product_id, v_take
      );

      PERFORM public.process_stock_transfer(v_transfer_id);

      v_remaining := v_remaining - v_take;
    END LOOP;

    PERFORM set_config('app.stock_transfer_request_authorized', '', true);

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'تعذر إتمام خصم الكمية الكاملة للصنف من مستودعات فرع المصدر';
    END IF;

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
  v_auth_uid      uuid := auth.uid();
  v_real_uid      uuid := COALESCE(v_auth_uid, p_user_id);
  v_status        text;
  v_req           record;
  v_to_wh         uuid;
  v_has_src_wh    boolean := false;
  v_transfer_id   uuid;
  v_company_id    uuid;
  v_source_br     uuid;
  v_req_br        uuid;
  v_qty           numeric;
  v_override_qty  numeric;
  v_item_record   jsonb;
  v_pending_cnt   integer;
  v_branch_avail  numeric;
  v_product_name  text;
  v_remaining     numeric;
  v_take          numeric;
  v_wh_rec        record;
  v_transfer_map  jsonb := '{}'::jsonb;
  v_used_map      jsonb := '{}'::jsonb;
  v_used_key      text;
  v_already_used  numeric;
  v_wh_effective  numeric;
  v_transfer_key  text;
  v_transfer_val  text;
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
    RAISE EXCEPTION 'لم يتم العثور على طلبات معلقة لهذه الدفعة أو تم معالجتها مسبقاً';
  END IF;

  SELECT company_id, source_branch_id, requester_branch_id
  INTO v_company_id, v_source_br, v_req_br
  FROM public.stock_transfer_requests
  WHERE batch_id = p_batch_id AND status = 'pending'
  LIMIT 1;

  PERFORM public.fn_assert_company_access(v_company_id);

  IF NOT public.fn_has_all_branch_access(v_company_id) THEN
    IF p_action IN ('approve', 'reject')
       AND NOT (v_source_br IN (SELECT public.get_auth_branches(v_company_id))) THEN
      RAISE EXCEPTION 'access_denied: ليس لديك صلاحية الرد على طلبات هذا الفرع' USING ERRCODE = '42501';
    ELSIF p_action = 'cancel'
       AND NOT (v_req_br IN (SELECT public.get_auth_branches(v_company_id))) THEN
      RAISE EXCEPTION 'access_denied: ليس لديك صلاحية إلغاء هذا الطلب' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_action = 'approve' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.warehouses
      WHERE branch_id = v_source_br
        AND company_id = v_company_id
        AND deleted_at IS NULL
    ) INTO v_has_src_wh;

    SELECT id INTO v_to_wh
    FROM public.warehouses
    WHERE branch_id = v_req_br
      AND company_id = v_company_id
      AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1;

    IF NOT v_has_src_wh OR v_to_wh IS NULL THEN
      RAISE EXCEPTION 'تعذر العثور على مستودع نشط لأحد الفرعين لإتمام النقل';
    END IF;

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

      IF v_qty <= 0 THEN
        RAISE EXCEPTION 'يجب أن تكون الكمية المعتمدة أكبر من الصفر';
      END IF;

      v_branch_avail := 0;
      FOR v_wh_rec IN
        SELECT w.id AS warehouse_id, GREATEST(COALESCE(ps.quantity, 0), 0) AS avail_qty
        FROM public.warehouses w
        JOIN public.product_stock ps
          ON ps.warehouse_id = w.id
         AND ps.product_id = v_req.product_id
        WHERE w.branch_id = v_source_br
          AND w.company_id = v_company_id
          AND w.deleted_at IS NULL
          AND ps.quantity > 0
        ORDER BY w.is_primary DESC, ps.quantity DESC, w.created_at ASC
        FOR UPDATE OF ps
      LOOP
        v_used_key := v_wh_rec.warehouse_id::text || ':' || v_req.product_id::text;
        v_already_used := COALESCE((v_used_map ->> v_used_key)::numeric, 0);
        v_wh_effective := GREATEST(v_wh_rec.avail_qty - v_already_used, 0);
        v_branch_avail := v_branch_avail + v_wh_effective;
      END LOOP;

      IF v_branch_avail < v_qty THEN
        SELECT name_ar INTO v_product_name
        FROM public.products
        WHERE id = v_req.product_id AND company_id = v_company_id;

        RAISE EXCEPTION 'الكمية المتوفرة للصنف "%" في فرع المصدر هي (%) فقط، بينما الكمية المعتمدة (%). يرجى تعديل الكمية المعتمدة بما لا يتجاوز المتوفر.',
          COALESCE(v_product_name, v_req.product_id::text),
          trim_scale(v_branch_avail),
          trim_scale(v_qty);
      END IF;

      v_remaining := v_qty;

      FOR v_wh_rec IN
        SELECT w.id AS warehouse_id, GREATEST(COALESCE(ps.quantity, 0), 0) AS avail_qty
        FROM public.warehouses w
        JOIN public.product_stock ps
          ON ps.warehouse_id = w.id
         AND ps.product_id = v_req.product_id
        WHERE w.branch_id = v_source_br
          AND w.company_id = v_company_id
          AND w.deleted_at IS NULL
          AND ps.quantity > 0
        ORDER BY w.is_primary DESC, ps.quantity DESC, w.created_at ASC
      LOOP
        EXIT WHEN v_remaining <= 0;

        v_used_key := v_wh_rec.warehouse_id::text || ':' || v_req.product_id::text;
        v_already_used := COALESCE((v_used_map ->> v_used_key)::numeric, 0);
        v_wh_effective := GREATEST(v_wh_rec.avail_qty - v_already_used, 0);
        v_take := LEAST(v_remaining, v_wh_effective);

        IF v_take <= 0 THEN
          CONTINUE;
        END IF;

        v_used_map := jsonb_set(v_used_map, ARRAY[v_used_key], to_jsonb(v_already_used + v_take));

        v_transfer_key := v_wh_rec.warehouse_id::text;
        v_transfer_val := v_transfer_map ->> v_transfer_key;

        IF v_transfer_val IS NULL THEN
          INSERT INTO public.stock_transfers (
            company_id, from_warehouse_id, to_warehouse_id, notes, status, created_by
          ) VALUES (
            v_company_id, v_wh_rec.warehouse_id, v_to_wh,
            COALESCE(p_review_notes, 'مناقلة مخزنية بناءً على طلب تحويل دفعي'),
            'pending', v_real_uid
          ) RETURNING id INTO v_transfer_id;

          v_transfer_map := jsonb_set(v_transfer_map, ARRAY[v_transfer_key], to_jsonb(v_transfer_id::text));
        ELSE
          v_transfer_id := v_transfer_val::uuid;
        END IF;

        INSERT INTO public.stock_transfer_items (
          transfer_id, company_id, product_id, quantity
        ) VALUES (
          v_transfer_id, v_company_id, v_req.product_id, v_take
        );

        v_remaining := v_remaining - v_take;
      END LOOP;

      IF v_remaining > 0 THEN
        RAISE EXCEPTION 'تعذر إتمام خصم الكمية الكاملة للصنف من مستودعات فرع المصدر';
      END IF;
    END LOOP;

    PERFORM set_config('app.stock_transfer_request_authorized', 'true', true);

    FOR v_transfer_val IN
      SELECT value FROM jsonb_each_text(v_transfer_map)
    LOOP
      PERFORM public.process_stock_transfer(v_transfer_val::uuid);
    END LOOP;

    PERFORM set_config('app.stock_transfer_request_authorized', '', true);

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

NOTIFY pgrst, 'reload schema';
