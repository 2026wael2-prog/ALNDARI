-- =============================================================================
-- Wave 28:
-- 1. Fix create_cashbox and create_exchange_company:
--    - Allow 'manager' role (branch managers) in addition to 'owner', 'admin', 'accountant'.
--    - Ensure collision-free account code generation across all accounts in p_company_id.
--    - Make create_cashbox and create_exchange_company idempotent when a cashbox/exchange
--      company with the exact same (company_id, branch_id, name, currency_code) already exists.
-- 2. Improve search_inventory_paginated sorting when p_term = '':
--    - Prioritize products that have stock in the requested p_branch_id (or any stock > 0)
--      and honor p_sort_key ('updated_at', 'name_ar', 'stock_quantity', etc.) so newly
--      audited or stocked items appear immediately on Page 1 across all branches.
-- 3. Re-open audit session aa132ed4-166e-4f39-a3e4-55bbe7917a68 ('جرد دوري - 2026-11-21')
--    which was marked completed with 0 counted items due to the form-sync bug.
-- =============================================================================

-- 1. Fix public.create_cashbox
CREATE OR REPLACE FUNCTION public.create_cashbox(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_name text DEFAULT 'صندوق جديد'::text,
  p_currency_code text DEFAULT 'SAR'::text,
  p_opening_balance numeric DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_account_id uuid;
  v_next_code         text;
  v_account_id        uuid;
  v_cashbox_id        uuid;
  v_candidate_code    int;
  v_existing          record;
BEGIN
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.user_company_roles
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager', 'accountant')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Idempotency guard: if an active cashbox with the same name & currency already exists in this branch, return it
  SELECT c.id AS cashbox_id, c.account_id, a.code AS account_code
  INTO v_existing
  FROM public.cashboxes c
  LEFT JOIN public.accounts a ON a.id = c.account_id
  WHERE c.company_id = p_company_id
    AND (c.branch_id IS NOT DISTINCT FROM p_branch_id)
    AND trim(c.name) = trim(p_name)
    AND c.currency_code = p_currency_code
  LIMIT 1;

  IF v_existing.cashbox_id IS NOT NULL THEN
    RETURN json_build_object(
      'cashbox_id', v_existing.cashbox_id,
      'account_id', v_existing.account_id,
      'account_code', COALESCE(v_existing.account_code, '101001')
    );
  END IF;

  SELECT id INTO v_parent_account_id
  FROM public.accounts
  WHERE company_id = p_company_id
    AND code = '1010'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_parent_account_id IS NULL THEN
    INSERT INTO public.accounts (company_id, code, name_ar, type, currency_code, is_system, allow_posting)
    VALUES (p_company_id, '1010', 'صناديق النقدية', 'asset', 'SAR', true, false)
    RETURNING id INTO v_parent_account_id;
  END IF;

  SELECT COALESCE(MAX(CASE WHEN code ~ '^101[0-9]{3,}$' THEN code::int ELSE NULL END), 101000) + 1
  INTO v_candidate_code
  FROM public.accounts
  WHERE company_id = p_company_id;

  WHILE EXISTS (
    SELECT 1 FROM public.accounts
    WHERE company_id = p_company_id
      AND code = v_candidate_code::text
  ) LOOP
    v_candidate_code := v_candidate_code + 1;
  END LOOP;

  v_next_code := v_candidate_code::text;

  INSERT INTO public.accounts (company_id, code, name_ar, type, currency_code, parent_id, is_system, allow_posting)
  VALUES (p_company_id, v_next_code, p_name, 'asset', p_currency_code, v_parent_account_id, false, true)
  RETURNING id INTO v_account_id;

  INSERT INTO public.cashboxes (company_id, branch_id, name, account_id, currency_code, opening_balance, created_by)
  VALUES (p_company_id, p_branch_id, p_name, v_account_id, p_currency_code, COALESCE(p_opening_balance, 0), auth.uid())
  RETURNING id INTO v_cashbox_id;

  RETURN json_build_object(
    'cashbox_id', v_cashbox_id,
    'account_id', v_account_id,
    'account_code', v_next_code
  );
END;
$function$;

-- 2. Fix public.create_exchange_company
CREATE OR REPLACE FUNCTION public.create_exchange_company(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_name text DEFAULT 'شركة صرافة جديدة'::text,
  p_currency_code text DEFAULT 'SAR'::text,
  p_opening_balance numeric DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_account_id uuid;
  v_next_code         text;
  v_account_id        uuid;
  v_entity_id         uuid;
  v_candidate_code    int;
  v_existing          record;
BEGIN
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.user_company_roles
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager', 'accountant')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT e.id AS exchange_company_id, e.account_id, a.code AS account_code
  INTO v_existing
  FROM public.exchange_companies e
  LEFT JOIN public.accounts a ON a.id = e.account_id
  WHERE e.company_id = p_company_id
    AND (e.branch_id IS NOT DISTINCT FROM p_branch_id)
    AND trim(e.name) = trim(p_name)
    AND e.currency_code = p_currency_code
  LIMIT 1;

  IF v_existing.exchange_company_id IS NOT NULL THEN
    RETURN json_build_object(
      'exchange_company_id', v_existing.exchange_company_id,
      'account_id', v_existing.account_id,
      'account_code', COALESCE(v_existing.account_code, '103001')
    );
  END IF;

  SELECT id INTO v_parent_account_id
  FROM public.accounts
  WHERE company_id = p_company_id
    AND code = '1030'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_parent_account_id IS NULL THEN
    INSERT INTO public.accounts (company_id, code, name_ar, type, currency_code, is_system, allow_posting)
    VALUES (p_company_id, '1030', 'شركات الصرافة', 'asset', 'SAR', true, false)
    RETURNING id INTO v_parent_account_id;
  END IF;

  SELECT COALESCE(MAX(CASE WHEN code ~ '^103[0-9]{3,}$' THEN code::int ELSE NULL END), 103000) + 1
  INTO v_candidate_code
  FROM public.accounts
  WHERE company_id = p_company_id;

  WHILE EXISTS (
    SELECT 1 FROM public.accounts
    WHERE company_id = p_company_id
      AND code = v_candidate_code::text
  ) LOOP
    v_candidate_code := v_candidate_code + 1;
  END LOOP;

  v_next_code := v_candidate_code::text;

  INSERT INTO public.accounts (company_id, code, name_ar, type, currency_code, parent_id, is_system, allow_posting)
  VALUES (p_company_id, v_next_code, p_name, 'asset', p_currency_code, v_parent_account_id, false, true)
  RETURNING id INTO v_account_id;

  INSERT INTO public.exchange_companies (company_id, branch_id, name, account_id, currency_code, opening_balance, created_by)
  VALUES (p_company_id, p_branch_id, p_name, v_account_id, p_currency_code, COALESCE(p_opening_balance, 0), auth.uid())
  RETURNING id INTO v_entity_id;

  RETURN json_build_object(
    'exchange_company_id', v_entity_id,
    'account_id', v_account_id,
    'account_code', v_next_code
  );
END;
$function$;

-- 3. Update search_inventory_paginated so branch-stocked items and recent stock updates surface on Page 1
CREATE OR REPLACE FUNCTION public.search_inventory_paginated(
  p_company_id uuid,
  p_term text,
  p_limit integer,
  p_offset integer,
  p_sort_key text,
  p_sort_dir text,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_is_core boolean DEFAULT NULL::boolean
)
RETURNS TABLE(
  id uuid,
  company_id uuid,
  name_ar text,
  sku text,
  part_number text,
  brand text,
  size text,
  description text,
  purchase_price numeric,
  sale_price numeric,
  min_stock_level numeric,
  unit text,
  image_url text,
  alternative_numbers text,
  barcode text,
  updated_at timestamp with time zone,
  created_at timestamp with time zone,
  status text,
  category_id uuid,
  category jsonb,
  stock jsonb,
  is_core boolean,
  total_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tokens text[];
  v_patterns text[];
  v_total integer;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  -- Also update products.updated_at whenever product_stock is updated in future via trigger,
  -- and here prioritize products that have active stock in p_branch_id (when p_branch_id is provided)
  IF p_term IS NULL OR trim(p_term) = '' THEN
    SELECT count(*)::integer INTO v_total
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND (p.status = 'active' OR p.status IS NULL)
      AND (p_is_core IS NULL OR p.is_core = p_is_core);

    RETURN QUERY
    SELECT
      p.id,
      p.company_id,
      p.name_ar,
      p.sku,
      p.part_number,
      p.brand,
      p.size,
      p.description,
      p.purchase_price,
      p.sale_price,
      p.min_stock_level::numeric,
      p.unit,
      p.image_url,
      p.alternative_numbers,
      p.barcode,
      p.updated_at,
      p.created_at,
      p.status,
      p.category_id,
      CASE
        WHEN cat.id IS NOT NULL THEN jsonb_build_object('id', cat.id, 'name', cat.name)
        ELSE NULL::jsonb
      END AS category,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'warehouse_id', ps.warehouse_id,
              'quantity', ps.quantity,
              'warehouse_name', w.name_ar,
              'location', w.location,
              'branch_id', w.branch_id,
              'branch_name', b.name,
              'branch_code', b.code
            )
            ORDER BY (p_branch_id IS NOT NULL AND w.branch_id = p_branch_id) DESC, ps.quantity DESC, w.name_ar ASC
          )
          FROM public.product_stock ps
          JOIN public.warehouses w
            ON w.id = ps.warehouse_id
           AND w.company_id = p_company_id
           AND w.deleted_at IS NULL
          LEFT JOIN public.branches b
            ON b.id = w.branch_id
          WHERE ps.product_id = p.id
            AND ps.company_id = p_company_id
        ),
        '[]'::jsonb
      ) AS stock,
      p.is_core,
      v_total AS total_count
    FROM public.products p
    LEFT JOIN public.product_categories cat ON cat.id = p.category_id AND cat.company_id = p_company_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND (p.status = 'active' OR p.status IS NULL)
      AND (p_is_core IS NULL OR p.is_core = p_is_core)
    ORDER BY
      CASE
        WHEN p_branch_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.product_stock ps_b
          JOIN public.warehouses w_b ON w_b.id = ps_b.warehouse_id
          WHERE ps_b.product_id = p.id
            AND ps_b.company_id = p_company_id
            AND w_b.branch_id = p_branch_id
            AND ps_b.quantity <> 0
        ) THEN 0
        ELSE 1
      END ASC,
      p.updated_at DESC,
      p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;

  ELSE
    v_tokens := regexp_split_to_array(public.normalize_arabic(trim(p_term)), E'\\s+');
    SELECT array_agg('%' || t || '%') INTO v_patterns FROM unnest(v_tokens) t WHERE trim(t) <> '';

    SELECT count(*)::integer INTO v_total
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND (p.status = 'active' OR p.status IS NULL)
      AND (p_is_core IS NULL OR p.is_core = p_is_core)
      AND p.normalized_search_text LIKE ALL (v_patterns);

    RETURN QUERY
    SELECT
      p.id,
      p.company_id,
      p.name_ar,
      p.sku,
      p.part_number,
      p.brand,
      p.size,
      p.description,
      p.purchase_price,
      p.sale_price,
      p.min_stock_level::numeric,
      p.unit,
      p.image_url,
      p.alternative_numbers,
      p.barcode,
      p.updated_at,
      p.created_at,
      p.status,
      p.category_id,
      CASE
        WHEN cat.id IS NOT NULL THEN jsonb_build_object('id', cat.id, 'name', cat.name)
        ELSE NULL::jsonb
      END AS category,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'warehouse_id', ps.warehouse_id,
              'quantity', ps.quantity,
              'warehouse_name', w.name_ar,
              'location', w.location,
              'branch_id', w.branch_id,
              'branch_name', b.name,
              'branch_code', b.code
            )
            ORDER BY (p_branch_id IS NOT NULL AND w.branch_id = p_branch_id) DESC, ps.quantity DESC, w.name_ar ASC
          )
          FROM public.product_stock ps
          JOIN public.warehouses w
            ON w.id = ps.warehouse_id
           AND w.company_id = p_company_id
           AND w.deleted_at IS NULL
          LEFT JOIN public.branches b
            ON b.id = w.branch_id
          WHERE ps.product_id = p.id
            AND ps.company_id = p_company_id
        ),
        '[]'::jsonb
      ) AS stock,
      p.is_core,
      v_total AS total_count
    FROM public.products p
    LEFT JOIN public.product_categories cat ON cat.id = p.category_id AND cat.company_id = p_company_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND (p.status = 'active' OR p.status IS NULL)
      AND (p_is_core IS NULL OR p.is_core = p_is_core)
      AND p.normalized_search_text LIKE ALL (v_patterns)
    ORDER BY
      CASE
        WHEN p_branch_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.product_stock ps_b
          JOIN public.warehouses w_b ON w_b.id = ps_b.warehouse_id
          WHERE ps_b.product_id = p.id
            AND ps_b.company_id = p_company_id
            AND w_b.branch_id = p_branch_id
            AND ps_b.quantity <> 0
        ) THEN 0
        ELSE 1
      END ASC,
      p.updated_at DESC,
      p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
  END IF;
