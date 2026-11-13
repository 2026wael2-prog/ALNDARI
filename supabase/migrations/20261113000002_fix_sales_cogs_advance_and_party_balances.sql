-- ==============================================================================
-- P0 REMEDIATION:
-- 0. Re-enable user triggers on payments, journal_entry_lines, parties, journal_entries.
-- 1. commit_sales_invoice_v2: insert 'draft' first, store cost_price & advance_payment,
--    then update status so trg_auto_post_invoice_journal posts COGS/Inventory.
-- 2. process_sales_return: fallback v_branch_id to user_profiles.branch_id, insert
--    'draft' first then update status so COGS/Inventory reversal posts reliably.
-- 3. party_balances: convert party_opening_balances to base currency via fn_to_base_amount.
-- ==============================================================================

ALTER TABLE public.payments ENABLE TRIGGER USER;
ALTER TABLE public.journal_entry_lines ENABLE TRIGGER USER;
ALTER TABLE public.parties ENABLE TRIGGER USER;
ALTER TABLE public.journal_entries ENABLE TRIGGER USER;

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
  -- 1. Authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_company_id FROM public.user_profiles WHERE id = v_user_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User not associated with any company' USING ERRCODE = '42501';
  END IF;

  -- 2. Idempotency Check
  IF p_idempotency_key IS NOT NULL THEN
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

  -- 7. Lock and Validate Stock + Prices
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric, warehouse_id uuid)
  LOOP
    IF v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity (%) for product %', v_item.quantity, v_item.product_id;
    END IF;

    SELECT sale_price INTO v_db_price FROM public.products
    WHERE id = v_item.product_id AND company_id = v_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found in company', v_item.product_id;
    END IF;

    SELECT ps.quantity, ps.warehouse_id INTO v_stock_record
    FROM public.product_stock ps
    WHERE ps.product_id = v_item.product_id
      AND ps.warehouse_id = COALESCE(v_item.warehouse_id, v_warehouse_id)
      AND ps.company_id = v_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No stock record found for product % in warehouse %', v_item.product_id, COALESCE(v_item.warehouse_id, v_warehouse_id);
    END IF;

    IF v_stock_record.quantity < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
        v_item.product_id, v_stock_record.quantity, v_item.quantity;
    END IF;

    v_line_total := v_item.quantity * v_item.unit_price;
    v_total_amount := v_total_amount + v_line_total;
    v_total_tax := v_total_tax + COALESCE(v_line_total * COALESCE(v_item.tax_rate, 0) / 100, 0);
  END LOOP;

  -- 8. Wael Branch SAR Anomaly Guard
  IF p_branch_id IS NOT NULL THEN
    SELECT name INTO v_branch_name FROM public.branches WHERE id = p_branch_id;
    IF (v_branch_name ILIKE '%وائل%' OR v_branch_name ILIKE '%النظاري%')
       AND v_effective_currency = 'SAR' AND (v_total_amount >= 5000 OR EXISTS (
         SELECT 1 FROM jsonb_to_recordset(p_items) AS x(unit_price numeric) WHERE x.unit_price >= 1000
       ))
       AND COALESCE(p_notes, '') NOT ILIKE '%[SAR_CONFIRMED]%' THEN
      RAISE EXCEPTION 'خطأ تدقيق العملة: تم إدخال مبالغ تتجاوز 5,000 بالريال السعودي في فرع وائل (المتعامل باليمني). تأكد من اختيار العملة (YER) وسعر الصرف.'
      USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 9. Generate Invoice Number with branch scoping
  v_invoice_number := public.generate_invoice_number(v_company_id, 'sale', p_branch_id);

  v_is_cash := COALESCE(p_payment_type, 'cash') <> 'credit';
  IF v_is_cash THEN
    v_actual_paid := v_total_amount + v_total_tax;
  ELSE
    v_actual_paid := LEAST(COALESCE(p_paid_amount, 0), v_total_amount + v_total_tax);
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
    p_idempotency_key, p_branch_id, v_actual_paid, v_actual_paid
  ) RETURNING id INTO v_invoice_id;

  -- 11. Insert Invoice Items (with cost_price) and Deduct Stock
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


