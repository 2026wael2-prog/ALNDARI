-- ============================================================================
-- Wave 10A: Zero-Cost Products (20% Profit / 80% Implied Cost) & Auto Sale Price
-- ----------------------------------------------------------------------------
-- 1. Adds canonical `public.fn_effective_line_cogs_base(...)`:
--    - Uses actual unit cost in base currency (SAR) when available.
--    - When a product has NO cost price (<= 0), calculates implied cost as
--      80% of actual net sale revenue (so profit = 20% only, never 100%).
-- 2. Updates `commit_sales_invoice_v2` (both overloads) and
--    `fn_process_cross_branch_sale`:
--    - Applies the 80% implied cost when product has no cost price so COGS
--      (account 5100), invoice_items.cost_price, and P&L reflect 20% profit.
--    - Automatically updates `products.sale_price` (in base currency SAR)
--      to the latest actual sale unit price on every posted sale.
-- 3. Updates `commit_sale_return` and `process_sales_return`:
--    - Applies the symmetric 80% implied cost fallback on returns of zero-cost
--      products when no original/catalog cost exists (never mutates sale_price).
-- ============================================================================

-- 1. Canonical effective line COGS helper (base currency SAR)
CREATE OR REPLACE FUNCTION public.fn_effective_line_cogs_base(
  p_currency_code text,
  p_exchange_rate numeric,
  p_quantity numeric,
  p_line_total numeric,
  p_item_cost_price numeric,
  p_product_cost_price numeric,
  p_product_purchase_price numeric DEFAULT 0
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_qty           numeric := COALESCE(p_quantity, 0);
  v_curr          text    := UPPER(TRIM(COALESCE(NULLIF(p_currency_code, ''), 'SAR')));
  v_line_rev_base numeric := public.fn_to_base_amount(v_curr, COALESCE(p_line_total, 0), p_exchange_rate);
  v_prod_cost     numeric := COALESCE(NULLIF(p_product_cost_price, 0), NULLIF(p_product_purchase_price, 0), 0);
  v_item_cost     numeric := COALESCE(p_item_cost_price, 0);
BEGIN
  IF v_qty = 0 THEN
    RETURN 0;
  END IF;

  IF v_item_cost > 0 THEN
    IF v_curr = 'SAR' THEN
      RETURN ROUND(v_item_cost * v_qty, 4);
    END IF;
    -- Handle legacy foreign-currency invoice_items where item.cost_price was stored
    -- in document currency (e.g. YER) instead of base currency (SAR).
    IF v_prod_cost > 0 AND ABS(v_item_cost - v_prod_cost) / GREATEST(v_prod_cost, 1) < 2 THEN
      RETURN ROUND(v_item_cost * v_qty, 4);
    ELSIF v_item_cost > 500 AND v_line_rev_base > 0 AND (v_item_cost * ABS(v_qty)) > (v_line_rev_base * 5) THEN
      RETURN ROUND(public.fn_to_base_amount(v_curr, v_item_cost, p_exchange_rate) * v_qty, 4);
    ELSE
      RETURN ROUND(v_item_cost * v_qty, 4);
    END IF;
  END IF;

  IF v_prod_cost > 0 THEN
    RETURN ROUND(v_prod_cost * v_qty, 4);
  END IF;

  -- Product has no cost price: 20% of actual sale amount is profit, 80% is implied cost.
  RETURN ROUND(v_line_rev_base * 0.80, 4);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_effective_line_cogs_base(text, numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated, service_role;

-- 2. commit_sales_invoice_v2 (15-arg overload)
CREATE OR REPLACE FUNCTION public.commit_sales_invoice_v2(
  p_company_id uuid,
  p_branch_id uuid,
  p_party_id uuid,
  p_invoice_number text,
  p_issue_date date,
  p_payment_method text,
  p_items jsonb,
  p_payments jsonb,
  p_created_by uuid,
  p_notes text DEFAULT NULL::text,
  p_currency_code text DEFAULT 'SAR'::text,
  p_exchange_rate numeric DEFAULT 1,
  p_due_date date DEFAULT NULL::date,
  p_credit_limit numeric DEFAULT 0,
  p_allow_credit_breach boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company_id uuid;
  v_invoice_id uuid;
  v_item record;
  v_payment record;
  v_currency text;
  v_eff_rate numeric;
  v_doc_subtotal numeric(18,2) := 0;
  v_doc_tax numeric(18,2) := 0;
  v_doc_discount numeric(18,2) := 0;
  v_doc_total numeric(18,2) := 0;
  v_doc_paid numeric(18,2) := 0;
  v_base_subtotal numeric(18,2) := 0;
  v_base_tax numeric(18,2) := 0;
  v_base_discount numeric(18,2) := 0;
  v_base_total numeric(18,2) := 0;
  v_base_paid numeric(18,2) := 0;
  v_remaining_amount numeric(18,2) := 0;
  v_current_debt numeric(18,2) := 0;
  v_party_credit_limit numeric(18,2) := 0;
  v_party_name text;
  v_line_net numeric(18,2);
  v_line_tax numeric(18,2);
  v_line_total numeric(18,2);
  v_net_unit_base numeric(18,4);
  v_last_sale_price_base numeric(18,2);
  v_product_name text;
  v_product_sku text;
  v_db_price numeric(18,2);
  v_sale_cost numeric(18,4);
  v_avail_stock numeric(18,4);
  v_default_warehouse_id uuid;
  v_target_warehouse_id uuid;
  v_client_cost_fallback numeric(18,4);
BEGIN
  v_company_id := p_company_id;
  PERFORM public.fn_assert_company_access(v_company_id);

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'لا يمكن إنشاء فاتورة مبيعات بدون أصناف';
  END IF;

  v_currency := UPPER(TRIM(COALESCE(NULLIF(p_currency_code, ''), 'SAR')));
  IF v_currency = 'SAR' THEN
    v_eff_rate := 1;
  ELSIF v_currency = 'YER' THEN
    IF COALESCE(p_exchange_rate, 0) <= 0 OR p_exchange_rate = 1 THEN
      RAISE EXCEPTION 'invalid_currency_rate: سعر صرف الريال اليمني غير صالح (%)' , p_exchange_rate USING ERRCODE = '23514';
    END IF;
    v_eff_rate := CASE WHEN p_exchange_rate > 1 THEN ROUND(1.0 / p_exchange_rate, 6) ELSE p_exchange_rate END;
  ELSE
    IF COALESCE(p_exchange_rate, 0) <= 0 THEN
      RAISE EXCEPTION 'invalid_currency_rate: سعر الصرف يجب أن يكون أكبر من صفر' USING ERRCODE = '23514';
    END IF;
    v_eff_rate := p_exchange_rate;
  END IF;

  SELECT id INTO v_default_warehouse_id
  FROM public.warehouses
  WHERE branch_id = p_branch_id AND company_id = v_company_id AND deleted_at IS NULL
  ORDER BY is_primary DESC, created_at ASC LIMIT 1;

  IF v_default_warehouse_id IS NULL THEN
    SELECT id INTO v_default_warehouse_id
    FROM public.warehouses
    WHERE company_id = v_company_id AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC LIMIT 1;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric,
      warehouse_id uuid, cost_price numeric, discount_amount numeric)
  LOOP
    IF v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'الكمية المدخلة غير صحيحة (%) للصنف', v_item.quantity;
    END IF;

    v_target_warehouse_id := COALESCE(v_item.warehouse_id, v_default_warehouse_id);

    SELECT name_ar, sku, sale_price, COALESCE(NULLIF(cost_price, 0), purchase_price, 0)
    INTO v_product_name, v_product_sku, v_db_price, v_client_cost_fallback
    FROM public.products
    WHERE id = v_item.product_id AND company_id = v_company_id;

    IF v_product_name IS NULL THEN
      RAISE EXCEPTION 'الصنف المحدد غير موجود أو لا ينتمي لهذه الشركة (%)', v_item.product_id;
    END IF;

    SELECT COALESCE(ps.quantity, 0), COALESCE(NULLIF(ps.weighted_avg_cost, 0), v_client_cost_fallback, 0)
    INTO v_avail_stock, v_sale_cost
    FROM public.product_stock ps
    WHERE ps.company_id = v_company_id
      AND ps.product_id = v_item.product_id
      AND ps.warehouse_id = v_target_warehouse_id
    FOR UPDATE;

    IF v_avail_stock IS NULL THEN
      v_avail_stock := 0;
      v_sale_cost := COALESCE(v_client_cost_fallback, 0);
    END IF;

    IF v_avail_stock < v_item.quantity THEN
      RAISE EXCEPTION 'الكمية المتوفرة بالمستودع للصنف % (%) هي % فقط، المطلوب %',
        v_product_name, COALESCE(v_product_sku,''), v_avail_stock, v_item.quantity;
    END IF;

    v_line_net   := GREATEST(0, v_item.quantity * v_item.unit_price - COALESCE(v_item.discount_amount, 0));
    v_line_tax   := round(v_line_net * (COALESCE(v_item.tax_rate, 0) / 100.0), 2);
    v_line_total := round(v_line_net + v_line_tax, 2);

    v_doc_subtotal := v_doc_subtotal + round(v_line_net, 2);
    v_doc_discount := v_doc_discount + COALESCE(v_item.discount_amount, 0);
    v_doc_tax      := v_doc_tax + v_line_tax;
    v_doc_total    := v_doc_total + v_line_total;
  END LOOP;

  v_base_total    := ROUND(v_doc_total * v_eff_rate, 2);
  v_base_tax      := ROUND(v_doc_tax * v_eff_rate, 2);
  v_base_discount := ROUND(v_doc_discount * v_eff_rate, 2);
  v_base_subtotal := ROUND(v_base_total - v_base_tax, 2);

  IF p_payments IS NOT NULL AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_payment IN SELECT * FROM jsonb_to_recordset(p_payments) AS
      x(amount numeric, payment_method text, account_id uuid)
    LOOP
      IF v_payment.amount > 0 THEN
        v_doc_paid := v_doc_paid + v_payment.amount;
      END IF;
    END LOOP;
    v_base_paid := LEAST(v_base_total, ROUND(v_doc_paid * v_eff_rate, 2));
  ELSIF p_payment_method = 'cash' THEN
    v_base_paid := v_base_total;
  END IF;

  v_remaining_amount := GREATEST(0, v_base_total - v_base_paid);

  IF v_remaining_amount > 0 AND p_party_id IS NOT NULL THEN
    SELECT name, credit_limit INTO v_party_name, v_party_credit_limit
    FROM public.parties WHERE id = p_party_id AND company_id = v_company_id;

    SELECT COALESCE(balance, 0) INTO v_current_debt
    FROM public.party_balances WHERE party_id = p_party_id;

    IF v_party_credit_limit > 0 AND NOT p_allow_credit_breach THEN
      IF (COALESCE(v_current_debt, 0) + v_remaining_amount) > v_party_credit_limit THEN
        RAISE EXCEPTION 'تجاوز حد الائتمان للعميل %! الحد المسموح: %، الرصيد الحالي: %، المتبقي من الفاتورة: %',
          v_party_name, v_party_credit_limit, v_current_debt, v_remaining_amount;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.invoices (
    company_id, branch_id, party_id, invoice_number, issue_date, due_date,
    type, payment_method, status,
    subtotal_document_amount, total_document_amount,
    subtotal, discount_amount, tax_amount, total_amount, paid_amount,
    currency_code, exchange_rate, notes, created_by
  ) VALUES (
    v_company_id, p_branch_id, p_party_id, p_invoice_number, p_issue_date, p_due_date,
    'sale', p_payment_method, 'draft',
    0, 0,
    0, 0, 0, 0, 0,
    v_currency, v_eff_rate, p_notes, p_created_by
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric,
      warehouse_id uuid, cost_price numeric, discount_amount numeric)
  LOOP
    v_target_warehouse_id := COALESCE(v_item.warehouse_id, v_default_warehouse_id);

    SELECT COALESCE(NULLIF(ps.weighted_avg_cost, 0), NULLIF(p.cost_price, 0), NULLIF(p.purchase_price, 0), 0)
    INTO v_sale_cost
    FROM public.products p
    LEFT JOIN public.product_stock ps
      ON ps.product_id = p.id
     AND ps.warehouse_id = v_target_warehouse_id
     AND ps.company_id = v_company_id
    WHERE p.id = v_item.product_id AND p.company_id = v_company_id;

    v_line_net   := GREATEST(0, v_item.quantity * v_item.unit_price - COALESCE(v_item.discount_amount, 0));
    v_line_tax   := round(v_line_net * (COALESCE(v_item.tax_rate, 0) / 100.0), 2);
    v_line_total := round(v_line_net + v_line_tax, 2);

    -- When product has no cost price (<= 0), treat 80% of actual net sale price as cost (20% profit).
    v_net_unit_base := CASE
      WHEN v_item.quantity > 0 THEN ROUND((v_line_net / v_item.quantity) * v_eff_rate, 4)
      ELSE ROUND(COALESCE(v_item.unit_price, 0) * v_eff_rate, 4)
    END;
    v_sale_cost := COALESCE(v_sale_cost, 0);
    IF v_sale_cost <= 0 AND v_net_unit_base > 0 THEN
      v_sale_cost := ROUND(v_net_unit_base * 0.80, 4);
    END IF;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, cost_price,
      discount_amount, tax_amount, total, company_id
    ) VALUES (
      v_invoice_id, v_item.product_id, v_item.quantity, v_item.unit_price,
      v_sale_cost,
      COALESCE(v_item.discount_amount, 0),
      v_line_tax,
      v_line_total,
      v_company_id
    );

    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity, unit_cost, total_cost,
      transaction_type, reference_type, reference_id, created_by
    ) VALUES (
      v_company_id, v_item.product_id, v_target_warehouse_id,
      -ABS(v_item.quantity), v_sale_cost,
      ROUND(ABS(v_item.quantity) * v_sale_cost, 4),
      'sales', 'sale_invoice', v_invoice_id, p_created_by
    );

    -- Auto-update product catalog sale_price (in base currency SAR) to last sold price.
    v_last_sale_price_base := ROUND(COALESCE(v_item.unit_price, 0) * v_eff_rate, 2);
    IF v_last_sale_price_base > 0 THEN
      UPDATE public.products
      SET sale_price = v_last_sale_price_base,
          updated_at = now()
      WHERE id = v_item.product_id
        AND company_id = v_company_id
        AND deleted_at IS NULL
        AND COALESCE(sale_price, 0) IS DISTINCT FROM v_last_sale_price_base;
    END IF;
  END LOOP;

  PERFORM set_config('app.rpc_authorized', 'true', true);

  UPDATE public.invoices
  SET subtotal_document_amount = v_doc_subtotal,
      total_document_amount    = v_doc_total,
      subtotal                 = v_base_subtotal,
      discount_amount          = v_base_discount,
      tax_amount               = v_base_tax,
      total_amount             = v_base_total,
      paid_amount              = v_base_paid,
      advance_payment          = v_base_paid,
      status = CASE WHEN v_remaining_amount <= 0 THEN 'paid'
                    WHEN v_base_paid > 0 THEN 'partially_paid'
                    ELSE 'posted' END,
      updated_at = now()
  WHERE id = v_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'invoice_number', p_invoice_number,
    'total_amount', v_base_total,
    'total_document_amount', v_doc_total,
    'paid_amount', v_base_paid,
    'remaining_amount', v_remaining_amount
  );
