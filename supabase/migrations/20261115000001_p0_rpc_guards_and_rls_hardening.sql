-- ==============================================================================
-- P0: RPC Input/Idempotency/COGS Guards & Accounting/Inventory RLS Hardening
-- Note: Preserves authorized editing of sales invoices, purchase invoices, and bonds
-- while enforcing non-negative bounds, server-side COGS, atomic idempotency locks,
-- and locking direct writes to journal_entries, journal_entry_lines, accounts, product_stock.
-- ==============================================================================

-- 1. Harden commit_sales_invoice_v2
CREATE OR REPLACE FUNCTION public.commit_sales_invoice_v2(
  p_party_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_items jsonb,
  p_payment_type text DEFAULT 'cash'::text,
  p_notes text DEFAULT NULL::text,
  p_currency_code text DEFAULT 'SAR'::text,
  p_exchange_rate numeric DEFAULT 1,
  p_idempotency_key text DEFAULT NULL::text,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_payment_account_id uuid DEFAULT NULL::uuid,
  p_paid_amount numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_item record;
  v_db_price numeric;
  v_item_cost numeric := 0;
  v_line_total numeric;
  v_total_amount numeric := 0;
  v_total_tax numeric := 0;
  v_warehouse_id uuid;
  v_stock_record record;
  v_is_cash boolean;
  v_effective_rate numeric := COALESCE(p_exchange_rate, 1);
  v_effective_currency text := UPPER(TRIM(COALESCE(p_currency_code, 'SAR')));
  v_effective_payment_account uuid := p_payment_account_id;
  v_branch_name text;
  v_lookup_rate numeric;
  v_actual_paid numeric := 0;
  v_final_status text;
BEGIN
  -- 1. Authentication & Tenant/Branch Access
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_company_id FROM public.user_profiles WHERE id = v_user_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User not associated with any company' USING ERRCODE = '42501';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_can_access_branch(v_company_id, p_branch_id) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية إصدار فاتورة على هذا الفرع' USING ERRCODE = '42501';
  END IF;

  -- 2. Atomic Idempotency Lock & Check
  IF p_idempotency_key IS NOT NULL AND NULLIF(TRIM(p_idempotency_key), '') IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('sales_invoice:' || v_company_id::text || ':' || p_idempotency_key));
    SELECT id INTO v_invoice_id
    FROM public.invoices
    WHERE company_id = v_company_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_invoice_id;
    END IF;
  END IF;

  -- 3. Items validation
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Invoice must have at least one item';
  END IF;

  -- 4. Currency and Exchange Rate Sanity Guard
  IF v_effective_currency = 'YER' THEN
    IF v_effective_rate <= 1 THEN
      SELECT rate_to_base INTO v_lookup_rate
      FROM public.exchange_rates
      WHERE company_id = v_company_id AND currency_code = 'YER'
      ORDER BY effective_date DESC LIMIT 1;
      v_effective_rate := COALESCE(v_lookup_rate, 410);
    END IF;
  ELSIF v_effective_currency = 'SAR' THEN
    v_effective_rate := 1;
  ELSIF COALESCE(v_effective_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'سعر الصرف يجب أن يكون أكبر من صفر';
  END IF;

  -- 5. Branch-Aware Warehouse Selection (Prefer Branch Primary Warehouse)
  IF p_branch_id IS NOT NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
    WHERE company_id = v_company_id AND branch_id = p_branch_id AND is_primary = true AND deleted_at IS NULL
    LIMIT 1;

    IF v_warehouse_id IS NULL THEN
      SELECT id INTO v_warehouse_id FROM public.warehouses
      WHERE company_id = v_company_id AND branch_id = p_branch_id AND deleted_at IS NULL
      LIMIT 1;
    END IF;
  END IF;

  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
    WHERE company_id = v_company_id AND is_primary = true AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
    WHERE company_id = v_company_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- 6. Branch & Currency Matching Cashbox Auto-Resolution
  IF v_effective_payment_account IS NULL AND COALESCE(p_payment_type, 'cash') <> 'credit' THEN
    IF p_branch_id IS NOT NULL THEN
      SELECT a.id INTO v_effective_payment_account
      FROM public.accounts a
      WHERE a.company_id = v_company_id
        AND a.branch_id = p_branch_id
        AND (a.currency_code = v_effective_currency OR a.currency_code IS NULL)
        AND a.allow_posting = true AND a.deleted_at IS NULL
        AND (a.code LIKE '101%' OR a.type = 'asset')
      ORDER BY CASE WHEN a.currency_code = v_effective_currency THEN 0 ELSE 1 END, a.code ASC
      LIMIT 1;
    END IF;

    IF v_effective_payment_account IS NULL THEN
      v_effective_payment_account := public.fn_get_default_cash_account(v_company_id, v_effective_currency);
    END IF;
  END IF;

  -- 7. Lock and Validate Stock + Non-Negative Price/Tax Guards
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric, warehouse_id uuid)
  LOOP
    IF COALESCE(v_item.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'Quantity must be greater than zero for product %', v_item.product_id;
    END IF;

    IF v_item.unit_price IS NULL OR v_item.unit_price < 0 THEN
      RAISE EXCEPTION 'سعر الوحدة لا يمكن أن يكون سالباً للصنف %', v_item.product_id;
    END IF;

    IF COALESCE(v_item.tax_rate, 0) < 0 OR COALESCE(v_item.tax_rate, 0) > 100 THEN
      RAISE EXCEPTION 'نسبة الضريبة غير صالحة (%) للصنف %', v_item.tax_rate, v_item.product_id;
    END IF;

    SELECT sale_price INTO v_db_price
    FROM public.products
    WHERE id = v_item.product_id AND company_id = v_company_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found in company', v_item.product_id;
    END IF;

    SELECT * INTO v_stock_record
    FROM public.product_stock
    WHERE product_id = v_item.product_id
      AND warehouse_id = COALESCE(v_item.warehouse_id, v_warehouse_id)
      AND company_id = v_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.product_stock (company_id, product_id, warehouse_id, quantity)
      VALUES (v_company_id, v_item.product_id, COALESCE(v_item.warehouse_id, v_warehouse_id), 0)
      ON CONFLICT (product_id, warehouse_id) DO NOTHING;
    END IF;

    v_line_total := v_item.quantity * v_item.unit_price;
    v_total_amount := v_total_amount + v_line_total;
    v_total_tax := v_total_tax + COALESCE(v_line_total * COALESCE(v_item.tax_rate, 0) / 100, 0);
  END LOOP;

  -- 8. Validate Cashbox Balance for Cash Sales (if required) - Non-blocking warning if asset
  IF v_effective_payment_account IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = v_effective_payment_account AND company_id = v_company_id AND deleted_at IS NULL
    ) THEN
      SELECT name INTO v_branch_name FROM public.branches WHERE id = p_branch_id;
      RAISE EXCEPTION 'Invalid payment account % for branch %', v_effective_payment_account, COALESCE(v_branch_name, 'default');
    END IF;
  END IF;

  -- 9. Generate Invoice Number with branch scoping
  v_invoice_number := public.generate_invoice_number(v_company_id, 'sale', p_branch_id);

  v_is_cash := COALESCE(p_payment_type, 'cash') <> 'credit';
  IF v_is_cash THEN
    v_actual_paid := v_total_amount + v_total_tax;
  ELSE
    v_actual_paid := LEAST(GREATEST(0, COALESCE(p_paid_amount, 0)), v_total_amount + v_total_tax);
  END IF;

  v_final_status := CASE
    WHEN v_is_cash OR v_actual_paid >= (v_total_amount + v_total_tax) THEN 'paid'
    WHEN v_actual_paid > 0 THEN 'partially_paid'
    ELSE 'posted'
  END;

  -- 10. Insert Invoice Header as 'draft' first so items & cost_price exist before journal posting
  INSERT INTO public.invoices (
    company_id, invoice_number, party_id, issue_date, due_date,
    total_amount, tax_amount, payment_method, payment_account_id,
    status, notes, type, created_by, currency_code, exchange_rate,
    idempotency_key, branch_id, paid_amount, advance_payment
  ) VALUES (
    v_company_id, v_invoice_number, p_party_id, p_invoice_date, p_due_date,
    v_total_amount + v_total_tax, v_total_tax, p_payment_type, v_effective_payment_account,
    'draft', p_notes, 'sale', v_user_id, v_effective_currency, v_effective_rate,
    NULLIF(TRIM(p_idempotency_key), ''), p_branch_id, v_actual_paid, v_actual_paid
  ) RETURNING id INTO v_invoice_id;

  -- 11. Insert Invoice Items (with server-resolved cost_price) and Deduct Stock
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric, warehouse_id uuid)
  LOOP
    v_line_total := v_item.quantity * v_item.unit_price;

    SELECT COALESCE(cost_price, 0) INTO v_item_cost
    FROM public.products
    WHERE id = v_item.product_id AND company_id = v_company_id;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, total, tax_amount, cost_price, company_id
    ) VALUES (
      v_invoice_id, v_item.product_id, v_item.quantity, v_item.unit_price,
      v_line_total, ROUND(v_line_total * COALESCE(v_item.tax_rate, 0) / 100, 4),
      COALESCE(v_item_cost, 0), v_company_id
    );

    UPDATE public.product_stock
    SET quantity = quantity - v_item.quantity, updated_at = NOW()
    WHERE product_id = v_item.product_id
      AND warehouse_id = COALESCE(v_item.warehouse_id, v_warehouse_id)
      AND company_id = v_company_id;

    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity, transaction_type,
      reference_type, reference_id, unit_cost, total_cost, created_by
    ) VALUES (
      v_company_id, v_item.product_id, COALESCE(v_item.warehouse_id, v_warehouse_id),
      -v_item.quantity, 'sales', 'sales_invoice', v_invoice_id,
      COALESCE(v_item_cost, 0), ROUND(v_item.quantity * COALESCE(v_item_cost, 0), 4), v_user_id
    );
  END LOOP;

  -- 12. Transition status from 'draft' -> final status so trg_auto_post_invoice_journal posts Revenue + COGS
  UPDATE public.invoices
  SET status = v_final_status,
      updated_at = NOW()
  WHERE id = v_invoice_id;

  RETURN v_invoice_id;
