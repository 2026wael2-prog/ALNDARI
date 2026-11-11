-- Migration: 20261109010000_add_batch_transfer_support.sql
-- Description: Adds batch_id and batch transfer RPC functions for cross-branch stock transfers

-- 1. Add batch_id to stock_transfer_requests if not present
ALTER TABLE public.stock_transfer_requests
  ADD COLUMN IF NOT EXISTS batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_stock_transfer_requests_batch
  ON public.stock_transfer_requests(batch_id);

-- 2. Add stock_transfer_requests to supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'stock_transfer_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_transfer_requests;
  END IF;
END $$;

-- 3. Function: create_stock_transfer_requests_batch
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
AS $$
DECLARE
  v_batch_id    uuid := gen_random_uuid();
  v_real_uid    uuid := COALESCE(p_user_id, auth.uid());
  v_group_count integer;
  v_groups_exist boolean;
  v_item        jsonb;
  v_product_id  uuid;
  v_quantity    numeric;
  v_inserted    integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM branches b1, branches b2
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
    SELECT 1 FROM branch_visibility_groups WHERE company_id = p_company_id
  ) INTO v_groups_exist;

  IF v_groups_exist THEN
    SELECT COUNT(*) INTO v_group_count
    FROM branch_visibility_members bm1
    JOIN branch_visibility_members bm2 USING (group_id)
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

    INSERT INTO stock_transfer_requests (
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
$$;

-- 4. Function: respond_stock_transfer_requests_batch
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
AS $$
DECLARE
  v_real_uid    uuid := COALESCE(p_user_id, auth.uid());
  v_status      text;
  v_req         record;
  v_from_wh     uuid;
  v_to_wh       uuid;
  v_transfer_id uuid;
  v_company_id  uuid;
  v_source_br   uuid;
  v_req_br      uuid;
  v_qty         numeric;
  v_override_qty numeric;
  v_item_record jsonb;
  v_pending_cnt integer;
BEGIN
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

  IF p_action = 'approve' THEN
    -- جلب مستودع الفرع المصدر
    SELECT id INTO v_from_wh 
    FROM public.warehouses 
    WHERE branch_id = v_source_br AND company_id = v_company_id
    ORDER BY is_primary DESC, created_at ASC LIMIT 1;

    -- جلب مستودع الفرع الطالب
    SELECT id INTO v_to_wh 
    FROM public.warehouses 
    WHERE branch_id = v_req_br AND company_id = v_company_id
    ORDER BY is_primary DESC, created_at ASC LIMIT 1;

    IF v_from_wh IS NULL OR v_to_wh IS NULL THEN
      RAISE EXCEPTION 'تعذر العثور على مستودع لأحد الفرعين لإتمام النقل';
    END IF;

    -- إنشاء عملية النقل الموحدة لكافة بنود الحزمة
    INSERT INTO public.stock_transfers (
      company_id, from_warehouse_id, to_warehouse_id, notes, status, created_by
    ) VALUES (
      v_company_id, v_from_wh, v_to_wh, 
      COALESCE(p_review_notes, 'تحويل مخزني بناء على طلب فروع معتمد'),
      'pending', v_real_uid
    ) RETURNING id INTO v_transfer_id;

    -- إضافة البنود إلى المناقلة
    FOR v_req IN
      SELECT id, product_id, requested_quantity
      FROM public.stock_transfer_requests
      WHERE batch_id = p_batch_id AND status = 'pending'
      FOR UPDATE
    LOOP
      v_qty := v_req.requested_quantity;

      -- التحقق مما إذا تم تخصيص كمية معتمدة لهذا البند تحديداً
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

    -- تنفيذ حركة المخزون
    PERFORM public.process_stock_transfer(v_transfer_id);

    v_status := 'completed';
  ELSIF p_action = 'reject' THEN
    v_status := 'rejected';
  ELSE
    v_status := 'cancelled';
  END IF;

  -- تحديث حالة جميع طلبات الحزمة
  UPDATE public.stock_transfer_requests
  SET status       = v_status,
      reviewed_by  = v_real_uid,
      review_notes = p_review_notes,
      updated_at   = now()
  WHERE batch_id = p_batch_id AND status = 'pending';
END;
$$;

