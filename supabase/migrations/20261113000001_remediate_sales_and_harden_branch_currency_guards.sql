-- ==============================================================================
-- Migration: 20261113000001_remediate_sales_and_harden_branch_currency_guards.sql
-- Description:
--   1. Comprehensive remediation of corrupted sales invoices in Wael's branch:
--      - YER invoices incorrectly saved as SAR (inflated by ~410x).
--      - SAR invoices incorrectly saved as YER (crushed by ~410x).
--      - YER invoices with 1:1 or null exchange rates.
--   2. Complete synchronization and re-generation of General Ledger journal entries
--      for all remediated invoices, restoring financial statement integrity.
--   3. Permanent PostgreSQL Triggers and RPC guardrails that prevent recurrence
--      from ANY source: UI, REST API, RPC calls, or MCP AI agents.
-- ==============================================================================

-- ==============================================================================
-- PART 1: REMEDIATION OF EXISTING CORRUPTED SALES INVOICES & GL SYNC
-- ==============================================================================
DO $sales_remediation$
DECLARE
  v_rec RECORD;
  v_count_yer_as_sar INTEGER := 0;
  v_count_sar_as_yer INTEGER := 0;
  v_count_bad_rate   INTEGER := 0;
  v_total_remediated INTEGER := 0;
  v_default_yer_rate NUMERIC := 410;
  v_wael_branch_ids  UUID[];
BEGIN
  -- 1. Identify all branches associated with Wael / Al-Nadari
  SELECT array_agg(id) INTO v_wael_branch_ids
  FROM public.branches
  WHERE name ILIKE '%وائل%' OR name ILIKE '%النظاري%' OR code ILIKE '%WAEL%';

  -- 2. Group A: YER invoices recorded mistakenly as SAR in Wael's branch
  -- (Symptoms: currency = SAR, total >= 5000 or any item >= 1000 in auto parts)
  FOR v_rec IN
    SELECT i.id, i.company_id, i.invoice_number, i.total_amount
    FROM public.invoices i
    WHERE i.deleted_at IS NULL
      AND i.type = 'sale'
      AND i.status NOT IN ('void', 'cancelled')
      AND i.currency_code = 'SAR'
      AND (
        (i.branch_id = ANY(v_wael_branch_ids) AND i.total_amount >= 5000)
        OR EXISTS (
          SELECT 1 FROM public.invoice_items it
          WHERE it.invoice_id = i.id
            AND it.unit_price >= 1000
            AND (i.branch_id = ANY(v_wael_branch_ids) OR i.branch_id IS NULL)
        )
      )
  LOOP
    -- Look up latest company YER rate if available
    SELECT COALESCE(rate_to_base, v_default_yer_rate) INTO v_default_yer_rate
    FROM public.exchange_rates
    WHERE company_id = v_rec.company_id AND currency_code = 'YER'
    ORDER BY effective_date DESC LIMIT 1;

    -- Update invoice to correct currency YER and realistic exchange rate
    UPDATE public.invoices
    SET currency_code = 'YER',
        exchange_rate = v_default_yer_rate,
        updated_at = NOW()
    WHERE id = v_rec.id;

    -- Clean up stale inflated journal entries
    DELETE FROM public.journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM public.journal_entries
      WHERE reference_id = v_rec.id AND reference_type = 'sales_invoice'
    );
    DELETE FROM public.journal_entries
    WHERE reference_id = v_rec.id AND reference_type = 'sales_invoice';

    v_count_yer_as_sar := v_count_yer_as_sar + 1;
  END LOOP;

  -- 3. Group B: SAR invoices recorded mistakenly as YER (amounts < 500)
  FOR v_rec IN
    SELECT i.id, i.company_id, i.invoice_number
    FROM public.invoices i
    WHERE i.deleted_at IS NULL
      AND i.type = 'sale'
      AND i.status NOT IN ('void', 'cancelled')
      AND i.currency_code = 'YER'
      AND i.total_amount < 500
  LOOP
    UPDATE public.invoices
    SET currency_code = 'SAR',
        exchange_rate = 1,
        updated_at = NOW()
    WHERE id = v_rec.id;

    -- Clean up stale crushed journal entries
    DELETE FROM public.journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM public.journal_entries
      WHERE reference_id = v_rec.id AND reference_type = 'sales_invoice'
    );
    DELETE FROM public.journal_entries
    WHERE reference_id = v_rec.id AND reference_type = 'sales_invoice';

    v_count_sar_as_yer := v_count_sar_as_yer + 1;
  END LOOP;

  -- 4. Group C: YER invoices with rate 1, 0, or NULL
  FOR v_rec IN
    SELECT i.id, i.company_id, i.invoice_number
    FROM public.invoices i
    WHERE i.deleted_at IS NULL
      AND i.type = 'sale'
      AND i.status NOT IN ('void', 'cancelled')
      AND i.currency_code = 'YER'
      AND (i.exchange_rate IS NULL OR i.exchange_rate <= 1)
  LOOP
    SELECT COALESCE(rate_to_base, 410) INTO v_default_yer_rate
    FROM public.exchange_rates
    WHERE company_id = v_rec.company_id AND currency_code = 'YER'
    ORDER BY effective_date DESC LIMIT 1;

    UPDATE public.invoices
    SET exchange_rate = COALESCE(v_default_yer_rate, 410),
        updated_at = NOW()
    WHERE id = v_rec.id;

    DELETE FROM public.journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM public.journal_entries
      WHERE reference_id = v_rec.id AND reference_type = 'sales_invoice'
    );
    DELETE FROM public.journal_entries
    WHERE reference_id = v_rec.id AND reference_type = 'sales_invoice';

    v_count_bad_rate := v_count_bad_rate + 1;
  END LOOP;

  -- 5. Re-generate proper journal entries for all sales invoices missing journal entries
  FOR v_rec IN
    SELECT i.*
    FROM public.invoices i
    WHERE i.deleted_at IS NULL
      AND i.type = 'sale'
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND NOT EXISTS (
        SELECT 1 FROM public.journal_entries je
        WHERE je.reference_id = i.id AND je.deleted_at IS NULL
      )
  LOOP
    -- Trigger fn_auto_post_invoice_journal by updating status to its current status
    -- The trigger reads the updated currency_code and exchange_rate to build accurate lines
    UPDATE public.invoices
    SET status = v_rec.status,
        updated_at = NOW()
    WHERE id = v_rec.id;
    v_total_remediated := v_total_remediated + 1;
  END LOOP;

  RAISE NOTICE 'Sales Remediation Summary: YER-as-SAR fixed: %, SAR-as-YER fixed: %, Bad-rate fixed: %, Total GL re-posted: %',
    v_count_yer_as_sar, v_count_sar_as_yer, v_count_bad_rate, v_total_remediated;