END;
$function$;

-- 3. commit_sales_invoice_v2 (12-arg primary frontend overload)
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
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_user_role text;
  v_invoice_id uuid;
  v_invoice_number text;
  v_item record;
  v_product_name text;
  v_product_sku text;
  v_db_price numeric;
  v_db_cost numeric;
  v_sale_cost numeric;
  v_unit_base numeric;
  v_net_unit_base numeric;
  v_last_sale_price_base numeric;
  v_min_allowed_price numeric;
  v_currency text;
  v_eff_rate numeric;
  v_line_net numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_doc_subtotal numeric := 0;
  v_doc_tax numeric := 0;
  v_doc_discount numeric := 0;
  v_doc_total numeric := 0;
  v_base_subtotal numeric := 0;
  v_base_tax numeric := 0;
  v_base_discount numeric := 0;
  v_base_total numeric := 0;
  v_warehouse_id uuid;
  v_target_wh_id uuid;
  v_party_name text;
  v_is_cash boolean;
  v_actual_paid numeric;
  v_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_company_id FROM public.user_profiles WHERE id = v_user_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User not associated with any company' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_user_role FROM public.user_company_roles
  WHERE user_id = v_user_id AND company_id = v_company_id LIMIT 1;
  IF v_user_role IS NULL THEN
    SELECT role INTO v_user_role FROM public.user_profiles WHERE id = v_user_id;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_invoice_id FROM public.invoices
    WHERE company_id = v_company_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_invoice_id;
    END IF;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'يجب أن تحتوي الفاتورة على صنف واحد على الأقل';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_years
    WHERE company_id = v_company_id
      AND p_invoice_date BETWEEN start_date AND end_date
      AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'تاريخ الفاتورة يقع خارج سنة مالية مفتوحة';
  END IF;

  v_currency := UPPER(TRIM(COALESCE(NULLIF(p_currency_code, ''), 'SAR')));
  IF v_currency = 'SAR' THEN
    v_eff_rate := 1;
  ELSIF v_currency = 'YER' THEN
    IF COALESCE(p_exchange_rate, 0) <= 0 OR p_exchange_rate = 1 THEN
      RAISE EXCEPTION 'invalid_currency_rate: سعر صرف الريال اليمني غير صالح (%)', p_exchange_rate USING ERRCODE = '23514';
    END IF;
    v_eff_rate := CASE WHEN p_exchange_rate > 1 THEN ROUND(1.0 / p_exchange_rate, 6) ELSE p_exchange_rate END;
  ELSE
    IF COALESCE(p_exchange_rate, 0) <= 0 THEN
      RAISE EXCEPTION 'invalid_currency_rate: سعر الصرف يجب أن يكون أكبر من صفر' USING ERRCODE = '23514';
    END IF;
    v_eff_rate := p_exchange_rate;
  END IF;

  IF p_branch_id IS NOT NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
    WHERE company_id = v_company_id AND branch_id = p_branch_id AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC LIMIT 1;
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

  IF p_party_id IS NOT NULL THEN
    SELECT name INTO v_party_name FROM public.parties WHERE id = p_party_id AND company_id = v_company_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric,
      warehouse_id uuid, cost_price numeric, discount_amount numeric)
  LOOP
    IF COALESCE(v_item.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'الكمية المدخلة غير صحيحة (%) للصنف', v_item.quantity;
    END IF;

    SELECT name_ar, sku, sale_price, COALESCE(NULLIF(cost_price, 0), purchase_price, 0)
    INTO v_product_name, v_product_sku, v_db_price, v_db_cost
    FROM public.products
    WHERE id = v_item.product_id AND company_id = v_company_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'الصنف المحدد غير مسجل في بيانات المنشأة';
    END IF;

    v_unit_base := ROUND(v_item.unit_price * v_eff_rate, 4);

    IF v_currency = 'SAR' AND v_db_price > 0 AND v_item.unit_price >= 1500 AND (v_item.unit_price / v_db_price) >= 25 THEN
      RAISE EXCEPTION 'currency_inversion_detected: سعر الوحدة المدخل (% ر.س) للصنف "%" أعلى من سعر الكتالوج (% ر.س) بأكثر من 25 ضعفاً. يبدو أن السعر مدخل بالريال اليمني ولكن تم حفظ العملة كالريال السعودي.',
        ROUND(v_item.unit_price, 2), COALESCE(v_product_name, v_product_sku), ROUND(v_db_price, 2)
        USING ERRCODE = '23514';
    END IF;

    IF COALESCE(v_user_role, 'viewer') NOT IN ('owner', 'admin') AND NOT is_super_admin() THEN
      v_min_allowed_price := v_db_price * 0.7;
      IF v_unit_base < v_min_allowed_price THEN
        RAISE EXCEPTION 'سعر البيع (% ر.س) أقل من الحد الأدنى المسموح به (% ر.س) للصنف "%"',
          ROUND(v_unit_base, 2), ROUND(v_min_allowed_price, 2), COALESCE(v_product_name, v_product_sku);
      END IF;
    END IF;

    IF v_item.tax_rate IS NOT NULL AND (v_item.tax_rate < 0 OR v_item.tax_rate > 100) THEN
      RAISE EXCEPTION 'نسبة الضريبة غير صحيحة (%) للصنف "%"', v_item.tax_rate, COALESCE(v_product_name, v_product_sku);
    END IF;

    v_line_net   := GREATEST(0, v_item.quantity * v_item.unit_price - COALESCE(v_item.discount_amount, 0));
    v_line_tax   := COALESCE(round(v_line_net * COALESCE(v_item.tax_rate, 0) / 100, 4), 0);
    v_line_total := round(v_line_net + v_line_tax, 2);

    v_doc_subtotal := v_doc_subtotal + round(v_line_net, 2);
    v_doc_discount := v_doc_discount + COALESCE(v_item.discount_amount, 0);
    v_doc_tax      := v_doc_tax + round(v_line_tax, 2);
    v_doc_total    := v_doc_total + v_line_total;
  END LOOP;

  v_base_total    := ROUND(v_doc_total * v_eff_rate, 2);
  v_base_tax      := ROUND(v_doc_tax * v_eff_rate, 2);
  v_base_discount := ROUND(v_doc_discount * v_eff_rate, 2);
  v_base_subtotal := ROUND(v_base_total - v_base_tax, 2);

  v_invoice_number := public.generate_invoice_number(v_company_id, 'sale', p_branch_id);

  v_is_cash := coalesce(p_payment_type, 'cash') <> 'credit';

  IF v_is_cash THEN
    v_actual_paid := v_base_total;
    v_status := 'paid';
  ELSE
    v_actual_paid := LEAST(v_base_total, ROUND(GREATEST(0, COALESCE(p_paid_amount, 0)) * v_eff_rate, 2));
    IF v_actual_paid >= v_base_total AND v_base_total > 0 THEN
      v_status := 'paid';
    ELSIF v_actual_paid > 0 THEN
      v_status := 'partially_paid';
    ELSE
      v_status := 'posted';
    END IF;
  END IF;

  INSERT INTO public.invoices (
    company_id, invoice_number, party_id, issue_date, due_date,
    subtotal_document_amount, total_document_amount,
    subtotal, total_amount, tax_amount, discount_amount,
    payment_method, payment_account_id, status, notes, type,
    created_by, currency_code, exchange_rate, idempotency_key, branch_id, paid_amount
  ) VALUES (
    v_company_id, v_invoice_number, p_party_id, p_invoice_date, p_due_date,
    0, 0,
    0, 0, 0, 0,
    p_payment_type, p_payment_account_id,
    'draft', p_notes, 'sale',
    v_user_id, v_currency, v_eff_rate, p_idempotency_key, p_branch_id,
    0
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric,
      warehouse_id uuid, cost_price numeric, discount_amount numeric)
  LOOP
    v_target_wh_id := COALESCE(v_item.warehouse_id, v_warehouse_id);

    SELECT COALESCE(NULLIF(ps.weighted_avg_cost, 0), NULLIF(p.cost_price, 0), NULLIF(p.purchase_price, 0), 0)
    INTO v_sale_cost
    FROM public.products p
    LEFT JOIN public.product_stock ps
      ON ps.product_id = p.id
     AND ps.warehouse_id = v_target_wh_id
     AND ps.company_id = v_company_id
    WHERE p.id = v_item.product_id AND p.company_id = v_company_id;

    v_line_net   := GREATEST(0, v_item.quantity * v_item.unit_price - COALESCE(v_item.discount_amount, 0));
    v_line_tax   := COALESCE(round(v_line_net * COALESCE(v_item.tax_rate, 0) / 100, 4), 0);
    v_line_total := round(v_line_net + v_line_tax, 2);

    -- When product has no cost price (<= 0), treat 80% of actual net sale price as cost (20% profit).
    v_net_unit_base := CASE
      WHEN v_item.quantity > 0 THEN ROUND((v_line_net / v_item.quantity) * v_eff_rate, 4)
      ELSE ROUND(COALESCE(v_item.unit_price, 0) * v_eff_rate, 4)
    END;
    v_sale_cost := COALESCE(v_sale_cost, 0);
    IF v_sale_cost <= 0 AND v_net_unit_base > 0 THEN
      v_sale_cost := ROUND(v_net_unit_base * 0.80, 4);
    END IF;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, cost_price,
      discount_amount, tax_amount, total, company_id
    ) VALUES (
      v_invoice_id, v_item.product_id, v_item.quantity, v_item.unit_price,
      v_sale_cost,
      COALESCE(v_item.discount_amount, 0),
      v_line_tax,
      v_line_total, v_company_id
    );

    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity, transaction_type,
      reference_type, reference_id, unit_cost, total_cost, created_by
    ) VALUES (
      v_company_id, v_item.product_id, v_target_wh_id,
      -ABS(v_item.quantity), 'sales', 'sales_invoice', v_invoice_id,
      v_sale_cost,
      ROUND(ABS(v_item.quantity) * v_sale_cost, 4),
      v_user_id
    );

    -- Auto-update product catalog sale_price (in base currency SAR) to last sold price.
    v_last_sale_price_base := ROUND(COALESCE(v_item.unit_price, 0) * v_eff_rate, 2);
    IF v_last_sale_price_base > 0 THEN
      UPDATE public.products
      SET sale_price = v_last_sale_price_base,
          updated_at = now()
      WHERE id = v_item.product_id
        AND company_id = v_company_id
        AND deleted_at IS NULL
        AND COALESCE(sale_price, 0) IS DISTINCT FROM v_last_sale_price_base;
    END IF;
  END LOOP;

  PERFORM set_config('app.rpc_authorized', 'true', true);

  UPDATE public.invoices
  SET subtotal_document_amount = v_doc_subtotal,
      total_document_amount    = v_doc_total,
      subtotal                 = v_base_subtotal,
      tax_amount               = v_base_tax,
      discount_amount          = v_base_discount,
      total_amount             = v_base_total,
      status                   = v_status,
      paid_amount              = v_actual_paid,
      advance_payment          = v_actual_paid
  WHERE id = v_invoice_id;

  RETURN v_invoice_id;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$;