-- ==============================================================================
-- PART 2: PROCESS_SALES_RETURN (USER BRANCH FALLBACK + DRAFT-FIRST FOR COGS REVERSAL)
-- ==============================================================================
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
  v_effective_company UUID;
  v_effective_user    UUID;
  v_final_status      TEXT := COALESCE(NULLIF(TRIM(p_status), ''), 'posted');
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
    v_effective_currency := COALESCE(p_currency_code, 'SAR');
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

  -- 5. Validate Return Items against Original Invoice
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items)
    AS x(product_id UUID, quantity NUMERIC, unit_price NUMERIC, cost_price NUMERIC, description TEXT)
  LOOP
    IF v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'كمية المرتجع للصنف % غير صالحة (%)', v_item.product_id, v_item.quantity;
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

  -- 7. Insert Items and Restore Stock
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items)
    AS x(product_id UUID, quantity NUMERIC, unit_price NUMERIC, cost_price NUMERIC, description TEXT)
  LOOP
    SELECT cost_price INTO v_catalog_cost
    FROM public.products
    WHERE id = v_item.product_id AND company_id = v_effective_company;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, total,
      cost_price, description, company_id
    ) VALUES (
      v_return_invoice_id, v_item.product_id, v_item.quantity, v_item.unit_price,
      (v_item.quantity * v_item.unit_price), COALESCE(v_item.cost_price, v_catalog_cost, 0),
      v_item.description, v_effective_company
    );

    UPDATE public.product_stock
    SET quantity = quantity + v_item.quantity, updated_at = NOW()
    WHERE product_id = v_item.product_id
      AND warehouse_id = v_warehouse_id
      AND company_id = v_effective_company;

    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity, transaction_type,
      reference_type, reference_id, unit_cost, total_cost, created_by
    ) VALUES (
      v_effective_company, v_item.product_id, v_warehouse_id,
      v_item.quantity, 'sales_return', 'sale_return', v_return_invoice_id,
      COALESCE(v_item.cost_price, v_catalog_cost, 0),
      v_item.quantity * COALESCE(v_item.cost_price, v_catalog_cost, 0),
      v_effective_user
    );
  END LOOP;

  -- 8. Transition status from 'draft' -> final status so trg_auto_post_invoice_journal posts Revenue + COGS reversal
  IF v_final_status <> 'draft' THEN
    UPDATE public.invoices
    SET status = v_final_status,
        updated_at = NOW()
    WHERE id = v_return_invoice_id;
  END IF;

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


-- ==============================================================================
-- PART 3: MULTI-CURRENCY OPENING BALANCES IN PUBLIC.PARTY_BALANCES
-- ==============================================================================
CREATE OR REPLACE VIEW public.party_balances AS
WITH party_accts AS (
  SELECT a.id
  FROM public.accounts a
  WHERE a.deleted_at IS NULL
), journal_bals AS (
  SELECT jel.party_id,
    jel.company_id,
    sum(jel.debit_amount - jel.credit_amount)::numeric(14,2) AS journal_balance
  FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.deleted_at IS NULL AND jel.party_id IS NOT NULL AND je.status = 'posted'::text AND je.deleted_at IS NULL
  GROUP BY jel.party_id, jel.company_id
), opening_bals AS (
  SELECT ob_1.party_id,
    ob_1.company_id,
    sum(
      public.fn_to_base_amount(
        COALESCE(ob_1.currency_code, 'SAR'),
        CASE
          WHEN ob_1.direction::text = 'debit'::text THEN ob_1.amount
          ELSE -ob_1.amount
        END,
        COALESCE(
          er.rate_to_base,
          CASE WHEN UPPER(TRIM(COALESCE(ob_1.currency_code, 'SAR'))) = 'YER' THEN 410 ELSE 1 END
        )
      )
    )::numeric(14,2) AS opening_balance
  FROM public.party_opening_balances ob_1
  LEFT JOIN LATERAL (
    SELECT r.rate_to_base
    FROM public.exchange_rates r
    WHERE r.company_id = ob_1.company_id
      AND r.currency_code = ob_1.currency_code
    ORDER BY r.effective_date DESC NULLS LAST, r.created_at DESC NULLS LAST
    LIMIT 1
  ) er ON ob_1.currency_code IS NOT NULL AND UPPER(TRIM(ob_1.currency_code)) <> 'SAR'
  GROUP BY ob_1.party_id, ob_1.company_id
)
SELECT p.id AS party_id,
  p.company_id,
  p.type,
  (COALESCE(jb.journal_balance, 0::numeric) + COALESCE(ob.opening_balance, 0::numeric))::numeric(14,2) AS balance
FROM public.parties p
  LEFT JOIN journal_bals jb ON jb.party_id = p.id AND jb.company_id = p.company_id
  LEFT JOIN opening_bals ob ON ob.party_id = p.id AND ob.company_id = p.company_id
WHERE p.deleted_at IS NULL;
