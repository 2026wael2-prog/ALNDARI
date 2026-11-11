-- ============================================================
-- Migration: 20261108223000_unify_item_movements_with_invoices.sql
-- Description: توحيد سجل حركات الصنف بين حركات المخزون وفواتير المبيعات/المشتريات
-- مع حساب الرصيد التراكمي في الوقت الفعلي مطابقاً لمخزون المستودعات الحقيقي.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_item_movements_with_balance(
  p_company_id uuid,
  p_product_id uuid
)
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
  balance_after numeric
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
    -- 1. حركات المخزون المباشرة (تسويات جردية، مناقلات، أو قيود يدوية)
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
      COALESCE(m.quantity, 0)::numeric AS raw_qty
    FROM public.inventory_transactions m
    LEFT JOIN auth.users u ON m.created_by = u.id
    LEFT JOIN public.invoices i ON m.reference_id = i.id
    LEFT JOIN public.parties p ON i.party_id = p.id
    LEFT JOIN public.stock_transfers t ON m.reference_id = t.id
    LEFT JOIN public.warehouses wf ON t.from_warehouse_id = wf.id
    LEFT JOIN public.warehouses wt ON t.to_warehouse_id = wt.id
    WHERE m.product_id = p_product_id 
      AND m.company_id = p_company_id 
      AND m.deleted_at IS NULL

    UNION ALL

    -- 2. حركات فواتير البيع والشراء والمردودات المسجلة في بنود الفواتير
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
      END::numeric AS raw_qty
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
      END AS balance_after
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
    wb.balance_after
  FROM with_balance wb
  ORDER BY wb.date DESC, wb.id DESC
  LIMIT 500;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_item_movements_with_balance(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_item_movements_with_balance(uuid, uuid) FROM PUBLIC, anon;