-- 4. fn_process_cross_branch_sale (80% implied cost for zero-cost products + auto sale_price)
CREATE OR REPLACE FUNCTION public.fn_process_cross_branch_sale(
  p_company_id uuid,
  p_seller_branch_id uuid,
  p_source_warehouse_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_payment_type text,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_source_branch_id uuid;
  v_item record;
  v_cost_price numeric;
  v_avail_qty numeric;
  v_internal_sale_id uuid;
  v_customer_sale_id uuid;
  v_total_cost numeric := 0;
  v_total_sale numeric := 0;
  v_inv_num_internal text;
  v_inv_num_customer text;
  v_acc_interbranch uuid;
  v_acc_inventory uuid;
  v_je_out_id uuid;
  v_je_in_id uuid;
  v_real_user_id uuid;
BEGIN
  v_real_user_id := auth.uid();
  IF v_real_user_id IS NULL OR p_user_id != v_real_user_id THEN
    RAISE EXCEPTION 'Unauthorized: User ID mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM public.fn_assert_company_access(p_company_id);

  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_seller_branch_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'Unauthorized: Seller branch does not belong to the specified company';
  END IF;

  SELECT branch_id INTO v_source_branch_id
  FROM public.warehouses
  WHERE id = p_source_warehouse_id AND company_id = p_company_id AND deleted_at IS NULL;

  IF v_source_branch_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse does not belong to a specific branch or does not exist.';
  END IF;

  IF v_source_branch_id = p_seller_branch_id THEN
    RAISE EXCEPTION 'Not a cross-branch sale. Source and Seller branches are the same.';
  END IF;

  SELECT id INTO v_acc_interbranch FROM public.accounts WHERE company_id = p_company_id AND code = '3300' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_acc_inventory FROM public.accounts WHERE company_id = p_company_id AND code = '1200' AND deleted_at IS NULL LIMIT 1;

  IF v_acc_interbranch IS NULL OR v_acc_inventory IS NULL THEN
    RAISE EXCEPTION 'Required accounts (3300 Inter-branch or 1200 Inventory) are missing.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('invoice_number:' || p_company_id::text || ':sale'));
  v_inv_num_internal := public.generate_invoice_number(p_company_id, 'sale', v_source_branch_id);
  v_inv_num_customer := public.generate_invoice_number(p_company_id, 'sale', p_seller_branch_id);

  INSERT INTO public.invoices (
    id, company_id, branch_id, type, party_id, issue_date, due_date,
    subtotal_document_amount, total_document_amount, subtotal, total_amount,
    currency_code, exchange_rate, status, payment_method, created_by, invoice_number, notes
  ) VALUES (
    gen_random_uuid(), p_company_id, v_source_branch_id, 'sale', NULL, CURRENT_DATE, CURRENT_DATE,
    0, 0, 0, 0,
    'SAR', 1, 'draft', 'credit', v_real_user_id, v_inv_num_internal || '-INT', 'مبيعات داخلية لفرع آخر'
  ) RETURNING id INTO v_internal_sale_id;

  INSERT INTO public.invoices (
    id, company_id, branch_id, type, party_id, issue_date, due_date,
    subtotal_document_amount, total_document_amount, subtotal, total_amount,
    currency_code, exchange_rate, status, payment_method, created_by, invoice_number, notes
  ) VALUES (
    gen_random_uuid(), p_company_id, p_seller_branch_id, 'sale', p_customer_id, CURRENT_DATE, CURRENT_DATE,
    0, 0, 0, 0,
    'SAR', 1, 'draft', p_payment_type, v_real_user_id, v_inv_num_customer, 'مبيعات بضاعة من مستودع فرع آخر'
  ) RETURNING id INTO v_customer_sale_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity numeric, sale_price numeric)
  LOOP
    IF COALESCE(v_item.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر';
    END IF;

    SELECT COALESCE(ps.quantity, 0), ps.weighted_avg_cost
    INTO v_avail_qty, v_cost_price
    FROM public.product_stock ps
    WHERE ps.product_id = v_item.product_id AND ps.warehouse_id = p_source_warehouse_id
    FOR UPDATE;

    IF COALESCE(v_avail_qty, 0) < v_item.quantity THEN
      RAISE EXCEPTION 'الكمية المتوفرة في مستودع الفرع المصدر (%) غير كافية للمنتج (%)',
        COALESCE(v_avail_qty, 0), v_item.product_id;
    END IF;

    IF v_cost_price IS NULL OR v_cost_price = 0 THEN
      SELECT COALESCE(NULLIF(cost_price, 0), NULLIF(purchase_price, 0), 0) INTO v_cost_price
      FROM public.products WHERE id = v_item.product_id;
    END IF;
    v_cost_price := COALESCE(v_cost_price, 0);
    IF v_cost_price <= 0 AND COALESCE(v_item.sale_price, 0) > 0 THEN
      v_cost_price := ROUND(v_item.sale_price * 0.80, 4);
    END IF;

    v_total_cost := v_total_cost + ROUND(v_cost_price * v_item.quantity, 2);
    v_total_sale := v_total_sale + ROUND(v_item.sale_price * v_item.quantity, 2);

    INSERT INTO public.invoice_items (invoice_id, product_id, quantity, unit_price, cost_price, total, company_id)
    VALUES (v_internal_sale_id, v_item.product_id, v_item.quantity, v_cost_price, v_cost_price, ROUND(v_cost_price * v_item.quantity, 2), p_company_id);

    INSERT INTO public.invoice_items (invoice_id, product_id, quantity, unit_price, cost_price, total, company_id)
    VALUES (v_customer_sale_id, v_item.product_id, v_item.quantity, v_item.sale_price, v_cost_price, ROUND(v_item.sale_price * v_item.quantity, 2), p_company_id);

    INSERT INTO public.inventory_transactions (company_id, product_id, warehouse_id, quantity, transaction_type, reference_type, reference_id, unit_cost, total_cost, created_by)
    VALUES (p_company_id, v_item.product_id, p_source_warehouse_id, -ABS(v_item.quantity), 'sales', 'invoice', v_internal_sale_id, v_cost_price, ROUND(ABS(v_item.quantity) * v_cost_price, 4), v_real_user_id);

    -- Auto-update product catalog sale_price (in SAR) to last sold price.
    IF COALESCE(v_item.sale_price, 0) > 0 THEN
      UPDATE public.products
      SET sale_price = ROUND(v_item.sale_price, 2),
          updated_at = now()
      WHERE id = v_item.product_id
        AND company_id = p_company_id
        AND deleted_at IS NULL
        AND COALESCE(sale_price, 0) IS DISTINCT FROM ROUND(v_item.sale_price, 2);
    END IF;
  END LOOP;

  PERFORM set_config('app.rpc_authorized', 'true', true);

  UPDATE public.invoices
  SET subtotal_document_amount = v_total_cost,
      total_document_amount    = v_total_cost,
      subtotal                 = v_total_cost,
      total_amount             = v_total_cost,
      status                   = 'approved'
  WHERE id = v_internal_sale_id;

  UPDATE public.invoices
  SET subtotal_document_amount = v_total_sale,
      total_document_amount    = v_total_sale,
      subtotal                 = v_total_sale,
      total_amount             = v_total_sale,
      paid_amount              = CASE WHEN p_payment_type = 'cash' THEN v_total_sale ELSE 0 END,
      advance_payment          = CASE WHEN p_payment_type = 'cash' THEN v_total_sale ELSE 0 END,
      status                   = CASE WHEN p_payment_type = 'cash' THEN 'paid' ELSE 'posted' END
  WHERE id = v_customer_sale_id;

  IF v_total_cost > 0 THEN
    INSERT INTO public.journal_entries (company_id, branch_id, entry_date, reference_type, reference_id, description, status, created_by)
    VALUES (p_company_id, v_source_branch_id, CURRENT_DATE, 'cross_branch_transfer', v_internal_sale_id, 'نقل داخلي مباع لفرع آخر', 'draft', v_real_user_id)
    RETURNING id INTO v_je_out_id;

    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, description)
    VALUES
      (v_je_out_id, v_acc_interbranch, p_company_id, v_source_branch_id, v_total_cost, 0, 'استحقاق على فرع آخر'),
      (v_je_out_id, v_acc_inventory, p_company_id, v_source_branch_id, 0, v_total_cost, 'إخراج مخزون للفرع الآخر');

    UPDATE public.journal_entries SET status = 'posted' WHERE id = v_je_out_id;

    INSERT INTO public.journal_entries (company_id, branch_id, entry_date, reference_type, reference_id, description, status, created_by)
    VALUES (p_company_id, p_seller_branch_id, CURRENT_DATE, 'cross_branch_transfer', v_internal_sale_id, 'استلام نقل داخلي مباع', 'draft', v_real_user_id)
    RETURNING id INTO v_je_in_id;

    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, description)
    VALUES
      (v_je_in_id, v_acc_inventory, p_company_id, p_seller_branch_id, v_total_cost, 0, 'إدخال مخزون من فرع آخر'),
      (v_je_in_id, v_acc_interbranch, p_company_id, p_seller_branch_id, 0, v_total_cost, 'التزام لفرع آخر');

    UPDATE public.journal_entries SET status = 'posted' WHERE id = v_je_in_id;
  END IF;

  PERFORM pg_notify(
    'branch_notifications',
    json_build_object(
      'company_id', p_company_id,
      'source_branch_id', v_source_branch_id,
      'seller_branch_id', p_seller_branch_id,
      'invoice_id', v_customer_sale_id,
      'internal_invoice_id', v_internal_sale_id,
      'total_cost', v_total_cost,
      'total_sale', v_total_sale,
      'type', 'cross_branch_sale'
    )::text
  );

  RETURN v_customer_sale_id;
