-- ============================================================================
-- Migration: 20261121000006_wave2c_commit_sales_requisition.sql
-- Wave 2C: Deploy commit_sales_requisition RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.commit_sales_requisition(p_company_id uuid, p_user_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pr_id uuid;
  v_pr_number text;
  v_user_id uuid;
  v_title text;
  v_notes text;
  v_currency text;
  v_status text;
  v_idempotency_key text;
  v_existing_id uuid;
  v_existing_number text;
  v_raw_branch text;
  v_branch_id uuid;
  v_raw_supplier text;
  v_supplier_party_id uuid;
  v_required_date date;
  v_items jsonb;
  v_item jsonb;
  v_qty numeric;
  v_price numeric;
  v_uom text;
  v_desc text;
  v_item_total numeric;
  v_total numeric := 0;
  v_item_count integer := 0;
  v_before jsonb;
  v_existing_item_ids uuid[];
  v_idx integer := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id_required: company identifier is required';
  END IF;
  PERFORM public.fn_assert_company_access(p_company_id);

  v_user_id := COALESCE(auth.uid(), p_user_id);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required: authenticated user is required';
  END IF;

  v_items := COALESCE(p_data -> 'items', '[]'::jsonb);
  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'invalid_items: a requisition must contain at least one line';
  END IF;

  v_title := NULLIF(TRIM(COALESCE(p_data ->> 'title', '')), '');
  v_notes := NULLIF(TRIM(COALESCE(p_data ->> 'notes', '')), '');
  v_currency := COALESCE(NULLIF(TRIM(p_data ->> 'currency'), ''), 'SAR');
  v_status := COALESCE(NULLIF(TRIM(p_data ->> 'status'), ''), 'draft');
  IF v_status NOT IN ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'converted_to_rfq', 'converted_to_po', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_status: unsupported status %', v_status;
  END IF;

  BEGIN
    v_required_date := NULLIF(TRIM(COALESCE(p_data ->> 'needed_by', p_data ->> 'required_date')), '')::date;
  EXCEPTION WHEN OTHERS THEN
    v_required_date := NULL;
  END;

  v_raw_branch := TRIM(COALESCE(p_data ->> 'branch_id', ''));
  IF v_raw_branch ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_branch_id := v_raw_branch::uuid;
  ELSE
    v_branch_id := NULL;
  END IF;

  v_raw_supplier := TRIM(COALESCE(p_data ->> 'supplier_id', ''));
  IF v_raw_supplier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_supplier_party_id
      FROM public.parties
     WHERE id = v_raw_supplier::uuid AND company_id = p_company_id;
  ELSE
    v_supplier_party_id := NULL;
  END IF;

  v_idempotency_key := NULLIF(TRIM(COALESCE(p_data ->> 'idempotency_key', '')), '');
  IF v_idempotency_key IS NOT NULL THEN
    SELECT pr_id, pr_number INTO v_existing_id, v_existing_number
      FROM public.prc_purchase_requests
     WHERE company_id = p_company_id AND idempotency_key = v_idempotency_key
     LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'id', v_existing_id, 'pr_number', v_existing_number, 'is_duplicate', true);
    END IF;
  END IF;

  IF v_title IS NOT NULL THEN
    SELECT pr_id, pr_number INTO v_existing_id, v_existing_number
      FROM public.prc_purchase_requests
     WHERE company_id = p_company_id
       AND requester_id = v_user_id
       AND status = 'draft'
       AND title = v_title
       AND created_at >= now() - INTERVAL '15 seconds'
     ORDER BY created_at DESC
     LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'id', v_existing_id, 'pr_number', v_existing_number, 'is_duplicate', true);
    END IF;
  END IF;

  IF NULLIF(TRIM(COALESCE(p_data ->> 'pr_id', '')), '') IS NOT NULL THEN
    v_pr_id := (p_data ->> 'pr_id')::uuid;

    SELECT pr_number,
           jsonb_build_object('title', title, 'status', status, 'total_estimated_value', total_estimated_value)
      INTO v_pr_number, v_before
      FROM public.prc_purchase_requests
     WHERE pr_id = v_pr_id AND company_id = p_company_id;

    IF v_pr_number IS NULL THEN
      RAISE EXCEPTION 'requisition_not_found: no requisition with this id in this company';
    END IF;

    UPDATE public.prc_purchase_requests SET
      title             = v_title,
      notes             = v_notes,
      justification     = COALESCE(v_notes, justification),
      currency          = v_currency,
      status            = v_status,
      required_date     = v_required_date,
      branch_id         = v_branch_id,
      supplier_party_id = v_supplier_party_id,
      source            = 'sales_requisitions',
      idempotency_key   = COALESCE(v_idempotency_key, idempotency_key),
      sent_at           = CASE WHEN v_status <> 'draft' THEN COALESCE(sent_at, now()) ELSE sent_at END,
      updated_by        = v_user_id,
      updated_at        = now()
    WHERE pr_id = v_pr_id AND company_id = p_company_id;

    SELECT ARRAY_AGG(pr_item_id ORDER BY created_at ASC, pr_item_id ASC)
      INTO v_existing_item_ids
      FROM public.prc_purchase_request_items
     WHERE pr_id = v_pr_id AND company_id = p_company_id;
  ELSE
    v_pr_number := public.get_next_requisition_number(p_company_id);

    INSERT INTO public.prc_purchase_requests (
      company_id, pr_number, requester_id, title, notes, justification,
      status, priority, required_date, currency, branch_id, supplier_party_id,
      source, idempotency_key, updated_by
    ) VALUES (
      p_company_id, v_pr_number, v_user_id, v_title, v_notes, v_notes,
      v_status, 'normal', v_required_date, v_currency, v_branch_id, v_supplier_party_id,
      'sales_requisitions', v_idempotency_key, v_user_id
    ) RETURNING pr_id INTO v_pr_id;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_idx := v_idx + 1;
    v_qty := COALESCE(NULLIF(TRIM(COALESCE(v_item ->> 'quantity', '')), '')::numeric, 0);
    v_price := COALESCE(NULLIF(TRIM(COALESCE(v_item ->> 'unit_price', '')), '')::numeric, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_quantity: every line must have a quantity greater than zero';
    END IF;
    IF v_price < 0 THEN v_price := 0; END IF;

    v_uom := COALESCE(NULLIF(TRIM(COALESCE(v_item ->> 'uom', '')), ''), 'unit');
    v_desc := COALESCE(
                NULLIF(TRIM(COALESCE(v_item ->> 'description', '')), ''),
                NULLIF(TRIM(COALESCE(v_item ->> 'name', '')), ''),
                NULLIF(TRIM(COALESCE(v_item ->> 'part_number', '')), ''),
                'item'
              );
    v_item_total := ROUND(v_qty * v_price, 4);
    v_total := v_total + v_item_total;
    v_item_count := v_item_count + 1;

    IF v_existing_item_ids IS NOT NULL AND v_idx <= array_length(v_existing_item_ids, 1) THEN
      UPDATE public.prc_purchase_request_items SET
        product_id = CASE WHEN TRIM(COALESCE(v_item ->> 'product_id', '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                          THEN (v_item ->> 'product_id')::uuid ELSE NULL END,
        description = v_desc,
        quantity = v_qty,
        unit_of_measure = v_uom,
        estimated_unit_price = v_price,
        total_estimated_price = v_item_total,
        updated_at = now()
      WHERE pr_item_id = v_existing_item_ids[v_idx];
    ELSE
      INSERT INTO public.prc_purchase_request_items (
        company_id, pr_id, product_id, description, quantity,
        unit_of_measure, estimated_unit_price, total_estimated_price
      ) VALUES (
        p_company_id,
        v_pr_id,
        CASE WHEN TRIM(COALESCE(v_item ->> 'product_id', '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN (v_item ->> 'product_id')::uuid ELSE NULL END,
        v_desc, v_qty, v_uom, v_price, v_item_total
      );
    END IF;
  END LOOP;

  UPDATE public.prc_purchase_requests
     SET total_estimated_value = v_total
   WHERE pr_id = v_pr_id AND company_id = p_company_id;

  BEGIN
    PERFORM public.audit_write(
      CASE WHEN v_before IS NULL THEN 'requisition_created' ELSE 'requisition_updated' END,
      'prc_purchase_requests',
      v_pr_id,
      p_company_id,
      jsonb_build_object(
        'pr_number', v_pr_number,
        'title', v_title,
        'status', v_status,
        'items_count', v_item_count,
        'total_estimated_value', v_total,
        'supplier_party_id', v_supplier_party_id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.procurement_audit_logs (
      company_id, actor_id, entity_type, entity_id, action, before_state, after_state, metadata
    ) VALUES (
      p_company_id, v_user_id, 'purchase_request', v_pr_id,
      CASE WHEN v_before IS NULL THEN 'create' ELSE 'update' END,
      v_before,
      jsonb_build_object('title', v_title, 'status', v_status, 'total_estimated_value', v_total, 'items_count', v_item_count),
      jsonb_build_object('source', 'sales_requisitions', 'pr_number', v_pr_number)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_pr_id,
    'pr_number', v_pr_number,
    'status', v_status,
    'items_count', v_item_count,
    'total_estimated_value', v_total,
    'is_duplicate', false
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.commit_sales_requisition(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.commit_sales_requisition(uuid, uuid, jsonb) TO authenticated, service_role;