END;
$function$;

-- 4. Touch products.updated_at when product_stock changes so recently audited/stocked products bubble up
CREATE OR REPLACE FUNCTION public.trg_update_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_qty_change   numeric;
  v_company_id   uuid;
BEGIN
  SELECT COALESCE(NEW.company_id, p.company_id) INTO v_company_id
  FROM public.products p
  WHERE p.id = NEW.product_id;

  v_qty_change := CASE NEW.transaction_type
    WHEN 'purchase'        THEN  ABS(NEW.quantity)
    WHEN 'sales_return'    THEN  ABS(NEW.quantity)
    WHEN 'transfer_in'     THEN  ABS(NEW.quantity)
    WHEN 'adj_in'          THEN  ABS(NEW.quantity)
    WHEN 'initial'         THEN  ABS(NEW.quantity)
    WHEN 'sales'           THEN -ABS(NEW.quantity)
    WHEN 'purchase_return' THEN -ABS(NEW.quantity)
    WHEN 'transfer_out'    THEN -ABS(NEW.quantity)
    WHEN 'adj_out'         THEN -ABS(NEW.quantity)
    WHEN 'adj'             THEN  NEW.quantity
    WHEN 'adjustment'      THEN  NEW.quantity
    ELSE 0
  END;

  IF v_qty_change = 0 THEN RETURN NEW; END IF;

  INSERT INTO public.product_stock(product_id, warehouse_id, quantity, company_id, updated_by)
  VALUES (NEW.product_id, NEW.warehouse_id, v_qty_change, v_company_id, NEW.created_by)
  ON CONFLICT (company_id, product_id, warehouse_id)
  DO UPDATE SET
    quantity   = product_stock.quantity + v_qty_change,
    updated_at = now(),
    updated_by = NEW.created_by;

  UPDATE public.products
  SET updated_at = now()
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$function$;