END;
$function$;


-- 2. Harden process_sales_return (Ignore client cost_price; use original invoice item or catalog cost_price)
CREATE OR REPLACE FUNCTION public.process_sales_return(
  p_invoice_id uuid,
  p_party_id uuid DEFAULT NULL::uuid,
  p_payment_method text DEFAULT 'cash'::text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_return_reason text DEFAULT ''::text,
  p_status text DEFAULT 'posted'::text,
  p_notes text DEFAULT ''::text,
  p_issue_date date DEFAULT CURRENT_DATE,
  p_currency_code text DEFAULT 'SAR'::text,
  p_exchange_rate numeric DEFAULT 1,
  p_company_id uuid DEFAULT NULL::uuid,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_return_invoice_id UUID;
  v_invoice_number    TEXT;
  v_branch_id         UUID;
  v_orig_currency     TEXT;
  v_orig_rate         NUMERIC;
  v_orig_total        NUMERIC;
  v_effective_currency TEXT;
  v_effective_rate     NUMERIC;
  v_total_amount      NUMERIC := 0;
  v_warehouse_id      UUID;
  v_item              RECORD;
  v_orig_item         RECORD;
  v_already_returned  NUMERIC;
  v_catalog_cost      NUMERIC;
  v_orig_cost         NUMERIC;
  v_resolved_cost     NUMERIC;
  v_effective_company UUID;
  v_effective_user    UUID;
  v_final_status      TEXT := COALESCE(NULLIF(TRIM(p_status), ''), 'posted');
BEGIN
  v_effective_user := auth.uid();
  IF v_effective_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_effective_company := p_company_id;

  IF v_effective_company IS NULL AND p_invoice_id IS NOT NULL THEN
    SELECT company_id INTO v_effective_company FROM public.invoices WHERE id = p_invoice_id;
  END IF;

  IF v_effective_company IS NULL THEN
    RAISE EXCEPTION 'معرف المنشأة (company_id) مفقود';
  END IF;

  PERFORM public.fn_assert_company_access(v_effective_company);

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'لا توجد أصناف في مرتجع المبيعات';
  END IF;

  -- 1. Strict Validation of Original Sale Invoice
  IF p_invoice_id IS NOT NULL THEN
    SELECT branch_id, currency_code, exchange_rate, party_id, total_amount
    INTO v_branch_id, v_orig_currency, v_orig_rate, p_party_id, v_orig_total
    FROM public.invoices
    WHERE id = p_invoice_id AND company_id = v_effective_company AND type = 'sale' AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'الفاتورة الأصلية المرجعية غير موجودة أو ليست فاتورة مبيعات صالحة';
    END IF;

    v_effective_currency := COALESCE(v_orig_currency, 'SAR');
    v_effective_rate := COALESCE(v_orig_rate, 1);
  ELSE
    SELECT branch_id INTO v_branch_id FROM public.user_profiles WHERE id = v_effective_user;
    v_effective_currency := UPPER(TRIM(COALESCE(p_currency_code, 'SAR')));
    v_effective_rate := COALESCE(p_exchange_rate, 1);
  END IF;

  -- 2. Validate Currency and Rate
  IF v_effective_currency = 'SAR' THEN
    v_effective_rate := 1;
  ELSIF v_effective_currency = 'YER' AND (v_effective_rate IS NULL OR v_effective_rate <= 1) THEN
    SELECT COALESCE(rate_to_base, 410) INTO v_effective_rate
    FROM public.exchange_rates
    WHERE company_id = v_effective_company AND currency_code = 'YER'
    ORDER BY effective_date DESC LIMIT 1;
  ELSIF COALESCE(v_effective_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'سعر الصرف يجب أن يكون أكبر من صفر';
  END IF;

  -- 3. Resolve Warehouse
  IF v_branch_id IS NOT NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
    WHERE company_id = v_effective_company AND branch_id = v_branch_id AND is_primary = true AND deleted_at IS NULL
    LIMIT 1;

    IF v_warehouse_id IS NULL THEN
      SELECT id INTO v_warehouse_id FROM public.warehouses
      WHERE company_id = v_effective_company AND branch_id = v_branch_id AND deleted_at IS NULL
      LIMIT 1;
    END IF;
  END IF;

  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
    WHERE company_id = v_effective_company AND is_primary = true AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- 4. Generate Return Sequence Number
  v_invoice_number := public.generate_invoice_number(v_effective_company, 'sale_return', v_branch_id);

  -- 5. Validate Return Items against Original Invoice & Non-Negative Prices
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items)
    AS x(product_id UUID, quantity NUMERIC, unit_price NUMERIC, cost_price NUMERIC, description TEXT)
  LOOP
    IF COALESCE(v_item.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'كمية المرتجع للصنف % غير صالحة (%)', v_item.product_id, v_item.quantity;
    END IF;

    IF v_item.unit_price IS NULL OR v_item.unit_price < 0 THEN
      RAISE EXCEPTION 'سعر الإرجاع لا يمكن أن يكون سالباً للصنف %', v_item.product_id;
    END IF;

    IF p_invoice_id IS NOT NULL THEN
      SELECT quantity, unit_price INTO v_orig_item
      FROM public.invoice_items
      WHERE invoice_id = p_invoice_id AND product_id = v_item.product_id
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'الصنف % لم يكن مدرجاً في فاتورة البيع الأصلية %', v_item.product_id, p_invoice_id;
      END IF;

      IF ABS(v_item.unit_price - v_orig_item.unit_price) > 0.05 THEN
        RAISE EXCEPTION 'سعر الإرجاع للصنف % (%) لا يطابق سعر البيع في الفاتورة الأصلية (%)',
          v_item.product_id, v_item.unit_price, v_orig_item.unit_price;
      END IF;

      SELECT COALESCE(SUM(ri.quantity), 0) INTO v_already_returned
      FROM public.invoices ret
      JOIN public.invoice_items ri ON ri.invoice_id = ret.id
      WHERE ret.reference_invoice_id = p_invoice_id
        AND ret.type IN ('sale_return', 'return_sale')
        AND ret.deleted_at IS NULL
        AND ret.status NOT IN ('cancelled', 'void')
        AND ri.product_id = v_item.product_id;

      IF (v_already_returned + v_item.quantity) > v_orig_item.quantity THEN
        RAISE EXCEPTION 'إجمالي الكمية المرتجعة للصنف % (% + %) يتجاوز الكمية المباعة في الفاتورة الأصلية (%)',
          v_item.product_id, v_already_returned, v_item.quantity, v_orig_item.quantity;
      END IF;
    END IF;

    v_total_amount := v_total_amount + (v_item.quantity * v_item.unit_price);
  END LOOP;

  -- 6. Insert Return Invoice Record as 'draft' first so items exist before journal posting
  INSERT INTO public.invoices (
    company_id, invoice_number, party_id, issue_date, due_date,
    total_amount, tax_amount, discount_amount, payment_method,
    status, notes, type, created_by, currency_code, exchange_rate,
    reference_invoice_id, return_reason, branch_id, paid_amount
  ) VALUES (
    v_effective_company, v_invoice_number, p_party_id, p_issue_date, p_issue_date,
    v_total_amount, 0, 0, p_payment_method,
    'draft', p_notes, 'sale_return', v_effective_user, v_effective_currency, v_effective_rate,
    p_invoice_id, p_return_reason, v_branch_id,
    CASE WHEN p_payment_method = 'cash' THEN v_total_amount ELSE 0 END
  ) RETURNING id INTO v_return_invoice_id;

  -- 7. Insert Items (using server-resolved COGS cost_price) and Restore Stock
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items)
    AS x(product_id UUID, quantity NUMERIC, unit_price NUMERIC, cost_price NUMERIC, description TEXT)
  LOOP
    SELECT cost_price INTO v_catalog_cost
    FROM public.products
    WHERE id = v_item.product_id AND company_id = v_effective_company;

    v_orig_cost := NULL;
    IF p_invoice_id IS NOT NULL THEN
      SELECT cost_price INTO v_orig_cost
      FROM public.invoice_items
      WHERE invoice_id = p_invoice_id AND product_id = v_item.product_id
      LIMIT 1;
    END IF;

    -- Always resolve COGS from DB (original invoice item or product catalog), never from client payload
    v_resolved_cost := GREATEST(0, COALESCE(v_orig_cost, v_catalog_cost, 0));

    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, total,
      cost_price, description, company_id
    ) VALUES (
      v_return_invoice_id, v_item.product_id, v_item.quantity, v_item.unit_price,
      (v_item.quantity * v_item.unit_price), v_resolved_cost,
      v_item.description, v_effective_company
    );

    INSERT INTO public.product_stock (company_id, product_id, warehouse_id, quantity)
    VALUES (v_effective_company, v_item.product_id, v_warehouse_id, v_item.quantity)
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity, updated_at = NOW();

    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity, transaction_type,
      reference_type, reference_id, unit_cost, total_cost, created_by
    ) VALUES (
      v_effective_company, v_item.product_id, v_warehouse_id,
      v_item.quantity, 'return_sale', 'sale_return', v_return_invoice_id,
      v_resolved_cost,
      v_item.quantity * v_resolved_cost,
      v_effective_user
    );
  END LOOP;

  -- 8. Transition status from 'draft' -> final status so trg_auto_post_invoice_journal posts Revenue & COGS reversal
  UPDATE public.invoices
  SET status = v_final_status,
      updated_at = NOW()
  WHERE id = v_return_invoice_id;

  RETURN jsonb_build_object(
    'id', v_return_invoice_id,
    'invoice_number', v_invoice_number,
    'total_amount', v_total_amount,
    'currency_code', v_effective_currency,
    'exchange_rate', v_effective_rate,
    'status', v_final_status
  );
