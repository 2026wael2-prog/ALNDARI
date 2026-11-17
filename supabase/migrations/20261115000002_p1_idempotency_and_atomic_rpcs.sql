-- ==============================================================================
-- P1: Idempotency Keys, Atomic Commission in Bonds, Atomic Quotation & Stock RPCs
-- ==============================================================================

-- 1. Idempotency columns & unique partial indexes
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_company_idempotency
  ON public.payments (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_company_idempotency
  ON public.journal_entries (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_transfers_company_idempotency
  ON public.stock_transfers (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_quotations_company_idempotency
  ON public.quotations (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_company_idempotency
  ON public.invoices (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;


-- 2. Atomic create_financial_bond (single transaction for bond + optional commission + idempotency)
DROP FUNCTION IF EXISTS public.create_financial_bond(
  uuid, text, numeric, text, numeric, numeric, date, uuid, uuid, text, text, uuid, uuid, text, uuid
);

CREATE OR REPLACE FUNCTION public.create_financial_bond(
  p_company_id uuid,
  p_bond_type text,
  p_amount numeric,
  p_currency_code text DEFAULT 'SAR'::text,
  p_exchange_rate numeric DEFAULT 1.0,
  p_foreign_amount numeric DEFAULT NULL::numeric,
  p_date date DEFAULT CURRENT_DATE,
  p_cash_account_id uuid DEFAULT NULL::uuid,
  p_counterparty_id uuid DEFAULT NULL::uuid,
  p_counterparty_type text DEFAULT 'party'::text,
  p_description text DEFAULT ''::text,
  p_invoice_id uuid DEFAULT NULL::uuid,
  p_user_id uuid DEFAULT NULL::uuid,
  p_payment_method text DEFAULT 'cash'::text,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text,
  p_commission_amount numeric DEFAULT 0,
  p_commission_account_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_journal_id uuid;
  v_payment_id uuid;
  v_comm_payment_id uuid;
  v_counterparty_account_id uuid;
  v_party_type text;
  v_ref_type text;
  v_party_id uuid := NULL;
  v_base_amount numeric;
  v_foreign_amount numeric;
  v_effective_rate numeric;
  v_inv_currency text;
  v_remaining numeric;
  v_alloc_amount numeric;
  v_comm_alloc numeric;
  v_uid uuid := auth.uid();
  v_idem_key text := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
  v_existing_payment record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'access_denied: يتطلب تسجيل الدخول' USING ERRCODE = '42501';
  END IF;

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM user_company_roles ucr WHERE ucr.user_id = v_uid AND ucr.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  -- Idempotency Lock & Check
  IF v_idem_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('bond:' || p_company_id::text || ':' || v_idem_key));
    SELECT id, payment_number, amount, exchange_rate INTO v_existing_payment
    FROM public.payments
    WHERE company_id = p_company_id AND idempotency_key = v_idem_key AND deleted_at IS NULL
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', v_existing_payment.id,
        'payment_number', v_existing_payment.payment_number,
        'foreign_amount', v_existing_payment.amount,
        'exchange_rate', v_existing_payment.exchange_rate,
        'status', 'success',
        'is_duplicate', true
      );
    END IF;
  END IF;

  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'لا يمكن إنشاء سند بقيمة صفر أو قيمة سالبة';
  END IF;

  IF COALESCE(p_commission_amount, 0) < 0 THEN
    RAISE EXCEPTION 'قيمة العمولة/الخصم لا يمكن أن تكون سالبة';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fiscal_years
    WHERE company_id = p_company_id AND p_date BETWEEN start_date AND end_date AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'التاريخ يقع خارج سنة مالية مفتوحة';
  END IF;

  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب الصندوق / البنك إلزامي';
  END IF;
  PERFORM assert_account_belongs_to_company(p_cash_account_id, p_company_id, 'p_cash_account_id');

  IF COALESCE(p_commission_amount, 0) > 0 AND p_commission_account_id IS NOT NULL THEN
    PERFORM assert_account_belongs_to_company(p_commission_account_id, p_company_id, 'p_commission_account_id');
  END IF;

  v_effective_rate := COALESCE(NULLIF(p_exchange_rate, 0), 1.0);
  v_foreign_amount := COALESCE(NULLIF(p_foreign_amount, 0), p_amount);
  v_base_amount    := public.fn_to_base_amount(p_currency_code, v_foreign_amount, v_effective_rate);
  IF p_currency_code = (SELECT base_currency FROM companies WHERE id = p_company_id LIMIT 1) THEN
    v_base_amount := v_foreign_amount;
    v_effective_rate := 1.0;
  END IF;

  v_ref_type := CASE p_bond_type
    WHEN 'receipt' THEN 'receipt_bond'
    WHEN 'payment' THEN 'payment_bond'
    WHEN 'disbursement' THEN 'payment_bond'
    WHEN 'transfer' THEN 'internal_transfer'
    ELSE NULL
  END;
  IF v_ref_type IS NULL THEN
    RAISE EXCEPTION 'نوع السند غير صحيح: %', p_bond_type;
  END IF;

  IF p_bond_type = 'transfer' THEN
    PERFORM assert_account_belongs_to_company(p_counterparty_id, p_company_id, 'p_counterparty_id (transfer target account)');
    v_counterparty_account_id := p_counterparty_id;
  ELSIF p_counterparty_type = 'account' THEN
    PERFORM assert_account_belongs_to_company(p_counterparty_id, p_company_id, 'p_counterparty_id (account)');
    v_counterparty_account_id := p_counterparty_id;
  ELSE
    PERFORM assert_party_belongs_to_company(p_counterparty_id, p_company_id, 'p_counterparty_id (party)');
    v_party_id := p_counterparty_id;
    SELECT type INTO v_party_type FROM parties WHERE id = p_counterparty_id;
    IF v_party_type IS NULL THEN
      RAISE EXCEPTION 'الطرف التجاري غير موجود: %', p_counterparty_id;
    END IF;
  END IF;

  INSERT INTO payments(
    company_id, branch_id, party_id, type, amount, currency_code, exchange_rate,
    payment_date, payment_method, account_id, reference_type, notes, status, created_by, idempotency_key
  ) VALUES (
    p_company_id, p_branch_id, v_party_id,
    CASE WHEN p_bond_type = 'disbursement' THEN 'disbursement' ELSE p_bond_type END,
    v_foreign_amount, p_currency_code, v_effective_rate,
    p_date, p_payment_method, p_cash_account_id, v_ref_type, p_description, 'posted', v_uid, v_idem_key
  ) RETURNING id INTO v_payment_id;

  IF v_party_id IS NOT NULL THEN
    SELECT id INTO v_journal_id FROM journal_entries WHERE reference_id = v_payment_id AND deleted_at IS NULL LIMIT 1;
    IF v_journal_id IS NULL THEN
      RAISE EXCEPTION 'auto_post_failed: لم يتم ترحيل السند تلقائياً كما هو متوقع';
    END IF;
  ELSE
    INSERT INTO journal_entries(company_id, branch_id, entry_date, description, reference_type, reference_id, status, created_by)
    VALUES (p_company_id, p_branch_id, p_date, p_description, v_ref_type, v_payment_id, 'posted', v_uid)
    RETURNING id INTO v_journal_id;

    INSERT INTO journal_entry_lines(journal_entry_id, account_id, party_id, debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount, company_id, branch_id)
    VALUES
      (v_journal_id, v_counterparty_account_id, NULL, v_base_amount, 0, p_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id),
      (v_journal_id, p_cash_account_id, NULL, 0, v_base_amount, p_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id);
  END IF;

  IF p_invoice_id IS NOT NULL THEN
    SELECT currency_code INTO v_inv_currency
    FROM public.invoices
    WHERE id = p_invoice_id AND company_id = p_company_id;

    IF v_inv_currency IS NULL THEN
      RAISE EXCEPTION 'الفاتورة المحددة غير موجودة ضمن شركة السند';
    END IF;

    IF COALESCE(v_inv_currency, 'SAR') <> COALESCE(p_currency_code, 'SAR') THEN
      RAISE EXCEPTION 'تعذر تخصيص السند: عملة السند (%) تختلف عن عملة الفاتورة (%). سجّل السند بنفس عملة الفاتورة أو اتركه بدون تخصيص',
        COALESCE(p_currency_code, 'SAR'), v_inv_currency;
    END IF;

    SELECT total_amount - COALESCE(paid_amount, 0)
    INTO v_remaining
    FROM public.invoices
    WHERE id = p_invoice_id AND company_id = p_company_id;

    IF COALESCE(v_remaining, 0) <= 0 THEN
      RAISE EXCEPTION 'الفاتورة المحددة مسددة بالكامل - لا يمكن تخصيص سند إضافي لها';
    END IF;

    v_alloc_amount := LEAST(v_foreign_amount, v_remaining);

    IF v_alloc_amount > 0 THEN
      INSERT INTO payment_allocations(payment_id, invoice_id, amount, company_id)
      VALUES (v_payment_id, p_invoice_id, v_alloc_amount, p_company_id) ON CONFLICT DO NOTHING;
      v_remaining := v_remaining - v_alloc_amount;
    END IF;
  END IF;

  -- Atomic Commission / Discount Settlement Bond in the same transaction
  IF COALESCE(p_commission_amount, 0) > 0 AND p_commission_account_id IS NOT NULL THEN
    INSERT INTO payments(
      company_id, branch_id, party_id, type, amount, currency_code, exchange_rate,
      payment_date, payment_method, account_id, reference_type, notes, status, created_by,
      idempotency_key
    ) VALUES (
      p_company_id, p_branch_id, v_party_id,
      CASE WHEN p_bond_type = 'disbursement' THEN 'disbursement' ELSE p_bond_type END,
      p_commission_amount, p_currency_code, v_effective_rate,
      p_date, 'cash', p_commission_account_id, v_ref_type,
      'تسوية خصم/عمولة: ' || COALESCE(p_description, ''), 'posted', v_uid,
      CASE WHEN v_idem_key IS NOT NULL THEN v_idem_key || ':comm' ELSE NULL END
    ) RETURNING id INTO v_comm_payment_id;

    IF p_invoice_id IS NOT NULL AND COALESCE(v_remaining, 0) > 0 THEN
      v_comm_alloc := LEAST(p_commission_amount, v_remaining);
      IF v_comm_alloc > 0 THEN
        INSERT INTO payment_allocations(payment_id, invoice_id, amount, company_id)
        VALUES (v_comm_payment_id, p_invoice_id, v_comm_alloc, p_company_id) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_payment_id,
    'commission_payment_id', v_comm_payment_id,
    'payment_number', (SELECT payment_number FROM payments WHERE id = v_payment_id),
    'journal_id', v_journal_id,
    'base_amount', v_base_amount,
    'foreign_amount', v_foreign_amount,
    'exchange_rate', v_effective_rate,
    'status', 'success'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_financial_bond(uuid, text, numeric, text, numeric, numeric, date, uuid, uuid, text, text, uuid, uuid, text, uuid, text, numeric, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_financial_bond(uuid, text, numeric, text, numeric, numeric, date, uuid, uuid, text, text, uuid, uuid, text, uuid, text, numeric, uuid) TO authenticated, service_role;


-- 3. Idempotent post_manual_journal
DROP FUNCTION IF EXISTS public.post_manual_journal(
  uuid, uuid, date, text, jsonb, text, numeric, text, uuid
);

CREATE OR REPLACE FUNCTION public.post_manual_journal(
  p_company_id uuid,
  p_user_id uuid,
  p_date date,
  p_description text,
  p_lines jsonb,
  p_currency_code text DEFAULT 'SAR'::text,
  p_exchange_rate numeric DEFAULT 1,
  p_reference_type text DEFAULT NULL::text,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_journal_id   uuid;
  v_line         RECORD;
  v_base_debit   numeric;
  v_base_credit  numeric;
  v_foreign_amt  numeric;
  v_total_debit  numeric := 0;
  v_total_credit numeric := 0;
  v_created_by   uuid := auth.uid();
  v_idem_key     text := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
BEGIN
  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_company_roles ucr
    WHERE ucr.user_id = v_created_by AND ucr.company_id = p_company_id
      AND ucr.role IN ('owner','admin','accountant')
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية ترحيل القيود المحاسبية لهذه الشركة' USING ERRCODE = '42501';
  END IF;

  IF v_idem_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('manual_journal:' || p_company_id::text || ':' || v_idem_key));
    SELECT id INTO v_journal_id
    FROM public.journal_entries
    WHERE company_id = p_company_id AND idempotency_key = v_idem_key AND deleted_at IS NULL
    LIMIT 1;
    IF FOUND THEN
      RETURN v_journal_id;
    END IF;
  END IF;

  IF p_exchange_rate IS NULL OR p_exchange_rate <= 0 THEN
    RAISE EXCEPTION 'سعر صرف غير صالح: يجب أن يكون أكبر من صفر';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fiscal_years
    WHERE company_id = p_company_id
      AND p_date BETWEEN start_date AND end_date
      AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'لا توجد سنة مالية مفتوحة تغطي تاريخ القيد المحدد';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'لا يمكن ترحيل قيد بدون أسطر';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines)
    AS x(debit numeric, credit numeric)
  LOOP
    IF COALESCE(v_line.debit, 0) < 0 OR COALESCE(v_line.credit, 0) < 0 THEN
      RAISE EXCEPTION 'مبالغ المدين والدائن لا يمكن أن تكون سالبة';
    END IF;
    v_total_debit  := v_total_debit  + public.fn_to_base_amount(p_currency_code, COALESCE(v_line.debit,  0), p_exchange_rate);
    v_total_credit := v_total_credit + public.fn_to_base_amount(p_currency_code, COALESCE(v_line.credit, 0), p_exchange_rate);
  END LOOP;

  IF v_total_debit <= 0 THEN
    RAISE EXCEPTION 'لا يمكن ترحيل قيد بقيمة صفرية: إجمالي المدين = %', v_total_debit;
  END IF;

  IF ABS(v_total_debit - v_total_credit) > 0.001 THEN
    RAISE EXCEPTION 'القيد غير متوازن: المدين (%) لا يساوي الدائن (%)', v_total_debit, v_total_credit;
  END IF;

  INSERT INTO journal_entries(
    company_id, branch_id, entry_date, description, reference_type, status, created_by, idempotency_key
  ) VALUES (
    p_company_id, p_branch_id, p_date, p_description,
    COALESCE(p_reference_type, 'manual'), 'draft', v_created_by, v_idem_key
  ) RETURNING id INTO v_journal_id;

  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines)
    AS x(account_id uuid, party_id uuid, debit numeric, credit numeric, description text)
  LOOP
    v_base_debit  := public.fn_to_base_amount(p_currency_code, COALESCE(v_line.debit,  0), p_exchange_rate);
    v_base_credit := public.fn_to_base_amount(p_currency_code, COALESCE(v_line.credit, 0), p_exchange_rate);
    v_foreign_amt := GREATEST(COALESCE(v_line.debit, 0), COALESCE(v_line.credit, 0));

    INSERT INTO journal_entry_lines(
      journal_entry_id, account_id, party_id,
      debit_amount, credit_amount, description,
      currency_code, exchange_rate, foreign_amount, company_id, branch_id
    ) VALUES (
      v_journal_id, v_line.account_id, v_line.party_id,
      v_base_debit, v_base_credit,
      COALESCE(v_line.description, p_description),
      p_currency_code, p_exchange_rate, v_foreign_amt,
      p_company_id, p_branch_id
    );
  END LOOP;

  UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;

  RETURN v_journal_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.post_manual_journal(uuid, uuid, date, text, jsonb, text, numeric, text, uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_manual_journal(uuid, uuid, date, text, jsonb, text, numeric, text, uuid, text) TO authenticated, service_role;


-- 4. Atomic create_quotation RPC (server-side totals, numbering lock, single transaction)
CREATE OR REPLACE FUNCTION public.create_quotation(
  p_company_id uuid,
  p_party_id uuid,
  p_issue_date date,
  p_valid_until date DEFAULT NULL::date,
  p_discount_amount numeric DEFAULT 0,
  p_currency_code text DEFAULT 'SAR'::text,
  p_exchange_rate numeric DEFAULT 1,
  p_notes text DEFAULT NULL::text,
  p_terms_and_conditions text DEFAULT NULL::text,
  p_delivery_terms text DEFAULT NULL::text,
  p_payment_terms text DEFAULT NULL::text,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_idem_key text := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
  v_quotation_id uuid;
  v_quotation_number text;
  v_year text := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_max_seq integer := 0;
  v_subtotal numeric := 0;
  v_discount numeric := GREATEST(0, COALESCE(p_discount_amount, 0));
  v_total numeric := 0;
  v_idx integer := 0;
  v_item record;
  v_line_total numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.fn_assert_company_access(p_company_id);

  IF v_idem_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('quotation:' || p_company_id::text || ':' || v_idem_key));
    SELECT id, quotation_number INTO v_quotation_id, v_quotation_number
    FROM public.quotations
    WHERE company_id = p_company_id AND idempotency_key = v_idem_key AND deleted_at IS NULL
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_quotation_id, 'quotation_number', v_quotation_number, 'is_duplicate', true);
    END IF;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'لا يمكن حفظ عرض سعر بدون أصناف — أضف صنفاً واحداً على الأقل';
  END IF;

  IF COALESCE(p_exchange_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'سعر الصرف يجب أن يكون أكبر من صفر';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, description text, quantity numeric, unit_price numeric, discount_percent numeric)
  LOOP
    IF COALESCE(v_item.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر';
    END IF;
    IF COALESCE(v_item.unit_price, -1) < 0 THEN
      RAISE EXCEPTION 'سعر الوحدة لا يمكن أن يكون سالباً';
    END IF;
    IF COALESCE(v_item.discount_percent, 0) < 0 OR COALESCE(v_item.discount_percent, 0) > 100 THEN
      RAISE EXCEPTION 'نسبة الخصم غير صالحة';
    END IF;
    v_line_total := ROUND(v_item.quantity * v_item.unit_price * (1 - COALESCE(v_item.discount_percent, 0) / 100), 2);
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'قيمة الخصم الإجمالي لا يمكن أن تتجاوز المجموع الفرعي';
  END IF;
  v_total := v_subtotal - v_discount;

  PERFORM pg_advisory_xact_lock(hashtext('quotation_num:' || p_company_id::text || ':sales'));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(quotation_number, '^.*-(\d+)$', '\1'), quotation_number)::integer), 0)
    INTO v_max_seq
  FROM public.quotations
  WHERE company_id = p_company_id
    AND type = 'sales'
    AND quotation_number LIKE 'QT-' || v_year || '-%';

  v_quotation_number := 'QT-' || v_year || '-' || LPAD((v_max_seq + 1)::text, 4, '0');

  INSERT INTO public.quotations (
    company_id, branch_id, quotation_number, type, status, party_id,
    issue_date, valid_until, subtotal, discount_amount, tax_amount, total_amount,
    currency_code, exchange_rate, notes, terms_and_conditions, delivery_terms, payment_terms,
    created_by, idempotency_key
  ) VALUES (
    p_company_id, p_branch_id, v_quotation_number, 'sales', 'draft', p_party_id,
    p_issue_date, p_valid_until, v_subtotal, v_discount, 0, v_total,
    COALESCE(NULLIF(TRIM(p_currency_code), ''), 'SAR'), COALESCE(p_exchange_rate, 1),
    p_notes, p_terms_and_conditions, p_delivery_terms, p_payment_terms,
    v_uid, v_idem_key
  ) RETURNING id INTO v_quotation_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, description text, quantity numeric, unit_price numeric, discount_percent numeric)
  LOOP
    v_line_total := ROUND(v_item.quantity * v_item.unit_price * (1 - COALESCE(v_item.discount_percent, 0) / 100), 2);
    INSERT INTO public.quotation_items (
      quotation_id, company_id, product_id, description, quantity, unit_price, discount_percent, total, sort_order
    ) VALUES (
      v_quotation_id, p_company_id, v_item.product_id, v_item.description,
      v_item.quantity, v_item.unit_price, COALESCE(v_item.discount_percent, 0), v_line_total, v_idx
    );
    v_idx := v_idx + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_quotation_id,
    'quotation_number', v_quotation_number,
    'total_amount', v_total
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_quotation(uuid, uuid, date, date, numeric, text, numeric, text, text, text, text, uuid, jsonb, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_quotation(uuid, uuid, date, date, numeric, text, numeric, text, text, text, text, uuid, jsonb, text) TO authenticated, service_role;


-- 5. Atomic initialize_product_stock_atomic RPC (replaces client totalCost math & direct insert)
CREATE OR REPLACE FUNCTION public.initialize_product_stock_atomic(
  p_company_id uuid,
  p_product_id uuid,
  p_warehouse_id uuid,
  p_quantity numeric,
  p_unit_cost numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_qty numeric := COALESCE(p_quantity, 0);
  v_cost numeric := GREATEST(0, COALESCE(p_unit_cost, 0));
  v_tx_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.fn_assert_company_access(p_company_id);

  IF v_qty < 0 THEN
    RAISE EXCEPTION 'الكمية الافتتاحية لا يمكن أن تكون سالبة';
  END IF;

  INSERT INTO public.inventory_transactions (
    company_id, created_by, product_id, warehouse_id,
    quantity, unit_cost, total_cost, transaction_type, reference_type
  ) VALUES (
    p_company_id, v_uid, p_product_id, p_warehouse_id,
    v_qty, v_cost, ROUND(v_qty * v_cost, 4), 'initial', 'opening_balance'
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('id', v_tx_id, 'quantity', v_qty, 'total_cost', ROUND(v_qty * v_cost, 4));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.initialize_product_stock_atomic(uuid, uuid, uuid, numeric, numeric) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.initialize_product_stock_atomic(uuid, uuid, uuid, numeric, numeric) TO authenticated, service_role;