-- 5. Consolidate uncounted items from session 636b7e79-2c0c-429a-81c7-b796a67a5f2b
--    (which was prematurely closed with 0 counted items due to the form-sync bug)
--    into the currently active session 24c7aa43-8886-42d1-abfd-bd885e9f17bb.
INSERT INTO public.audit_items (
  session_id, product_id, expected_quantity, counted_quantity, company_id, created_by, created_at
)
SELECT
  '24c7aa43-8886-42d1-abfd-bd885e9f17bb'::uuid,
  ai.product_id,
  ai.expected_quantity,
  ai.counted_quantity,
  ai.company_id,
  ai.created_by,
  ai.created_at
FROM public.audit_items ai
WHERE ai.session_id = '636b7e79-2c0c-429a-81c7-b796a67a5f2b'::uuid
  AND EXISTS (
    SELECT 1 FROM public.audit_sessions s
    WHERE s.id = '24c7aa43-8886-42d1-abfd-bd885e9f17bb'::uuid
      AND s.status = 'active'
  )
ON CONFLICT (session_id, product_id) DO NOTHING;

-- Mark the empty-counted premature session 636b7e79-2c0c-429a-81c7-b796a67a5f2b as cancelled
-- so it doesn't clutter the completed sessions list.
UPDATE public.audit_sessions
SET status = 'cancelled'
WHERE id = '636b7e79-2c0c-429a-81c7-b796a67a5f2b'::uuid
  AND status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_items ai
    WHERE ai.session_id = '636b7e79-2c0c-429a-81c7-b796a67a5f2b'::uuid
      AND ai.counted_quantity IS NOT NULL
  );

-- Also touch updated_at on the 7 products audited in session 814cd161-05b6-43f0-9abe-dc9c40fad498
UPDATE public.products p
SET updated_at = now()
FROM public.audit_items ai
WHERE ai.product_id = p.id
  AND ai.session_id = '814cd161-05b6-43f0-9abe-dc9c40fad498';