END;
$sales_remediation$;


-- ==============================================================================
-- PART 2: PERMANENT BEFORE INSERT/UPDATE TRIGGER ON PUBLIC.INVOICES
-- ==============================================================================
-- Enforces data integrity regardless of whether input comes from UI, API, or MCP Agent.

CREATE OR REPLACE FUNCTION public.fn_guard_invoice_currency_sanity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_name TEXT;
  v_is_wael_branch BOOLEAN := FALSE;
  v_lookup_rate NUMERIC;
BEGIN
  -- 1. Check if invoice belongs to Wael's branch
  IF NEW.branch_id IS NOT NULL THEN
    SELECT name INTO v_branch_name FROM public.branches WHERE id = NEW.branch_id;
    IF v_branch_name ILIKE '%وائل%' OR v_branch_name ILIKE '%النظاري%' OR v_branch_name ILIKE '%WAEL%' THEN
      v_is_wael_branch := TRUE;
    END IF;
  END IF;

  -- 2. YER Exchange Rate Enforcement
  -- A rate of 1 or <= 0 for YER is catastrophically invalid (converts 100k YER to 100k SAR)
  IF UPPER(TRIM(COALESCE(NEW.currency_code, 'SAR'))) = 'YER' THEN
    IF NEW.exchange_rate IS NULL OR NEW.exchange_rate <= 1 THEN
      -- Auto-lookup company rate
      SELECT rate_to_base INTO v_lookup_rate
      FROM public.exchange_rates
      WHERE company_id = NEW.company_id AND currency_code = 'YER'
      ORDER BY effective_date DESC LIMIT 1;

      NEW.exchange_rate := COALESCE(v_lookup_rate, 410);
    END IF;
  END IF;

  -- 3. SAR Exchange Rate Normalization
  IF UPPER(TRIM(COALESCE(NEW.currency_code, 'SAR'))) = 'SAR' THEN
    NEW.exchange_rate := 1;

    -- 4. Strict Guard for Wael's Branch against accidental SAR inflation:
    -- If branch is Wael's branch, type is sale, and total_amount >= 5000 SAR:
    -- Require explicit confirmation flag [SAR_CONFIRMED] in notes
    IF v_is_wael_branch AND NEW.type = 'sale' AND NEW.total_amount >= 5000 THEN
      IF COALESCE(NEW.notes, '') NOT ILIKE '%[SAR_CONFIRMED]%' THEN
        RAISE EXCEPTION 'خطأ تدقيق العملة: تم إدخال فاتورة مبيعات بمبلغ كبير (>= 5,000 ر.س) بالريال السعودي في فرع وائل (المتعامل باليمني). تأكد من اختيار العملة (YER) وسعر الصرف. إذا كان المبلغ فعلاً بالريال السعودي أضف [SAR_CONFIRMED] في الملاحظات.'
        USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- 5. Business logic validations
  IF NEW.total_amount < 0 THEN
    RAISE EXCEPTION 'إجمالي الفاتورة لا يمكن أن يكون سالباً' USING ERRCODE = 'P0002';
  END IF;

  IF NEW.paid_amount < 0 THEN
    RAISE EXCEPTION 'المبلغ المدفوع لا يمكن أن يكون سالباً' USING ERRCODE = 'P0003';
  END IF;

  IF NEW.paid_amount > NEW.total_amount THEN
    RAISE EXCEPTION 'المبلغ المدفوع (%) لا يمكن أن يتجاوز إجمالي الفاتورة (%)', NEW.paid_amount, NEW.total_amount
    USING ERRCODE = 'P0004';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoice_currency_sanity ON public.invoices;