END;
$function$;

-- 5. commit_sale_return (symmetric 80% implied cost fallback when zero cost)
CREATE OR REPLACE FUNCTION public.commit_sale_return(
  p_company_id uuid,
  p_user_id uuid,
  p_party_id uuid,
  p_items jsonb,
  p_exchange_rate numeric DEFAULT 1.0,
  p_currency text DEFAULT 'SAR'::text,
  p_reference_invoice_id uuid DEFAULT NULL::uuid,
  p_return_reason text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid                  uuid := auth.uid();
  v_invoice_id           uuid;
  v_invoice_number       text;
  v_currency             text;
  v_eff_rate             numeric;
  v_doc_subtotal         numeric(18,2) := 0;
  v_doc_total            numeric(18,2) := 0;
  v_base_total           numeric(18,2) := 0;
  v_item                 jsonb;
  v_product              record;
  v_primary_wh_id        uuid;
  v_journal_id           uuid;
  v_qty                  numeric;
  v_unit_price           numeric;
  v_line_total           numeric;
  v_original_cost        numeric;
  v_unit_cost_for_txn    numeric;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM user_company_roles ucr
    WHERE ucr.user_id = v_uid AND ucr.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'لا توجد أصناف في مرتجع المبيعات';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fiscal_years
    WHERE company_id = p_company_id
      AND current_date BETWEEN start_date AND end_date
      AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'التاريخ يقع خارج سنة مالية مفتوحة';
  END IF;

  v_currency := UPPER(TRIM(COALESCE(NULLIF(p_currency, ''), 'SAR')));
  IF v_currency = 'SAR' THEN
    v_eff_rate := 1;
  ELSIF v_currency = 'YER' THEN
    IF COALESCE(p_exchange_rate, 0) <= 0 OR p_exchange_rate = 1 THEN
      RAISE EXCEPTION 'سعر صرف الريال اليمني غير صالح (%)' , p_exchange_rate USING ERRCODE = '23514';
    END IF;
    v_eff_rate := CASE WHEN p_exchange_rate > 1 THEN ROUND(1.0 / p_exchange_rate, 6) ELSE p_exchange_rate END;
  ELSE
    v_eff_rate := COALESCE(NULLIF(p_exchange_rate, 0), 1);
  END IF;

  IF p_branch_id IS NOT NULL THEN
    SELECT id INTO v_primary_wh_id FROM warehouses
    WHERE company_id = p_company_id AND branch_id = p_branch_id AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC LIMIT 1;
  END IF;
  IF v_primary_wh_id IS NULL THEN
    SELECT id INTO v_primary_wh_id FROM warehouses
    WHERE company_id=p_company_id AND is_primary=true AND deleted_at IS NULL LIMIT 1;
  END IF;
  IF v_primary_wh_id IS NULL THEN
    SELECT id INTO v_primary_wh_id FROM warehouses
    WHERE company_id=p_company_id AND deleted_at IS NULL LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM accounts WHERE company_id=p_company_id AND code='1100') THEN
    RAISE EXCEPTION 'حساب المدينون (1100) مفقود';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE company_id=p_company_id AND code='4100') THEN
    RAISE EXCEPTION 'حساب الإيرادات (4100) مفقود';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('invoice_number:' || p_company_id::text || ':sale_return'));
  v_invoice_number := get_next_invoice_number(p_company_id, 'RSL');

  INSERT INTO invoices(
    company_id, party_id, invoice_number, type, status,
    notes, created_by, currency_code, exchange_rate,
    reference_invoice_id, return_reason,
    subtotal_document_amount, total_document_amount,
    subtotal, tax_amount, total_amount, paid_amount, payment_method,
    branch_id
  ) VALUES (
    p_company_id, p_party_id, v_invoice_number, 'sale_return', 'draft',
    p_notes, v_uid, v_currency, v_eff_rate,
    p_reference_invoice_id, p_return_reason,
    0, 0,
    0, 0, 0, 0, 'credit',
    p_branch_id
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM products
    WHERE id=(v_item->>'product_id')::uuid AND company_id=p_company_id AND deleted_at IS NULL;
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'المنتج غير موجود: %', v_item->>'product_id';
    END IF;

    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'كمية الإرجاع يجب أن تكون أكبر من صفر';
    END IF;

    v_unit_price := COALESCE((v_item->>'unit_price')::numeric, v_product.sale_price);
    v_line_total := ROUND(v_qty * v_unit_price, 2);

    v_original_cost := NULL;
    IF p_reference_invoice_id IS NOT NULL THEN
      SELECT NULLIF(ii.cost_price, 0) INTO v_original_cost FROM invoice_items ii
      WHERE ii.invoice_id = p_reference_invoice_id AND ii.product_id = v_product.id LIMIT 1;
    END IF;
    v_unit_cost_for_txn := COALESCE(v_original_cost, NULLIF(v_product.cost_price, 0), NULLIF(v_product.purchase_price, 0), 0);
    IF v_unit_cost_for_txn <= 0 AND COALESCE(v_unit_price, 0) > 0 THEN
      v_unit_cost_for_txn := ROUND(v_unit_price * v_eff_rate * 0.80, 4);
    END IF;

    INSERT INTO invoice_items(
      invoice_id, product_id, description, quantity,
      unit_price, cost_price, tax_amount, total, company_id
    ) VALUES (
      v_invoice_id, v_product.id, v_product.name_ar, v_qty,
      v_unit_price, v_unit_cost_for_txn,
      0, v_line_total, p_company_id
    );

    INSERT INTO inventory_transactions(
      company_id, product_id, warehouse_id, quantity,
      transaction_type, reference_type, reference_id, created_by,
      unit_cost, total_cost
    ) VALUES (
      p_company_id, v_product.id, v_primary_wh_id, v_qty,
      'sales_return', 'invoice', v_invoice_id, v_uid,
      v_unit_cost_for_txn, ROUND(v_qty * v_unit_cost_for_txn, 4)
    );

    v_doc_subtotal := v_doc_subtotal + v_line_total;
  END LOOP;

  v_doc_total  := v_doc_subtotal;
  v_base_total := ROUND(v_doc_total * v_eff_rate, 2);

  PERFORM set_config('app.rpc_authorized', 'true', true);

  UPDATE invoices
  SET subtotal_document_amount = v_doc_subtotal,
      total_document_amount    = v_doc_total,
      subtotal                 = v_base_total,
      tax_amount               = 0,
      total_amount             = v_base_total,
      status                   = 'posted'
  WHERE id = v_invoice_id;

  SELECT je.id INTO v_journal_id
  FROM journal_entries je
  WHERE je.reference_id = v_invoice_id
    AND je.reference_type = 'sales_return'
    AND je.deleted_at IS NULL
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    RAISE EXCEPTION 'فشل الترحيل المحاسبي التلقائي لمرتجع المبيعات % - لم يُنشأ أي قيد', v_invoice_number;
  END IF;

  RETURN jsonb_build_object(
    'id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'total_base', v_base_total,
    'total_document_amount', v_doc_total,
    'currency', v_currency,
    'status', 'posted'
  );
END;
$function$;

-- 6. process_sales_return (symmetric 80% implied cost fallback when zero cost)
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
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_return_invoice_id  UUID;
  v_invoice_number     TEXT;
  v_branch_id          UUID;
  v_orig_currency      TEXT;
  v_orig_rate          NUMERIC;
  v_effective_currency TEXT;
  v_effective_rate     NUMERIC;
  v_doc_subtotal       NUMERIC := 0;
  v_doc_total          NUMERIC := 0;
  v_base_subtotal      NUMERIC := 0;
  v_base_total         NUMERIC := 0;
  v_warehouse_id       UUID;
  v_item               RECORD;
  v_catalog_sale       NUMERIC;
  v_catalog_cost       NUMERIC;
  v_orig_cost          NUMERIC;
  v_item_cost          NUMERIC;
  v_prod_name          TEXT;
  v_unit_sar           NUMERIC;
  v_orig_qty           NUMERIC;
  v_prev_returned      NUMERIC;
  v_effective_company  UUID;
  v_effective_user     UUID;
  v_effective_party    UUID := p_party_id;
BEGIN
  v_effective_user := COALESCE(auth.uid(), p_user_id);
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

  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_years
    WHERE company_id = v_effective_company
      AND p_issue_date BETWEEN start_date AND end_date
      AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'التاريخ يقع خارج سنة مالية مفتوحة';
  END IF;

  IF p_invoice_id IS NOT NULL THEN
    SELECT branch_id, currency_code, exchange_rate, COALESCE(party_id, v_effective_party)
    INTO v_branch_id, v_orig_currency, v_orig_rate, v_effective_party
    FROM public.invoices
    WHERE id = p_invoice_id AND company_id = v_effective_company AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'الفاتورة الأصلية المرجعية غير موجودة أو لا تنتمي لهذه المنشأة';
    END IF;

    v_effective_currency := UPPER(TRIM(COALESCE(v_orig_currency, p_currency_code, 'SAR')));
    v_effective_rate     := COALESCE(v_orig_rate, p_exchange_rate, 1);
  ELSE
    v_effective_currency := UPPER(TRIM(COALESCE(p_currency_code, 'SAR')));
    v_effective_rate     := COALESCE(p_exchange_rate, 1);
  END IF;

  IF v_effective_currency = 'SAR' THEN
    v_effective_rate := 1;
  ELSIF v_effective_currency = 'YER' THEN
    IF COALESCE(v_effective_rate, 0) <= 0 OR v_effective_rate = 1 THEN
      RAISE EXCEPTION 'سعر صرف الريال اليمني للمرتجع غير صالح (%)', v_effective_rate;
    END IF;
    IF v_effective_rate > 1 THEN
      v_effective_rate := ROUND(1.0 / v_effective_rate, 6);
    END IF;
    IF v_effective_rate < 0.0001 OR v_effective_rate > 0.02 THEN
      RAISE EXCEPTION 'سعر صرف الريال اليمني للمرتجع خارج النطاق المنطقي (%)', v_effective_rate;
    END IF;
  ELSIF COALESCE(v_effective_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'سعر الصرف للمرتجع يجب أن يكون أكبر من صفر';
  END IF;

  SELECT id INTO v_warehouse_id
  FROM public.warehouses
  WHERE company_id = v_effective_company AND (v_branch_id IS NULL OR branch_id = v_branch_id) AND deleted_at IS NULL
  ORDER BY is_primary DESC, created_at ASC
  LIMIT 1;
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id
    FROM public.warehouses
    WHERE company_id = v_effective_company AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('invoice_number:' || v_effective_company::text || ':sale_return'));
  v_invoice_number := public.generate_invoice_number(v_effective_company, 'sale_return', v_branch_id);

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items)
      AS x(product_id uuid, quantity numeric, unit_price numeric, cost_price numeric, name text)
  LOOP
    IF COALESCE(v_item.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'كمية الإرجاع يجب أن تكون أكبر من صفر';
    END IF;

    IF COALESCE(v_item.unit_price, 0) < 0 THEN
      RAISE EXCEPTION 'سعر بند الإرجاع لا يمكن أن يكون سالباً';
    END IF;

    IF v_item.product_id IS NOT NULL THEN
      SELECT sale_price, COALESCE(NULLIF(cost_price, 0), purchase_price, 0), name_ar
      INTO v_catalog_sale, v_catalog_cost, v_prod_name
      FROM public.products
      WHERE id = v_item.product_id AND company_id = v_effective_company;

      IF FOUND AND COALESCE(v_catalog_sale, 0) >= 10 THEN
        v_unit_sar := v_item.unit_price * v_effective_rate;
        IF v_effective_currency = 'SAR' AND (v_item.unit_price / v_catalog_sale) > 40 THEN
          RAISE EXCEPTION 'السعر المدخل (%) مرتفع جداً مقارنة بكتالوج الصنف (%). تأكد من اختيار العملة المناسبة (YER vs SAR).',
            v_item.unit_price, v_catalog_sale;
        END IF;
        IF v_effective_currency = 'YER' AND v_unit_sar <= (v_catalog_sale / 20.0) THEN
          RAISE EXCEPTION 'السعر المدخل بالريال اليمني (% ≈ % ر.س) منخفض جداً مقارنة بسعر الصنف الأساسي (% ر.س). تأكد من إدخال السعر بالريال اليمني.',
            v_item.unit_price, ROUND(v_unit_sar, 2), v_catalog_sale;
        END IF;
      END IF;

      IF p_invoice_id IS NOT NULL THEN
        SELECT COALESCE(SUM(ii.quantity), 0) INTO v_orig_qty
        FROM public.invoice_items ii
        WHERE ii.invoice_id = p_invoice_id AND ii.product_id = v_item.product_id;

        IF v_orig_qty > 0 THEN
          SELECT COALESCE(SUM(ret_ii.quantity), 0) INTO v_prev_returned
          FROM public.invoices ret_inv
          JOIN public.invoice_items ret_ii ON ret_ii.invoice_id = ret_inv.id
          WHERE ret_inv.reference_invoice_id = p_invoice_id
            AND ret_inv.type IN ('sale_return', 'return_sale')
            AND ret_inv.status <> 'void'
            AND ret_inv.deleted_at IS NULL
            AND ret_ii.product_id = v_item.product_id;

          IF (v_item.quantity + v_prev_returned) > v_orig_qty THEN
            RAISE EXCEPTION 'كمية الإرجاع المطلوبة (%) تتجاوز الكمية المتبقية القابلة للإرجاع (%) للصنف "%"',
              v_item.quantity, GREATEST(0, v_orig_qty - v_prev_returned), COALESCE(v_prod_name, v_item.product_id::text);
          END IF;
        END IF;
      END IF;
    END IF;

    v_doc_subtotal := v_doc_subtotal + ROUND(v_item.quantity * v_item.unit_price, 2);
  END LOOP;

  v_doc_total     := v_doc_subtotal;
  v_base_total    := ROUND(v_doc_total * v_effective_rate, 2);
  v_base_subtotal := v_base_total;

  INSERT INTO public.invoices (
    company_id, invoice_number, type, status, party_id,
    issue_date, due_date,
    subtotal_document_amount, total_document_amount,
    total_amount, subtotal, tax_amount, discount_amount,
    notes, payment_method, currency_code, exchange_rate,
    reference_invoice_id, return_reason, branch_id, created_by
  ) VALUES (
    v_effective_company, v_invoice_number, 'sale_return', 'draft', v_effective_party,
    p_issue_date, p_issue_date,
    0, 0,
    0, 0, 0, 0,
    p_notes, p_payment_method, v_effective_currency, v_effective_rate,
    p_invoice_id, p_return_reason, v_branch_id, v_effective_user
  ) RETURNING id INTO v_return_invoice_id;

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items)
      AS x(product_id uuid, quantity numeric, unit_price numeric, cost_price numeric, name text)
  LOOP
    v_orig_cost    := NULL;
    v_catalog_cost := NULL;
    v_prod_name    := NULL;

    IF v_item.product_id IS NOT NULL THEN
      IF p_invoice_id IS NOT NULL THEN
        SELECT NULLIF(ii.cost_price, 0) INTO v_orig_cost
        FROM public.invoice_items ii
        WHERE ii.invoice_id = p_invoice_id AND ii.product_id = v_item.product_id
        LIMIT 1;
      END IF;

      SELECT p.name_ar, COALESCE(NULLIF(ps.weighted_avg_cost, 0), NULLIF(p.cost_price, 0), NULLIF(p.purchase_price, 0), 0)
      INTO v_prod_name, v_catalog_cost
      FROM public.products p
      LEFT JOIN public.product_stock ps
        ON ps.product_id = p.id AND ps.warehouse_id = v_warehouse_id AND ps.company_id = v_effective_company
      WHERE p.id = v_item.product_id AND p.company_id = v_effective_company;
    END IF;

    v_item_cost := COALESCE(v_orig_cost, NULLIF(v_item.cost_price, 0), NULLIF(v_catalog_cost, 0), 0);
    IF v_item_cost <= 0 AND COALESCE(v_item.unit_price, 0) > 0 THEN
      v_item_cost := ROUND(v_item.unit_price * v_effective_rate * 0.80, 4);
    END IF;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, description, quantity,
      unit_price, total, cost_price, tax_amount, company_id
    ) VALUES (
      v_return_invoice_id,
      v_item.product_id,
      COALESCE(NULLIF(BTRIM(COALESCE(v_item.name, '')), ''), v_prod_name, ''),
      v_item.quantity,
      v_item.unit_price,
      ROUND(v_item.quantity * v_item.unit_price, 2),
      v_item_cost,
      0,
      v_effective_company
    );

    IF p_status = 'posted' AND v_item.product_id IS NOT NULL AND v_warehouse_id IS NOT NULL THEN
      INSERT INTO public.inventory_transactions (
        company_id, product_id, warehouse_id, quantity,
        transaction_type, reference_type, reference_id, created_by,
        unit_cost, total_cost
      ) VALUES (
        v_effective_company, v_item.product_id, v_warehouse_id, ABS(v_item.quantity),
        'sales_return', 'invoice', v_return_invoice_id, v_effective_user,
        v_item_cost, ROUND(ABS(v_item.quantity) * v_item_cost, 4)
      );
    END IF;
  END LOOP;

  PERFORM set_config('app.rpc_authorized', 'true', true);

  UPDATE public.invoices
  SET subtotal_document_amount = v_doc_subtotal,
      total_document_amount    = v_doc_total,
      subtotal                 = v_base_subtotal,
      total_amount             = v_base_total,
      status                   = CASE WHEN p_status = 'posted' THEN 'posted' ELSE status END
  WHERE id = v_return_invoice_id;

  IF p_status = 'posted' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.journal_entries
      WHERE reference_id = v_return_invoice_id
        AND reference_type = 'sales_return'
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'فشل الترحيل المحاسبي التلقائي لمرتجع المبيعات % - لم يُنشأ أي قيد',
        v_invoice_number;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',               true,
    'id',                    v_return_invoice_id,
    'return_invoice_id',     v_return_invoice_id,
    'invoice_number',        v_invoice_number,
    'total_amount',          v_base_total,
    'total_document_amount', v_doc_total,
    'currency_code',         v_effective_currency,
    'exchange_rate',         v_effective_rate,
    'branch_id',             v_branch_id
  );
END;
$function$;