END;
$function$;


-- 3. Harden commit_purchase_invoice (Non-negative cost, tax, and discount bounds)
CREATE OR REPLACE FUNCTION public.commit_purchase_invoice(
  p_company_id uuid,
  p_user_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_exchange_rate numeric,
  p_currency text,
  p_issue_date date,
  p_payment_method text,
  p_payment_account_id uuid,
  p_notes text,
  p_invoice_number text,
  p_branch_id uuid,
  p_due_date date,
  p_paid_amount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid                  uuid := auth.uid();
  v_invoice_id           uuid;
  v_gen_number           text;
  v_base_currency        text;
  v_subtotal             numeric(14,4) := 0;
  v_tax_total            numeric(14,4) := 0;
  v_total                numeric(14,4) := 0;
  v_item                 jsonb;
  v_product              record;
  v_primary_wh_id        uuid;
  v_item_wh_id           uuid;
  v_journal_id           uuid;
  v_qty                  numeric;
  v_unit_cost            numeric;
  v_base_unit_cost       numeric;
  v_item_tax             numeric;
  v_item_discount        numeric;
  v_line_total           numeric;
  v_actual_paid          numeric;
  v_status               text;
BEGIN
  PERFORM public.verify_company_access(p_company_id);

  IF v_uid IS NULL OR (NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_uid AND ucr.company_id = p_company_id
  )) THEN
    RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية اعتماد فواتير المشتريات' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'لا توجد أصناف في فاتورة الشراء';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_years
    WHERE company_id = p_company_id
      AND p_issue_date BETWEEN start_date AND end_date
      AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'تاريخ الفاتورة يقع خارج سنة مالية مفتوحة';
  END IF;

  IF COALESCE(p_exchange_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'سعر الصرف يجب أن يكون أكبر من صفر';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency
    FROM public.companies c
   WHERE c.id = p_company_id
   LIMIT 1;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  -- Branch-scoped primary warehouse resolution
  SELECT id INTO v_primary_wh_id FROM public.warehouses
  WHERE company_id = p_company_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND is_primary = true
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_primary_wh_id IS NULL THEN
    SELECT id INTO v_primary_wh_id FROM public.warehouses
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF v_primary_wh_id IS NULL THEN
    SELECT id INTO v_primary_wh_id FROM public.warehouses
    WHERE company_id = p_company_id AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1;
  END IF;

  IF v_primary_wh_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد مستودع مُعرَّف للشركة/الفرع';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE company_id = p_company_id AND code = '2100' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'حساب الدائنين (2100) غير موجود';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE company_id = p_company_id AND code = '1200' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'حساب المخزون (1200) غير موجود';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('invoice_number:' || p_company_id::text || ':purchase'));

  v_gen_number := CASE
    WHEN p_invoice_number IS NOT NULL AND TRIM(p_invoice_number) != ''
    THEN p_invoice_number
    ELSE public.get_next_invoice_number(p_company_id, 'purchase')
  END;

  INSERT INTO public.invoices(
    company_id, branch_id, party_id, invoice_number, type, status,
    issue_date, due_date, notes, created_by, currency_code, exchange_rate,
    payment_method, payment_account_id, subtotal, tax_amount, total_amount, paid_amount, advance_payment
  ) VALUES (
    p_company_id, p_branch_id, p_supplier_id, v_gen_number, 'purchase', 'draft',
    p_issue_date, p_due_date, p_notes, v_uid, p_currency, p_exchange_rate,
    p_payment_method, p_payment_account_id, 0, 0, 0, 0, 0
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND company_id = p_company_id AND deleted_at IS NULL;
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'المنتج غير موجود: %', v_item->>'product_id';
    END IF;

    v_qty           := COALESCE((v_item->>'quantity')::numeric, 0);
    v_unit_cost     := COALESCE((v_item->>'unit_cost')::numeric, (v_item->>'unit_price')::numeric, v_product.purchase_price);
    v_item_tax      := COALESCE((v_item->>'tax_amount')::numeric, 0);
    v_item_discount := COALESCE((v_item->>'discount_amount')::numeric, 0);

    IF v_qty <= 0 THEN RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر'; END IF;
    IF v_unit_cost IS NULL OR v_unit_cost < 0 THEN RAISE EXCEPTION 'تكلفة الوحدة لا يمكن أن تكون سالبة'; END IF;
    IF v_item_tax < 0 THEN RAISE EXCEPTION 'الضريبة لا يمكن أن تكون سالبة'; END IF;
    IF v_item_discount < 0 OR v_item_discount > (v_qty * v_unit_cost) THEN
      RAISE EXCEPTION 'مبلغ الخصم غير صالح';
    END IF;

    v_line_total    := ROUND((v_qty * v_unit_cost) - v_item_discount + v_item_tax, 4);

    -- Per-item warehouse override (if valid for this company)
    v_item_wh_id := NULL;
    IF COALESCE(v_item->>'warehouse_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT w.id INTO v_item_wh_id
      FROM public.warehouses w
      WHERE w.id = (v_item->>'warehouse_id')::uuid
        AND w.company_id = p_company_id
        AND w.deleted_at IS NULL;
    END IF;
    v_item_wh_id := COALESCE(v_item_wh_id, v_primary_wh_id);

    -- Convert unit_cost to base currency for inventory valuation & WAC trigger
    v_base_unit_cost := public.fn_to_base_amount(p_currency, v_unit_cost, p_exchange_rate, v_base_currency);

    INSERT INTO public.invoice_items(
      invoice_id, product_id, description, quantity,
      unit_price, cost_price, discount_amount, tax_amount,
      tax_rate_id, total, company_id
    ) VALUES (
      v_invoice_id, v_product.id, v_product.name_ar, v_qty,
      v_unit_cost, v_base_unit_cost, v_item_discount, v_item_tax,
      NULLIF(v_item->>'tax_rate_id','')::uuid,
      v_line_total, p_company_id
    );

    INSERT INTO public.inventory_transactions(
      company_id, product_id, warehouse_id, quantity,
      transaction_type, reference_type, reference_id, created_by,
      unit_cost, total_cost
    ) VALUES (
      p_company_id, v_product.id, v_item_wh_id, v_qty,
      'purchase', 'invoice', v_invoice_id, v_uid,
      v_base_unit_cost, ROUND(v_qty * v_base_unit_cost, 4)
    );

    v_subtotal  := v_subtotal  + ROUND(v_qty * v_unit_cost - v_item_discount, 4);
    v_tax_total := v_tax_total + v_item_tax;
  END LOOP;

  v_total := v_subtotal + v_tax_total;

  IF COALESCE(p_payment_method, 'credit') <> 'credit' THEN
    v_actual_paid := v_total;
    v_status := 'posted';
  ELSE
    v_actual_paid := LEAST(v_total, GREATEST(0, COALESCE(p_paid_amount, 0)));
    IF v_actual_paid >= v_total THEN
      v_status := 'posted';
    ELSIF v_actual_paid > 0 THEN
      v_status := 'partially_paid';
    ELSE
      v_status := 'posted';
    END IF;
  END IF;

  UPDATE public.invoices
  SET subtotal = v_subtotal,
      tax_amount = v_tax_total,
      total_amount = v_total,
      paid_amount = v_actual_paid,
      advance_payment = v_actual_paid,
      status = v_status
  WHERE id = v_invoice_id;

  SELECT je.id INTO v_journal_id
  FROM public.journal_entries je
  WHERE je.reference_id = v_invoice_id
    AND je.reference_type = 'purchase_invoice'
    AND je.deleted_at IS NULL
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    RAISE EXCEPTION 'فشل الترحيل المحاسبي التلقائي لفاتورة الشراء % - لم يُنشأ أي قيد', v_gen_number;
  END IF;

  RETURN jsonb_build_object(
    'id',             v_invoice_id,
    'invoice_number', v_gen_number,
    'total_amount',   v_total,
    'tax_amount',     v_tax_total,
    'currency',       p_currency,
    'exchange_rate',  p_exchange_rate,
    'status',         v_status
  );
END;
$function$;


-- 4. Harden commit_purchase_return (Strict auth.uid(), exchange_rate > 0, non-negative cost/discount)
CREATE OR REPLACE FUNCTION public.commit_purchase_return(
  p_company_id uuid,
  p_user_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_notes text,
  p_currency text,
  p_exchange_rate numeric,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_return_reason text DEFAULT NULL::text,
  p_reference_invoice_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_invoice_id uuid;
  v_invoice_number text;
  v_journal_id uuid;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_base_subtotal numeric := 0;
  v_base_total numeric := 0;
  v_payable_account_id uuid;
  v_inventory_account_id uuid;
  v_primary_wh_id uuid;
  v_item jsonb;
  v_product RECORD;
  v_avail_qty numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.fn_assert_company_access(p_company_id);

  IF COALESCE(p_exchange_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'سعر الصرف يجب أن يكون أكبر من صفر';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'لا توجد أصناف في مرتجع المشتريات';
  END IF;

  SELECT id INTO v_payable_account_id FROM accounts
    WHERE company_id = p_company_id AND code = '2100' AND deleted_at IS NULL;
  IF v_payable_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب ذمم الموردين (2100) غير موجود';
  END IF;

  SELECT id INTO v_inventory_account_id FROM accounts
    WHERE company_id = p_company_id AND code = '1200' AND deleted_at IS NULL;
  IF v_inventory_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب المخزون (1200) غير موجود';
  END IF;

  -- Prefer the branch warehouse when p_branch_id is specified
  IF p_branch_id IS NOT NULL THEN
    SELECT id INTO v_primary_wh_id FROM warehouses
      WHERE company_id = p_company_id AND branch_id = p_branch_id AND deleted_at IS NULL
      ORDER BY is_primary DESC, created_at ASC LIMIT 1;
  END IF;
  IF v_primary_wh_id IS NULL THEN
    SELECT id INTO v_primary_wh_id FROM warehouses
      WHERE company_id = p_company_id AND is_primary = true AND deleted_at IS NULL LIMIT 1;
  END IF;
  IF v_primary_wh_id IS NULL THEN
    SELECT id INTO v_primary_wh_id FROM warehouses
      WHERE company_id = p_company_id AND deleted_at IS NULL LIMIT 1;
  END IF;
  IF v_primary_wh_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد مستودع متاح لخصم مرتجع المشتريات';
  END IF;

  SELECT COALESCE(prefix, 'PRET-') || LPAD((COALESCE(current_number, 0) + 1)::text, 5, '0')
    INTO v_invoice_number
  FROM numbering_sequences
  WHERE company_id = p_company_id AND document_type = 'purchase_return';

  IF v_invoice_number IS NULL THEN
    v_invoice_number := 'PRET-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM()*1000)::text, 3, '0');
  ELSE
    UPDATE numbering_sequences
      SET current_number = current_number + 1, updated_at = NOW()
      WHERE company_id = p_company_id AND document_type = 'purchase_return';
  END IF;

  INSERT INTO invoices(
    company_id, branch_id, type, invoice_number, party_id,
    issue_date, notes, status, currency_code, exchange_rate,
    subtotal, tax_amount, total_amount, created_by, return_reason,
    reference_invoice_id
  ) VALUES (
    p_company_id, p_branch_id, 'purchase_return', v_invoice_number, p_supplier_id,
    CURRENT_DATE, p_notes, 'draft', p_currency, p_exchange_rate,
    0, 0, 0, v_uid, p_return_reason,
    p_reference_invoice_id
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM products
      WHERE id = (v_item->>'product_id')::uuid
        AND company_id = p_company_id AND deleted_at IS NULL;
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'المنتج غير موجود: %', v_item->>'product_id';
    END IF;

    DECLARE
      v_qty       numeric := COALESCE((v_item->>'quantity')::numeric, 0);
      v_unit_cost numeric := COALESCE((v_item->>'unit_cost')::numeric, v_product.purchase_price);
      v_discount  numeric := COALESCE((v_item->>'discount_amount')::numeric, 0);
      v_line_sub  numeric;
    BEGIN
      IF v_qty <= 0 THEN RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر'; END IF;
      IF v_unit_cost IS NULL OR v_unit_cost < 0 THEN RAISE EXCEPTION 'تكلفة الوحدة لا يمكن أن تكون سالبة'; END IF;
      IF v_discount < 0 OR v_discount > (v_qty * v_unit_cost) THEN RAISE EXCEPTION 'مبلغ الخصم غير صالح'; END IF;

      v_line_sub := (v_qty * v_unit_cost) - v_discount;

      -- Lock stock row and guard against negative inventory
      SELECT COALESCE(ps.quantity, 0) INTO v_avail_qty
      FROM public.product_stock ps
      WHERE ps.product_id = v_product.id AND ps.warehouse_id = v_primary_wh_id
      FOR UPDATE;

      IF COALESCE(v_avail_qty, 0) < v_qty THEN
        RAISE EXCEPTION 'الكمية المتوفرة في المستودع (%) غير كافية لإرجاع (%) من المنتج "%"',
          COALESCE(v_avail_qty, 0), v_qty, v_product.name_ar;
      END IF;

      IF p_reference_invoice_id IS NOT NULL THEN
        DECLARE
          v_orig_qty numeric := 0;
          v_prev_returned numeric := 0;
        BEGIN
          SELECT COALESCE(SUM(ii.quantity), 0) INTO v_orig_qty
          FROM public.invoice_items ii
          WHERE ii.invoice_id = p_reference_invoice_id AND ii.product_id = v_product.id;

          IF v_orig_qty > 0 THEN
            SELECT COALESCE(SUM(ret_ii.quantity), 0) INTO v_prev_returned
            FROM public.invoices ret_inv
            JOIN public.invoice_items ret_ii ON ret_ii.invoice_id = ret_inv.id
            WHERE ret_inv.reference_invoice_id = p_reference_invoice_id
              AND ret_inv.type = 'purchase_return'
              AND ret_inv.status <> 'void'
              AND ret_inv.deleted_at IS NULL
              AND ret_ii.product_id = v_product.id;

            IF (v_qty + v_prev_returned) > v_orig_qty THEN
              RAISE EXCEPTION 'كمية الإرجاع المطلوبة (%) تتجاوز الكمية المتبقية القابلة للإرجاع (%) للمنتج "%"',
                v_qty, GREATEST(0, v_orig_qty - v_prev_returned), v_product.name_ar;
            END IF;
          END IF;
        END;
      END IF;

      INSERT INTO invoice_items(
        invoice_id, product_id, description, quantity,
        unit_price, cost_price, discount_amount, tax_amount, total, company_id
      ) VALUES (
        v_invoice_id, v_product.id, v_product.name_ar, v_qty,
        v_unit_cost, v_unit_cost, v_discount, 0, v_line_sub, p_company_id
      );

      INSERT INTO inventory_transactions(
        company_id, product_id, warehouse_id, quantity,
        transaction_type, reference_type, reference_id, created_by,
        unit_cost, total_cost
      ) VALUES (
        p_company_id, v_product.id, v_primary_wh_id, v_qty,
        'purchase_return', 'invoice', v_invoice_id, v_uid,
        v_unit_cost, round(v_qty * v_unit_cost, 4)
      );

      v_subtotal := v_subtotal + v_line_sub;
    END;
  END LOOP;

  v_total := v_subtotal;
  UPDATE invoices SET subtotal = v_subtotal, tax_amount = 0, total_amount = v_total WHERE id = v_invoice_id;

  v_base_subtotal := public.fn_to_base_amount(p_currency, v_subtotal, p_exchange_rate);
  v_base_total    := public.fn_to_base_amount(p_currency, v_total, p_exchange_rate);

  INSERT INTO journal_entries(
    company_id, branch_id, entry_date, description, reference_type, reference_id, status, created_by
  ) VALUES (
    p_company_id, p_branch_id, CURRENT_DATE, 'مرتجع مشتريات ' || v_invoice_number,
    'purchase_return', v_invoice_id, 'draft', v_uid
  ) RETURNING id INTO v_journal_id;

  INSERT INTO journal_entry_lines(
    journal_entry_id, account_id, party_id, debit_amount, credit_amount,
    description, currency_code, exchange_rate, foreign_amount, company_id, branch_id
  ) VALUES
    (v_journal_id, v_payable_account_id, p_supplier_id, v_base_total, 0,
     'تخفيض ذمم المورد - ' || v_invoice_number, p_currency, p_exchange_rate, v_total, p_company_id, p_branch_id),
    (v_journal_id, v_inventory_account_id, NULL, 0, v_base_subtotal,
     'خصم مخزون مرتجع - ' || v_invoice_number, p_currency, p_exchange_rate, v_subtotal, p_company_id, p_branch_id);

  UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  UPDATE invoices SET status = 'posted' WHERE id = v_invoice_id;

  RETURN jsonb_build_object(
    'id', v_invoice_id, 'invoice_number', v_invoice_number,
    'total_base', v_base_total, 'currency', p_currency, 'status', 'posted'
  );
END;
$function$;


-- 5. Harden create_stock_transfer (Strict auth.uid(), items check, quantity > 0)
CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  p_from_warehouse uuid,
  p_to_warehouse uuid,
  p_items jsonb,
  p_company_id uuid,
  p_user_id uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_transfer_id uuid;
  v_item jsonb;
  v_qty numeric;
  v_from_branch_id uuid;
  v_to_branch_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.fn_assert_company_access(p_company_id);

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'لا توجد أصناف في طلب التحويل';
  END IF;

  IF p_from_warehouse = p_to_warehouse THEN
    RAISE EXCEPTION 'لا يمكن التحويل من وإلى نفس المستودع';
  END IF;

  SELECT branch_id INTO v_from_branch_id
  FROM public.warehouses
  WHERE id = p_from_warehouse AND company_id = p_company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستودع المصدر غير موجود أو لا يتبع هذه الشركة';
  END IF;

  SELECT branch_id INTO v_to_branch_id
  FROM public.warehouses
  WHERE id = p_to_warehouse AND company_id = p_company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستودع الوجهة غير موجود أو لا يتبع هذه الشركة';
  END IF;

  IF NOT public.user_can_access_branch(p_company_id, v_from_branch_id) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية التحويل من مستودع هذا الفرع';
  END IF;

  INSERT INTO public.stock_transfers (
    company_id, from_warehouse_id, to_warehouse_id, notes, status, created_by
  )
  VALUES (
    p_company_id, p_from_warehouse, p_to_warehouse, p_notes, 'pending', v_uid
  ) RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'كمية التحويل يجب أن تكون أكبر من صفر';
    END IF;

    INSERT INTO public.stock_transfer_items (
      transfer_id, company_id, product_id, quantity
    ) VALUES (
      v_transfer_id, p_company_id, (v_item->>'product_id')::uuid, v_qty
    );
  END LOOP;

  PERFORM public.process_stock_transfer(v_transfer_id);

  PERFORM public.audit_write(
    'stock_transfer_created',
    'stock_transfers',
    v_transfer_id,
    p_company_id,
    jsonb_build_object(
      'source_warehouse_id', p_from_warehouse,
      'destination_warehouse_id', p_to_warehouse,
      'source_branch_id', v_from_branch_id,
      'destination_branch_id', v_to_branch_id
    )
  );

  RETURN jsonb_build_object('success', true, 'transfer_id', v_transfer_id);
END;
$function$;


-- 6. Harden RLS on journal_entries, journal_entry_lines, accounts, product_stock
-- (SECURITY DEFINER RPCs and triggers bypass RLS; direct table tampering by non-admins is blocked)

-- journal_entries
DROP POLICY IF EXISTS "journal_entries_insert" ON public.journal_entries;
CREATE POLICY "journal_entries_insert" ON public.journal_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (
      company_id IN (SELECT get_auth_companies())
      AND user_is_admin_or_manager(company_id)
      AND is_valid_branch(company_id, branch_id)
    )
  );

DROP POLICY IF EXISTS "journal_entries_update" ON public.journal_entries;
CREATE POLICY "journal_entries_update" ON public.journal_entries
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (
      company_id IN (SELECT get_auth_companies())
      AND user_is_admin_or_manager(company_id)
      AND ((branch_id IS NULL) OR (branch_id IN (SELECT get_auth_branches(journal_entries.company_id))))
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      company_id IN (SELECT get_auth_companies())
      AND user_is_admin_or_manager(company_id)
      AND ((branch_id IS NULL) OR (branch_id IN (SELECT get_auth_branches(journal_entries.company_id))))
    )
  );

-- journal_entry_lines
DROP POLICY IF EXISTS "jel_insert" ON public.journal_entry_lines;
CREATE POLICY "jel_insert" ON public.journal_entry_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (
      company_id IN (SELECT get_auth_companies())
      AND user_is_admin_or_manager(company_id)
    )
  );

-- accounts
DROP POLICY IF EXISTS "accounts_insert" ON public.accounts;
CREATE POLICY "accounts_insert" ON public.accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (
      company_id IN (SELECT get_auth_companies())
      AND user_is_admin_or_manager(company_id)
    )
  );

DROP POLICY IF EXISTS "accounts_update" ON public.accounts;
CREATE POLICY "accounts_update" ON public.accounts
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (
      company_id IN (SELECT get_auth_companies())
      AND user_is_admin_or_manager(company_id)
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      company_id IN (SELECT get_auth_companies())
      AND user_is_admin_or_manager(company_id)
    )
  );

DROP POLICY IF EXISTS "accounts_delete" ON public.accounts;
CREATE POLICY "accounts_delete" ON public.accounts
  FOR DELETE TO authenticated
  USING (
    is_super_admin()
    OR (
      company_id IN (SELECT get_auth_companies())
      AND user_is_admin_or_manager(company_id)
    )
  );

-- product_stock
DROP POLICY IF EXISTS "product_stock_insert" ON public.product_stock;
CREATE POLICY "product_stock_insert" ON public.product_stock
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (
      company_id IN (SELECT get_auth_companies())
      AND user_is_admin_or_manager(company_id)
      AND EXISTS (
        SELECT 1 FROM warehouses w
        WHERE w.id = product_stock.warehouse_id
          AND w.company_id = product_stock.company_id
          AND ((w.branch_id IS NULL) OR (w.branch_id IN (SELECT get_auth_branches(product_stock.company_id))))
      )
    )
  );

DROP POLICY IF EXISTS "product_stock_update" ON public.product_stock;
CREATE POLICY "product_stock_update" ON public.product_stock
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (
      company_id IN (SELECT get_auth_companies())
      AND user_is_admin_or_manager(company_id)
      AND EXISTS (
        SELECT 1 FROM warehouses w
        WHERE w.id = product_stock.warehouse_id
          AND w.company_id = product_stock.company_id
          AND ((w.branch_id IS NULL) OR (w.branch_id IN (SELECT get_auth_branches(product_stock.company_id))))
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      company_id IN (SELECT get_auth_companies())
      AND user_is_admin_or_manager(company_id)
      AND EXISTS (
        SELECT 1 FROM warehouses w
        WHERE w.id = product_stock.warehouse_id
          AND w.company_id = product_stock.company_id
          AND ((w.branch_id IS NULL) OR (w.branch_id IN (SELECT get_auth_branches(product_stock.company_id))))
      )
    )
  );