CREATE TRIGGER trg_guard_invoice_currency_sanity
BEFORE INSERT OR UPDATE OF currency_code, exchange_rate, total_amount, paid_amount, branch_id, notes
ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_invoice_currency_sanity();


-- ==============================================================================
-- PART 3: HARDENING COMMIT_SALES_INVOICE_V2 (AUTO WAREHOUSE & TREASURY)
-- ==============================================================================
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
  p_paid_amount numeric DEFAULT NULL::numeric
)
RETURNS jsonb
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
  v_available numeric;
  v_db_price numeric;
  v_min_allowed_price numeric;
  v_line_total numeric;
  v_total_amount numeric := 0;
  v_total_tax numeric := 0;
  v_warehouse_id uuid;
  v_stock_record record;
  v_party_name text;
  v_is_cash boolean;
  v_effective_rate numeric := COALESCE(p_exchange_rate, 1);
  v_effective_currency text := UPPER(TRIM(COALESCE(p_currency_code, 'SAR')));
  v_effective_payment_account uuid := p_payment_account_id;
  v_branch_name text;
  v_lookup_rate numeric;
  v_actual_paid numeric := 0;
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
    SELECT id, invoice_number INTO v_invoice_id, v_invoice_number
    FROM public.invoices
    WHERE company_id = v_company_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'status', 'idempotent_duplicate'
      );
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
    -- Try to find cashbox matching branch and currency
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

    -- Fallback to default company cash account for this currency
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

    -- Check stock with row lock
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

  -- 10. Insert Invoice Header
  INSERT INTO public.invoices (
    company_id, invoice_number, party_id, issue_date, due_date,
    total_amount, tax_amount, payment_method, payment_account_id,
    status, notes, type, created_by, currency_code, exchange_rate,
    idempotency_key, branch_id, paid_amount
  ) VALUES (
    v_company_id, v_invoice_number, p_party_id, p_invoice_date, p_due_date,
    v_total_amount + v_total_tax, v_total_tax, p_payment_type, v_effective_payment_account,
    CASE WHEN v_is_cash OR v_actual_paid >= (v_total_amount + v_total_tax) THEN 'paid'
         WHEN v_actual_paid > 0 THEN 'partially_paid'
         ELSE 'posted' END,
    p_notes, 'sale', v_user_id, v_effective_currency, v_effective_rate,
    p_idempotency_key, p_branch_id, v_actual_paid
  ) RETURNING id INTO v_invoice_id;

  -- 11. Insert Invoice Items and Deduct Stock
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric, warehouse_id uuid)
  LOOP
    v_line_total := v_item.quantity * v_item.unit_price;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, total, tax_amount, company_id
    ) VALUES (
      v_invoice_id, v_item.product_id, v_item.quantity, v_item.unit_price,
      v_line_total, ROUND(v_line_total * COALESCE(v_item.tax_rate, 0) / 100, 4), v_company_id
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
      v_item.unit_price, v_line_total, v_user_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'total_amount', v_total_amount + v_total_tax,
    'currency_code', v_effective_currency,
    'exchange_rate', v_effective_rate,
    'status', CASE WHEN v_is_cash OR v_actual_paid >= (v_total_amount + v_total_tax) THEN 'paid'
                   WHEN v_actual_paid > 0 THEN 'partially_paid'
                   ELSE 'posted' END
  );
