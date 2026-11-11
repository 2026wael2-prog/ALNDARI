-- Migration: 20261109020000_get_inventory_movements_feed.sql
-- Description: Unified inventory movements feed RPC combining invoices, adjustments, audits and transfers

CREATE OR REPLACE FUNCTION public.get_inventory_movements_feed(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_movement_type text DEFAULT 'all',
  p_doc_type text DEFAULT 'all',
  p_product_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  date timestamptz,
  doc_type text,
  doc_number text,
  reference_id uuid,
  product_id uuid,
  product_name text,
  product_sku text,
  product_part_number text,
  product_brand text,
  party_name text,
  movement_type text,
  quantity numeric,
  unit_cost numeric,
  unit_price numeric,
  user_name text,
  notes text,
  current_stock numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_search text := NULLIF(TRIM(p_search), '');
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  RETURN QUERY
  WITH all_movements AS (
    -- 1. Invoices (Sales, Purchases, Returns)
    SELECT
      ii.id,
      COALESCE(inv.created_at, inv.issue_date::timestamptz) AS date,
      inv.type::text AS doc_type,
      inv.invoice_number::text AS doc_number,
      inv.id AS reference_id,
      ii.product_id,
      prod.name_ar::text AS product_name,
      prod.sku::text AS product_sku,
      prod.part_number::text AS product_part_number,
      prod.brand::text AS product_brand,
      COALESCE(p.name, '---')::text AS party_name,
      CASE WHEN inv.type IN ('purchase', 'sale_return') THEN 'in'::text ELSE 'out'::text END AS movement_type,
      ABS(COALESCE(ii.quantity, 0))::numeric AS quantity,
      COALESCE(ii.cost_price, 0)::numeric AS unit_cost,
      COALESCE(ii.unit_price, 0)::numeric AS unit_price,
      COALESCE(u.email, 'النظام')::text AS user_name,
      COALESCE(inv.notes, '')::text AS notes,
      inv.company_id,
      inv.branch_id
    FROM public.invoice_items ii
    JOIN public.invoices inv ON ii.invoice_id = inv.id
    JOIN public.products prod ON ii.product_id = prod.id
    LEFT JOIN public.parties p ON inv.party_id = p.id
    LEFT JOIN auth.users u ON inv.created_by = u.id
    WHERE inv.company_id = p_company_id
      AND inv.status != 'void'
      AND inv.deleted_at IS NULL
      AND (p_product_id IS NULL OR ii.product_id = p_product_id)
      AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
      AND (p_start_date IS NULL OR inv.issue_date >= p_start_date)
      AND (p_end_date IS NULL OR inv.issue_date <= p_end_date)
      AND (p_doc_type = 'all' OR inv.type = p_doc_type)

    UNION ALL

    -- 2. Inventory Transactions (Adjustments, Audits)
    SELECT
      it.id,
      it.created_at AS date,
      it.transaction_type::text AS doc_type,
      CASE 
        WHEN it.reference_type = 'stock_audit' THEN 'جرد مخزني'
        ELSE 'تسوية مخزنية'
      END::text AS doc_number,
      COALESCE(it.reference_id, it.id) AS reference_id,
      it.product_id,
      prod.name_ar::text AS product_name,
      prod.sku::text AS product_sku,
      prod.part_number::text AS product_part_number,
      prod.brand::text AS product_brand,
      'تسوية داخلية'::text AS party_name,
      CASE 
        WHEN it.transaction_type IN ('purchase', 'sales_return', 'adj_in', 'transfer_in', 'initial') THEN 'in'::text
        WHEN it.transaction_type IN ('sales', 'purchase_return', 'adj_out', 'transfer_out') THEN 'out'::text
        ELSE CASE WHEN COALESCE(it.quantity, 0) >= 0 THEN 'in'::text ELSE 'out'::text END
      END AS movement_type,
      ABS(COALESCE(it.quantity, 0))::numeric AS quantity,
      COALESCE(it.unit_cost, 0)::numeric AS unit_cost,
      0::numeric AS unit_price,
      COALESCE(u.email, 'النظام')::text AS user_name,
      ''::text AS notes,
      it.company_id,
      w.branch_id
    FROM public.inventory_transactions it
    JOIN public.products prod ON it.product_id = prod.id
    LEFT JOIN public.warehouses w ON it.warehouse_id = w.id
    LEFT JOIN auth.users u ON it.created_by = u.id
    WHERE it.company_id = p_company_id
      AND it.deleted_at IS NULL
      AND (it.reference_type IS NULL OR it.reference_type NOT IN ('invoice', 'sales_invoice', 'purchase_invoice'))
      AND (p_product_id IS NULL OR it.product_id = p_product_id)
      AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
      AND (p_start_date IS NULL OR it.created_at::date >= p_start_date)
      AND (p_end_date IS NULL OR it.created_at::date <= p_end_date)
      AND (p_doc_type = 'all' OR it.transaction_type = p_doc_type)

    UNION ALL

    -- 3. Stock Transfers between Warehouses
    SELECT
      sti.id,
      st.created_at AS date,
      'transfer'::text AS doc_type,
      'مناقلة #' || SUBSTRING(st.id::text, 1, 8) AS doc_number,
      st.id AS reference_id,
      sti.product_id,
      prod.name_ar::text AS product_name,
      prod.sku::text AS product_sku,
      prod.part_number::text AS product_part_number,
      prod.brand::text AS product_brand,
      (wf.name_ar || ' ◄ ' || wt.name_ar)::text AS party_name,
      'transfer'::text AS movement_type,
      ABS(COALESCE(sti.quantity, 0))::numeric AS quantity,
      0::numeric AS unit_cost,
      0::numeric AS unit_price,
      COALESCE(u.email, 'النظام')::text AS user_name,
      COALESCE(st.notes, '')::text AS notes,
      st.company_id,
      wf.branch_id
    FROM public.stock_transfer_items sti
    JOIN public.stock_transfers st ON sti.transfer_id = st.id
    JOIN public.products prod ON sti.product_id = prod.id
    LEFT JOIN public.warehouses wf ON st.from_warehouse_id = wf.id
    LEFT JOIN public.warehouses wt ON st.to_warehouse_id = wt.id
    LEFT JOIN auth.users u ON st.created_by = u.id
    WHERE st.company_id = p_company_id
      AND st.status != 'cancelled'
      AND (p_product_id IS NULL OR sti.product_id = p_product_id)
      AND (p_branch_id IS NULL OR wf.branch_id = p_branch_id OR wt.branch_id = p_branch_id)
      AND (p_start_date IS NULL OR st.created_at::date >= p_start_date)
      AND (p_end_date IS NULL OR st.created_at::date <= p_end_date)
      AND (p_doc_type = 'all' OR p_doc_type = 'transfer')
  ),
  filtered_movements AS (
    SELECT m.*
    FROM all_movements m
    WHERE (
      p_movement_type = 'all' 
      OR m.movement_type = p_movement_type
      OR (p_movement_type = 'out' AND m.movement_type = 'transfer')
    )
    AND (
      v_search IS NULL
      OR m.doc_number ILIKE '%' || v_search || '%'
      OR m.product_name ILIKE '%' || v_search || '%'
      OR m.product_sku ILIKE '%' || v_search || '%'
      OR m.product_part_number ILIKE '%' || v_search || '%'
      OR m.party_name ILIKE '%' || v_search || '%'
    )
  )
  SELECT
    fm.id,
    fm.date,
    fm.doc_type,
    fm.doc_number,
    fm.reference_id,
    fm.product_id,
    fm.product_name,
    fm.product_sku,
    fm.product_part_number,
    fm.product_brand,
    fm.party_name,
    fm.movement_type,
    fm.quantity,
    fm.unit_cost,
    fm.unit_price,
    fm.user_name,
    fm.notes,
    COALESCE(ps.total_qty, 0)::numeric AS current_stock
  FROM filtered_movements fm
  LEFT JOIN (
    SELECT ps_sub.product_id AS p_id, SUM(ps_sub.quantity) AS total_qty
    FROM public.product_stock ps_sub
    WHERE ps_sub.company_id = p_company_id
    GROUP BY ps_sub.product_id
  ) ps ON fm.product_id = ps.p_id
  ORDER BY fm.date DESC, fm.id DESC
  LIMIT LEAST(p_limit, 500)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

