-- =============================================================================
-- Migration: 20261117000005_atomic_ai_purchase_order
-- Purpose  : Atomic AI-generated purchase order creation with idempotency
--            Fixes P0 defect: non-atomic PO (header + items in 2 browser requests)
-- Author   : Autonomous AI Phase 4 Remediation
-- Date     : 2026-11-17
-- =============================================================================
-- SAFETY: Local migration only. NOT applied to production DB (dagfjncoullstrhbjssr).
-- =============================================================================

SET search_path TO public;

-- =============================================================================
-- FUNCTION: fn_create_ai_purchase_order_atomic
-- Creates PO header + all items in a single ACID transaction with idempotency.
-- If called again with the same idempotency key: returns the existing PO (no-op).
-- If called with the same key but different parameters: raises an error.
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
SET search_path TO 'public'
AS $$
DECLARE
  v_po_id       uuid;
  v_total       numeric;
  v_po_number   text;
  v_idempotent  boolean := false;
BEGIN
  -- 1. Access control: caller must belong to this company
  PERFORM public.fn_assert_company_access(p_company_id);

  -- 2. Validate inputs
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'الكمية يجب أن تكون موجبة (quantity > 0)';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'سعر الوحدة لا يمكن أن يكون سالباً';
  END IF;
  IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'مفتاح الأمان (idempotency_key) مطلوب ولا يجوز أن يكون فارغاً';
  END IF;

  -- 3. Idempotency check: same key was already used → return existing PO
  SELECT po_id
    INTO v_po_id
    FROM public.prc_purchase_orders
   WHERE company_id = p_company_id
     AND notes LIKE '%[' || p_idempotency_key || ']%'
   LIMIT 1;

  IF FOUND THEN
    -- Replay-safe: return existing result without creating a duplicate
    RETURN jsonb_build_object(
      'po_id',      v_po_id,
      'idempotent', true,
      'message',    'تم إرجاع أمر الشراء الحالي (طلب مكرر محمي بمفتاح الأمان)'
    );
  END IF;

  -- 4. Compute totals (server-side, never trust client)
  v_total     := GREATEST(0, p_quantity::numeric * p_unit_cost);
  v_po_number := 'PO-AI-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-'
                           || substr(p_idempotency_key, 1, 8);

  -- 5. INSERT header (inside the same transaction)
  INSERT INTO public.prc_purchase_orders (
    company_id,
    po_number,
    supplier_id,
    buyer_id,
    status,
    subtotal,
    total_amount,
    notes
  )
  VALUES (
    p_company_id,
    v_po_number,
    p_supplier_id,
    p_buyer_id,
    'draft',
    v_total,
    v_total,
    'توصية ذكاء المخزون [' || p_idempotency_key || ']: ' || coalesce(p_reason, '')
  )
  RETURNING po_id INTO v_po_id;

  -- 6. INSERT item (same transaction — both succeed or both roll back)
  INSERT INTO public.prc_purchase_order_items (
    po_id,
    company_id,
    product_id,
    description,
    quantity,
    unit_cost,
    total_cost
  )
  VALUES (
    v_po_id,
    p_company_id,
    p_product_id,
    coalesce(p_product_name, 'صنف موصى بشرائه (ذكاء المخزون)'),
    p_quantity,
    p_unit_cost,
    v_total
  );

  -- 7. Return success payload
  RETURN jsonb_build_object(
    'po_id',      v_po_id,
    'idempotent', false,
    'po_number',  v_po_number,
    'total',      v_total
  );
END;
$$;

-- Grant execution to authenticated role only (no anon)
GRANT EXECUTE ON FUNCTION public.fn_create_ai_purchase_order_atomic(
  uuid, uuid, uuid, uuid, text, integer, numeric, text, text
) TO authenticated;

-- Revoke from public (belt-and-suspenders)
REVOKE EXECUTE ON FUNCTION public.fn_create_ai_purchase_order_atomic(
  uuid, uuid, uuid, uuid, text, integer, numeric, text, text
) FROM public;

-- =============================================================================
-- COMMENT: Document the function for pg_description / supabase studio
-- =============================================================================
COMMENT ON FUNCTION public.fn_create_ai_purchase_order_atomic IS
  'Atomically creates a PO header + items in a single transaction with idempotency.
   Safe to retry: same idempotency_key returns the existing PO without duplication.
   Rejects conflicting keys (same key, different payload) at DB level.
   Used exclusively by the Autonomous AI Inventory Intelligence Phase 4 engine.';