END;
$function$;


-- ==============================================================================
-- PART 4: HARDENING PROCESS_SALES_RETURN (STRICT REFERENCE & PRICE VALIDATION)
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
  v_subtotal          NUMERIC := 0;
  v_cost_total        NUMERIC := 0;
  v_warehouse_id      UUID;
  v_item              RECORD;
  v_orig_item         RECORD;
  v_orig_sold_qty     NUMERIC;
  v_already_returned  NUMERIC;
  v_catalog_cost      NUMERIC;
  v_effective_company UUID;
  v_effective_user    UUID;
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

    -- Inherit branch, currency and rate from the original invoice
    v_effective_currency := COALESCE(v_orig_currency, 'SAR');
    v_effective_rate := COALESCE(v_orig_rate, 1);
  ELSE
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
      -- Ensure item existed in original invoice
      SELECT quantity, unit_price INTO v_orig_item
      FROM public.invoice_items
      WHERE invoice_id = p_invoice_id AND product_id = v_item.product_id
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'الصنف % لم يكن مدرجاً في فاتورة البيع الأصلية %', v_item.product_id, p_invoice_id;
      END IF;

      -- Check that return price matches sale price
      IF ABS(v_item.unit_price - v_orig_item.unit_price) > 0.05 THEN
        RAISE EXCEPTION 'سعر الإرجاع للصنف % (%) لا يطابق سعر البيع في الفاتورة الأصلية (%)',
          v_item.product_id, v_item.unit_price, v_orig_item.unit_price;
      END IF;

      -- Check for prior returns of the same item on this invoice
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

  -- 6. Insert Return Invoice Record
  INSERT INTO public.invoices (
    company_id, invoice_number, party_id, issue_date, due_date,
    total_amount, tax_amount, discount_amount, payment_method,
    status, notes, type, created_by, currency_code, exchange_rate,
    reference_invoice_id, return_reason, branch_id, paid_amount
  ) VALUES (
    v_effective_company, v_invoice_number, p_party_id, p_issue_date, p_issue_date,
    v_total_amount, 0, 0, p_payment_method,
    p_status, p_notes, 'sale_return', v_effective_user, v_effective_currency, v_effective_rate,
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

    -- Increase stock in warehouse
    UPDATE public.product_stock
    SET quantity = quantity + v_item.quantity, updated_at = NOW()
    WHERE product_id = v_item.product_id
      AND warehouse_id = v_warehouse_id
      AND company_id = v_effective_company;

    -- Record reverse inventory transaction
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

  RETURN jsonb_build_object(
    'id', v_return_invoice_id,
    'invoice_number', v_invoice_number,
    'total_amount', v_total_amount,
    'currency_code', v_effective_currency,
    'exchange_rate', v_effective_rate,
    'status', p_status
  );
END;
$function$;

