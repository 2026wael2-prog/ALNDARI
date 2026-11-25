-- ============================================================================
-- Migration: 20261126004000_wave40_bond_journal_invoice_number_and_statement_filters.sql
-- Wave 40:
-- 1. Bond Journal Posting & RPC: Clear Invoice Number in description & party lines
-- 2. Statement View: Expose payment_method, join allocated invoice numbers on bonds
-- ============================================================================

-- 1) Fix fn_auto_post_payment_journal to include invoice number on party journal line
CREATE OR REPLACE FUNCTION public.fn_auto_post_payment_journal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_je_id uuid;
  v_acc_ar uuid;
  v_acc_ap uuid;
  v_already_posted boolean;
  v_party_type text;
  v_reference_type text;
  v_base_amount numeric;
  v_needs_repost boolean := false;
  v_party_line_desc text;
  v_linked_inv_number text := NULL;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM set_config('app.reposting_doc', 'true', true);
    UPDATE public.journal_entry_lines SET deleted_at = now()
    WHERE journal_entry_id IN (SELECT id FROM public.journal_entries WHERE reference_id = OLD.id AND deleted_at IS NULL)
      AND deleted_at IS NULL;
    UPDATE public.journal_entries SET deleted_at = now()
    WHERE reference_id = OLD.id AND deleted_at IS NULL;
    PERFORM set_config('app.reposting_doc', 'false', true);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- When void_bond / void_invoice transitions a payment to 'void' AFTER posting
    -- explicit reversal journal entries, preserve both original and reversal entries.
    IF current_setting('app.voiding_payment', true) = 'true' THEN
      RETURN new;
    END IF;

    IF new.deleted_at IS NOT NULL OR new.status <> 'posted' THEN
      PERFORM set_config('app.reposting_doc', 'true', true);
      UPDATE public.journal_entry_lines SET deleted_at = now()
      WHERE journal_entry_id IN (SELECT id FROM public.journal_entries WHERE reference_id = NEW.id AND deleted_at IS NULL)
        AND deleted_at IS NULL;
      UPDATE public.journal_entries SET deleted_at = now()
      WHERE reference_id = NEW.id AND deleted_at IS NULL;
      PERFORM set_config('app.reposting_doc', 'false', true);
      RETURN new;
    END IF;

    v_needs_repost := (
      new.branch_id IS DISTINCT FROM old.branch_id OR
      new.party_id IS DISTINCT FROM old.party_id OR
      new.account_id IS DISTINCT FROM old.account_id OR
      new.counterparty_account_id IS DISTINCT FROM old.counterparty_account_id OR
      new.type IS DISTINCT FROM old.type OR
      new.payment_date IS DISTINCT FROM old.payment_date OR
      new.currency_code IS DISTINCT FROM old.currency_code OR
      new.exchange_rate IS DISTINCT FROM old.exchange_rate OR
      new.amount IS DISTINCT FROM old.amount OR
      new.deleted_at IS DISTINCT FROM old.deleted_at
    );

    IF v_needs_repost THEN
      PERFORM set_config('app.reposting_doc', 'true', true);
      UPDATE public.journal_entry_lines SET deleted_at = now()
      WHERE journal_entry_id IN (SELECT id FROM public.journal_entries WHERE reference_id = NEW.id AND deleted_at IS NULL)
        AND deleted_at IS NULL;
      UPDATE public.journal_entries SET deleted_at = now()
      WHERE reference_id = NEW.id AND deleted_at IS NULL;
      PERFORM set_config('app.reposting_doc', 'false', true);
    END IF;
  END IF;

  IF new.status <> 'posted' OR new.deleted_at IS NOT NULL THEN RETURN new; END IF;

  SELECT exists(SELECT 1 FROM public.journal_entries je WHERE je.reference_id = new.id AND je.deleted_at IS NULL)
    INTO v_already_posted;
  IF v_already_posted THEN RETURN new; END IF;

  IF new.account_id IS NULL THEN
    RAISE EXCEPTION 'auto_post_failed: السند % بدون حساب (خزينة/بنك) - يجب اختيار حساب قبل إصدار السند', new.payment_number;
  END IF;

  v_base_amount := public.fn_to_base_amount(new.currency_code, new.amount, new.exchange_rate);

  -- Authorize internal journal entry posting for manager/cashier roles
  PERFORM set_config('app.rpc_authorized', 'true', true);

  -- If payment has an explicit linked invoice in reference_id or payment_allocations
  IF new.reference_id IS NOT NULL THEN
    SELECT invoice_number INTO v_linked_inv_number
    FROM public.invoices
    WHERE id = new.reference_id AND company_id = new.company_id;
  END IF;

  IF v_linked_inv_number IS NULL THEN
    SELECT inv.invoice_number INTO v_linked_inv_number
    FROM public.payment_allocations pa
    JOIN public.invoices inv ON inv.id = pa.invoice_id
    WHERE pa.payment_id = new.id
    LIMIT 1;
  END IF;

  -- Build professional descriptive line for the party ledger
  IF v_linked_inv_number IS NOT NULL THEN
    v_party_line_desc := (CASE WHEN new.type = 'receipt' THEN 'سداد فاتورة مبيعات رقم ' ELSE 'سداد فاتورة مشتريات رقم ' END)
      || v_linked_inv_number
      || CASE WHEN new.payment_number IS NOT NULL AND new.payment_number <> '' THEN ' - سند رقم ' || new.payment_number ELSE '' END;
  ELSIF new.notes IS NOT NULL AND TRIM(new.notes) <> '' THEN
    IF TRIM(new.notes) LIKE '%' || COALESCE(new.payment_number, '') || '%' THEN
      v_party_line_desc := TRIM(new.notes);
    ELSE
      v_party_line_desc := TRIM(new.notes) || CASE WHEN new.payment_number IS NOT NULL AND new.payment_number <> '' THEN ' - سند ' || new.payment_number ELSE '' END;
    END IF;
  ELSE
    v_party_line_desc := (CASE WHEN new.type = 'receipt' THEN 'تخفيض مدينون' ELSE 'تخفيض دائنون' END)
      || CASE WHEN new.payment_number IS NOT NULL AND new.payment_number <> '' THEN ' - سند ' || new.payment_number ELSE '' END;
  END IF;

  IF new.party_id IS NULL THEN
    IF new.counterparty_account_id IS NULL THEN
      RETURN new;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.accounts WHERE id = new.counterparty_account_id AND company_id = new.company_id
    ) THEN
      RAISE EXCEPTION 'tenant_violation: الحساب المقابل للسند % لا ينتمي لشركة السند', new.payment_number;
    END IF;

    v_reference_type := CASE WHEN new.type = 'transfer' THEN 'transfer_bond' ELSE 'payment_bond' END;

    INSERT INTO journal_entries (company_id, branch_id, entry_date, reference_type, reference_id, description, status, created_by)
    VALUES (new.company_id, new.branch_id, new.payment_date, v_reference_type, new.id,
            COALESCE(NULLIF(TRIM(new.notes), ''), 'ترحيل تلقائي - ' || (CASE WHEN new.type='transfer' THEN 'تحويل داخلي ' ELSE 'سند حساب عام ' END) || COALESCE(new.payment_number,'')),
            'draft', new.created_by)
    RETURNING id INTO v_je_id;

    IF new.type = 'transfer' THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      VALUES (v_je_id, new.counterparty_account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'تحويل إلى - ' || COALESCE(new.payment_number,''));
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      VALUES (v_je_id, new.account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'تحويل من - ' || COALESCE(new.payment_number,''));
    ELSIF new.type = 'receipt' THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      VALUES (v_je_id, new.account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'قبض - ' || COALESCE(new.payment_number,''));
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      VALUES (v_je_id, new.counterparty_account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), COALESCE(NULLIF(TRIM(new.notes),''), 'إيراد/مقابل - ' || COALESCE(new.payment_number,'')));
    ELSE
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      VALUES (v_je_id, new.counterparty_account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), COALESCE(NULLIF(TRIM(new.notes),''), 'مقابل/صرف - ' || COALESCE(new.payment_number,'')));
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      VALUES (v_je_id, new.account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'صرف - ' || COALESCE(new.payment_number,''));
    END IF;

    UPDATE journal_entries SET status = 'posted' WHERE id = v_je_id;
    RETURN new;
  END IF;

  SELECT type INTO v_party_type FROM public.parties WHERE id = new.party_id;
  IF v_party_type IS NULL THEN
    RAISE EXCEPTION 'auto_post_failed: لا يوجد طرف (عميل/مورد) للسند % - party_id % غير موجود', new.payment_number, new.party_id;
  END IF;

  v_acc_ar := fn_get_account_id(new.company_id, '1100');
  v_acc_ap := fn_get_account_id(new.company_id, '2100');

  IF v_party_type = 'customer' OR (v_party_type = 'both' AND new.type = 'receipt') THEN
    IF v_acc_ar IS NULL THEN
      RAISE EXCEPTION 'auto_post_failed: حساب AR(1100) غير موجود للشركة % - يجب إنشاؤه قبل إصدار سند %', new.company_id, new.payment_number;
    END IF;
    INSERT INTO journal_entries (company_id, branch_id, entry_date, reference_type, reference_id, description, status, created_by)
    VALUES (new.company_id, new.branch_id, new.payment_date,
      CASE WHEN new.type = 'receipt' THEN 'receipt_bond' ELSE 'payment_bond' END, new.id,
      COALESCE(NULLIF(TRIM(new.notes), ''), 'ترحيل تلقائي - ' || (CASE WHEN new.type='receipt' THEN 'سند قبض من عميل ' ELSE 'سند صرف/تحصيل من عميل ' END) || COALESCE(new.payment_number,'')),
      'draft', new.created_by)
    RETURNING id INTO v_je_id;

    IF new.type = 'receipt' THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      VALUES (v_je_id, new.account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'قبض - ' || COALESCE(new.payment_number,''), NULL);
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      VALUES (v_je_id, v_acc_ar, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), v_party_line_desc, new.party_id);
    ELSE
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      VALUES (v_je_id, v_acc_ar, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), v_party_line_desc, new.party_id);
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      VALUES (v_je_id, new.account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'صرف من خزينة - ' || COALESCE(new.payment_number,''), NULL);
    END IF;

  ELSIF v_party_type = 'supplier' OR (v_party_type = 'both' AND new.type IN ('disbursement', 'payment')) THEN
    IF v_acc_ap IS NULL THEN
      RAISE EXCEPTION 'auto_post_failed: حساب AP(2100) غير موجود للشركة % - يجب إنشاؤه قبل إصدار سند %', new.company_id, new.payment_number;
    END IF;
    INSERT INTO journal_entries (company_id, branch_id, entry_date, reference_type, reference_id, description, status, created_by)
    VALUES (new.company_id, new.branch_id, new.payment_date,
      CASE WHEN new.type IN ('disbursement', 'payment') THEN 'payment_bond' ELSE 'receipt_bond' END, new.id,
      COALESCE(NULLIF(TRIM(new.notes), ''), 'ترحيل تلقائي - ' || (CASE WHEN new.type IN ('disbursement', 'payment') THEN 'سند صرف لمورد ' ELSE 'سند قبض/تحصيل من مورد ' END) || COALESCE(new.payment_number,'')),
      'draft', new.created_by)
    RETURNING id INTO v_je_id;

    IF new.type IN ('disbursement', 'payment') THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      VALUES (v_je_id, v_acc_ap, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), v_party_line_desc, new.party_id);
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      VALUES (v_je_id, new.account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'صرف - ' || COALESCE(new.payment_number,''), NULL);
    ELSE
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      VALUES (v_je_id, new.account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'قبض من مورد - ' || COALESCE(new.payment_number,''), NULL);
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      VALUES (v_je_id, v_acc_ap, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), v_party_line_desc, new.party_id);
    END IF;

  ELSE
    RAISE EXCEPTION 'auto_post_failed: نوع الطرف غير معروف (%) للسند % - يجب أن يكون customer أو supplier', v_party_type, new.payment_number;
  END IF;

  UPDATE journal_entries SET status = 'posted' WHERE id = v_je_id;
  RETURN new;
END;
$function$;

-- 2) Update create_financial_bond to store invoice link and clear description in payments
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
  p_branch_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_journal_id uuid;
  v_payment_id uuid;
  v_counterparty_account_id uuid;
  v_party_type text;
  v_ref_type text;
  v_party_id uuid := NULL;
  v_base_amount numeric;
  v_foreign_amount numeric;
  v_effective_rate numeric;
  v_inv_currency text;
  v_inv_number text;
  v_remaining numeric;
  v_alloc_amount numeric;
  v_final_description text;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'access_denied: يتطلب تسجيل الدخول';
  END IF;

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM user_company_roles ucr WHERE ucr.user_id = v_uid AND ucr.company_id = p_company_id
  ) THEN RAISE EXCEPTION 'access_denied'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fiscal_years
    WHERE company_id = p_company_id AND p_date BETWEEN start_date AND end_date AND is_closed = false
  ) THEN RAISE EXCEPTION 'التاريخ يقع خارج سنة مالية مفتوحة'; END IF;

  IF p_cash_account_id IS NULL THEN RAISE EXCEPTION 'حساب الصندوق / البنك إلزامي'; END IF;
  PERFORM assert_account_belongs_to_company(p_cash_account_id, p_company_id, 'p_cash_account_id');

  v_effective_rate := COALESCE(NULLIF(p_exchange_rate, 0), 1.0);
  v_foreign_amount := COALESCE(NULLIF(p_foreign_amount, 0), p_amount);
  v_base_amount    := public.fn_to_base_amount(p_currency_code, v_foreign_amount, v_effective_rate);
  IF p_currency_code = (SELECT base_currency FROM companies WHERE id = p_company_id LIMIT 1) THEN
    v_base_amount := v_foreign_amount; v_effective_rate := 1.0;
  END IF;

  v_ref_type := CASE p_bond_type
    WHEN 'receipt' THEN 'receipt_bond' WHEN 'payment' THEN 'payment_bond'
    WHEN 'disbursement' THEN 'payment_bond' WHEN 'transfer' THEN 'internal_transfer'
    ELSE NULL END;
  IF v_ref_type IS NULL THEN RAISE EXCEPTION 'نوع السند غير صحيح: %', p_bond_type; END IF;

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
    IF v_party_type IS NULL THEN RAISE EXCEPTION 'الطرف التجاري غير موجود: %', p_counterparty_id; END IF;
  END IF;

  -- Format clear description incorporating invoice number if invoice allocation is requested
  v_final_description := TRIM(COALESCE(p_description, ''));
  IF p_invoice_id IS NOT NULL THEN
    SELECT invoice_number, currency_code INTO v_inv_number, v_inv_currency
    FROM public.invoices
    WHERE id = p_invoice_id AND company_id = p_company_id;

    IF v_inv_currency IS NULL THEN
      RAISE EXCEPTION 'الفاتورة المحددة غير موجودة ضمن شركة السند';
    END IF;

    IF COALESCE(v_inv_currency, 'SAR') <> COALESCE(p_currency_code, 'SAR') THEN
      RAISE EXCEPTION 'تعذر تخصيص السند: عملة السند (%) تختلف عن عملة الفاتورة (%). سجّل السند بنفس عملة الفاتورة أو اتركه بدون تخصيص',
        COALESCE(p_currency_code, 'SAR'), v_inv_currency;
    END IF;

    IF v_inv_number IS NOT NULL AND (v_final_description = '' OR v_final_description NOT LIKE '%' || v_inv_number || '%') THEN
      v_final_description := (CASE WHEN p_bond_type='receipt' THEN 'سداد فاتورة مبيعات رقم ' ELSE 'سداد فاتورة مشتريات رقم ' END)
        || v_inv_number
        || (CASE WHEN v_final_description <> '' THEN ' - ' || v_final_description ELSE '' END);
    END IF;
  END IF;

  INSERT INTO payments(
    company_id, branch_id, party_id, type, amount, currency_code, exchange_rate,
    payment_date, payment_method, account_id, reference_type, reference_id, notes, status, created_by
  ) VALUES (
    p_company_id, p_branch_id, v_party_id, CASE WHEN p_bond_type='disbursement' THEN 'disbursement' ELSE p_bond_type END,
    v_foreign_amount, p_currency_code, v_effective_rate,
    p_date, p_payment_method, p_cash_account_id,
    CASE WHEN p_invoice_id IS NOT NULL THEN 'invoice' ELSE v_ref_type END,
    p_invoice_id,
    v_final_description,
    'posted', v_uid
  ) RETURNING id INTO v_payment_id;

  IF v_party_id IS NOT NULL THEN
    SELECT id INTO v_journal_id FROM journal_entries WHERE reference_id = v_payment_id AND deleted_at IS NULL LIMIT 1;
    IF v_journal_id IS NULL THEN
      RAISE EXCEPTION 'auto_post_failed: لم يتم ترحيل السند تلقائياً كما هو متوقع';
    END IF;
  ELSE
    INSERT INTO journal_entries(company_id, branch_id, entry_date, description, reference_type, reference_id, status, created_by)
    VALUES (p_company_id, p_branch_id, p_date, v_final_description, v_ref_type, v_payment_id, 'posted', v_uid)
    RETURNING id INTO v_journal_id;

    IF p_bond_type = 'transfer' THEN
      INSERT INTO journal_entry_lines(journal_entry_id, account_id, party_id, debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount, company_id, branch_id)
      VALUES
        (v_journal_id, v_counterparty_account_id, NULL, v_base_amount, 0, v_final_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id),
        (v_journal_id, p_cash_account_id, NULL, 0, v_base_amount, v_final_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id);
    ELSE
      INSERT INTO journal_entry_lines(journal_entry_id, account_id, party_id, debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount, company_id, branch_id)
      VALUES
        (v_journal_id, v_counterparty_account_id, NULL, v_base_amount, 0, v_final_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id),
        (v_journal_id, p_cash_account_id, NULL, 0, v_base_amount, v_final_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id);
    END IF;
  END IF;

  IF p_invoice_id IS NOT NULL THEN
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
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'journal_id', v_journal_id,
    'amount', v_foreign_amount,
    'base_amount', v_base_amount,
    'currency', p_currency_code,
    'exchange_rate', v_effective_rate,
    'description', v_final_description
  );
END;
$function$;

-- 3) Update get_party_statement to display linked invoice number on bonds and expose payment_method
CREATE OR REPLACE FUNCTION public.get_party_statement(
  p_company_id uuid,
  p_party_id uuid,
  p_from_date date DEFAULT NULL::date,
  p_to_date date DEFAULT NULL::date,
  p_currency_code text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_movements json;
  v_party_type text;
  v_party_branch uuid;
  v_base_currency text;
  v_filter_currency text := NULLIF(UPPER(TRIM(COALESCE(p_currency_code, ''))), '');
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT type, branch_id INTO v_party_type, v_party_branch
  FROM public.parties
  WHERE id = p_party_id AND company_id = p_company_id AND deleted_at IS NULL;

  IF v_party_type IS NULL THEN
    RETURN '[]'::json;
  END IF;

  PERFORM public.fn_assert_branch_access(p_company_id, v_party_branch);

  SELECT UPPER(COALESCE(NULLIF(TRIM(base_currency), ''), 'SAR'))
  INTO v_base_currency
  FROM public.companies
  WHERE id = p_company_id;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.entry_date, t.is_bf DESC, t.created_at, t.line_id), '[]'::json)
  INTO v_movements
  FROM (
    SELECT
      sub.line_id, sub.entry_date, sub.created_at, sub.is_bf, sub.ref, sub.operation_type,
      sub.description, sub.type, sub.debit, sub.credit, sub.currency,
      sub.debit_base, sub.credit_base, sub.reference_id, sub.reference_type,
      sub.payment_status, sub.paid_amount, sub.remaining_amount, sub.items_count,
      sub.payment_method,
      SUM(CASE WHEN v_party_type = 'supplier' THEN sub.credit - sub.debit ELSE sub.debit - sub.credit END)
        OVER (PARTITION BY sub.currency ORDER BY sub.entry_date, sub.is_bf DESC, sub.created_at, sub.line_id ROWS UNBOUNDED PRECEDING) AS balance
    FROM (
      -- Brought-forward before p_from_date (strictly partitioned by currency)
      SELECT
        'BF-' || ob_prev.currency AS line_id,
        p_from_date AS entry_date,
        (p_from_date::text || ' 00:00:00+00')::timestamptz AS created_at,
        1 AS is_bf,
        'رصيد سابق' AS ref,
        'رصيد ما قبل الفترة' AS operation_type,
        'رصيد مرحل من الفترة السابقة' AS description,
        'brought_forward' AS type,
        ob_prev.debit, ob_prev.credit, ob_prev.currency,
        ob_prev.debit_base, ob_prev.credit_base,
        NULL::uuid AS reference_id,
        'brought_forward' AS reference_type,
        'posted' AS payment_status,
        0::numeric AS paid_amount,
        0::numeric AS remaining_amount,
        0::bigint AS items_count,
        'credit'::text AS payment_method
      FROM (
        SELECT
          prior_raw.currency,
          GREATEST(SUM(prior_raw.debit - prior_raw.credit), 0) AS debit,
          GREATEST(SUM(prior_raw.credit - prior_raw.debit), 0) AS credit,
          GREATEST(SUM(prior_raw.debit_base - prior_raw.credit_base), 0) AS debit_base,
          GREATEST(SUM(prior_raw.credit_base - prior_raw.debit_base), 0) AS credit_base
        FROM (
          SELECT
            UPPER(COALESCE(NULLIF(TRIM(ob.currency_code), ''), v_base_currency)) AS currency,
            CASE WHEN ob.direction = 'debit' THEN ob.amount ELSE 0 END AS debit,
            CASE WHEN ob.direction = 'credit' THEN ob.amount ELSE 0 END AS credit,
            CASE WHEN ob.direction = 'debit' THEN public.fn_to_base_amount(ob.currency_code, ob.amount, (SELECT lr.rate_to_base FROM public.exchange_rates lr WHERE lr.company_id = p_company_id AND lr.currency_code = ob.currency_code ORDER BY lr.effective_date DESC, lr.created_at DESC LIMIT 1)) ELSE 0 END AS debit_base,
            CASE WHEN ob.direction = 'credit' THEN public.fn_to_base_amount(ob.currency_code, ob.amount, (SELECT lr.rate_to_base FROM public.exchange_rates lr WHERE lr.company_id = p_company_id AND lr.currency_code = ob.currency_code ORDER BY lr.effective_date DESC, lr.created_at DESC LIMIT 1)) ELSE 0 END AS credit_base
          FROM public.party_opening_balances ob
          WHERE ob.company_id = p_company_id
            AND ob.party_id = p_party_id
            AND (p_from_date IS NOT NULL AND ob.entry_date < p_from_date)
            AND (v_filter_currency IS NULL OR UPPER(COALESCE(NULLIF(TRIM(ob.currency_code), ''), v_base_currency)) = v_filter_currency)
            AND public.fn_is_branch_scoped_row_allowed(ob.company_id, ob.branch_id)

          UNION ALL

          SELECT
            UPPER(COALESCE(NULLIF(TRIM(jel.currency_code), ''), v_base_currency)) AS currency,
            CASE WHEN jel.debit_amount > 0 THEN COALESCE(NULLIF(jel.foreign_amount, 0), jel.debit_amount) ELSE 0 END AS debit,
            CASE WHEN jel.credit_amount > 0 THEN COALESCE(NULLIF(jel.foreign_amount, 0), jel.credit_amount) ELSE 0 END AS credit,
            jel.debit_amount AS debit_base,
            jel.credit_amount AS credit_base
          FROM public.journal_entry_lines jel
          JOIN public.journal_entries je ON je.id = jel.journal_entry_id
          JOIN public.accounts a ON a.id = jel.account_id
          WHERE je.company_id = p_company_id
            AND je.status = 'posted'
            AND je.deleted_at IS NULL
            AND jel.deleted_at IS NULL
            AND jel.party_id = p_party_id
            AND a.deleted_at IS NULL
            AND NOT (je.reference_type = 'opening' AND COALESCE(je.description, '') LIKE '%ترحيل إقفال%')
            AND (a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%' OR a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%')
            AND (p_from_date IS NOT NULL AND je.entry_date < p_from_date)
            AND (v_filter_currency IS NULL OR UPPER(COALESCE(NULLIF(TRIM(jel.currency_code), ''), v_base_currency)) = v_filter_currency)
            AND public.fn_is_branch_scoped_row_allowed(je.company_id, COALESCE(jel.branch_id, je.branch_id))
        ) prior_raw
        GROUP BY prior_raw.currency
        HAVING SUM(prior_raw.debit - prior_raw.credit) <> 0
      ) ob_prev
      WHERE p_from_date IS NOT NULL

      UNION ALL

      -- Opening balances within range
      SELECT
        'OB-' || ob.id::text AS line_id,
        ob.entry_date,
        ob.created_at,
        0 AS is_bf,
        'رصيد افتتاحي' AS ref,
        'رصيد افتتاحي' AS operation_type,
        COALESCE(ob.notes, 'رصيد افتتاحي معتمد') AS description,
        'opening_balance' AS type,
        CASE WHEN ob.direction = 'debit' THEN ob.amount ELSE 0 END AS debit,
        CASE WHEN ob.direction = 'credit' THEN ob.amount ELSE 0 END AS credit,
        UPPER(COALESCE(NULLIF(TRIM(ob.currency_code), ''), v_base_currency)) AS currency,
        CASE WHEN ob.direction = 'debit' THEN public.fn_to_base_amount(ob.currency_code, ob.amount, (SELECT lr.rate_to_base FROM public.exchange_rates lr WHERE lr.company_id = p_company_id AND lr.currency_code = ob.currency_code ORDER BY lr.effective_date DESC, lr.created_at DESC LIMIT 1)) ELSE 0 END AS debit_base,
        CASE WHEN ob.direction = 'credit' THEN public.fn_to_base_amount(ob.currency_code, ob.amount, (SELECT lr.rate_to_base FROM public.exchange_rates lr WHERE lr.company_id = p_company_id AND lr.currency_code = ob.currency_code ORDER BY lr.effective_date DESC, lr.created_at DESC LIMIT 1)) ELSE 0 END AS credit_base,
        NULL::uuid AS reference_id,
        'opening_balance' AS reference_type,
        'posted' AS payment_status,
        0::numeric AS paid_amount,
        0::numeric AS remaining_amount,
        0::bigint AS items_count,
        'credit'::text AS payment_method
      FROM public.party_opening_balances ob
      WHERE ob.company_id = p_company_id
        AND ob.party_id = p_party_id
        AND (p_from_date IS NULL OR ob.entry_date >= p_from_date)
        AND (p_to_date IS NULL OR ob.entry_date <= p_to_date)
        AND (v_filter_currency IS NULL OR UPPER(COALESCE(NULLIF(TRIM(ob.currency_code), ''), v_base_currency)) = v_filter_currency)
        AND public.fn_is_branch_scoped_row_allowed(ob.company_id, ob.branch_id)

      UNION ALL

      -- Posted journal lines
      SELECT
        jel.id::text AS line_id,
        je.entry_date,
        jel.created_at,
        0 AS is_bf,
        CASE
          WHEN je.reference_type IN ('sales_invoice', 'invoice') THEN COALESCE(inv.invoice_number, 'INV')
          WHEN je.reference_type = 'purchase_invoice' THEN COALESCE(inv.invoice_number, 'PUR')
          WHEN je.reference_type IN ('payment', 'payment_bond') THEN COALESCE(pay.payment_number, 'PAY')
          WHEN je.reference_type IN ('receipt', 'receipt_bond', 'voucher') THEN COALESCE(pay.payment_number, 'RCV')
          WHEN je.reference_type IN ('sale_return', 'sales_return', 'return_sale') THEN COALESCE(inv.invoice_number, 'RET')
          WHEN je.reference_type IN ('purchase_return', 'return_purchase') THEN COALESCE(inv.invoice_number, 'PRET')
          WHEN je.reference_type = 'expense' THEN 'EXP'
          WHEN je.reference_type = 'settlement' THEN 'SETTLE'
          ELSE COALESCE('JV-' || je.entry_number::text, 'JV')
        END AS ref,
        CASE
          WHEN je.reference_type IN ('sales_invoice', 'invoice') THEN 'فاتورة مبيعات'
          WHEN je.reference_type = 'purchase_invoice' THEN 'فاتورة مشتريات'
          WHEN je.reference_type IN ('payment', 'payment_bond') THEN 'سند صرف'
          WHEN je.reference_type IN ('receipt', 'receipt_bond', 'voucher') THEN 'سند قبض'
          WHEN je.reference_type IN ('sale_return', 'sales_return', 'return_sale') THEN 'مرتجع مبيعات'
          WHEN je.reference_type IN ('purchase_return', 'return_purchase') THEN 'مرتجع مشتريات'
          WHEN je.reference_type = 'expense' THEN 'صرف مصروف'
          WHEN je.reference_type = 'settlement' THEN 'تسوية ومقاصة'
          ELSE 'قيد محاسبي'
        END AS operation_type,
        CASE
          WHEN alloc_meta.allocated_inv_numbers IS NOT NULL THEN
            (CASE WHEN je.reference_type IN ('receipt', 'receipt_bond', 'voucher') THEN 'سداد فاتورة مبيعات رقم ' ELSE 'سداد فاتورة مشتريات رقم ' END)
            || alloc_meta.allocated_inv_numbers
            || COALESCE(' - سند ' || pay.payment_number, '')
          WHEN pay.notes IS NOT NULL AND TRIM(pay.notes) <> '' THEN
            CASE
              WHEN TRIM(pay.notes) LIKE '%' || COALESCE(pay.payment_number, '') || '%' THEN TRIM(pay.notes)
              ELSE TRIM(pay.notes) || COALESCE(' - سند ' || pay.payment_number, '')
            END
          ELSE COALESCE(jel.description, je.description, 'حركة محاسبية')
        END AS description,
        je.reference_type AS type,
        CASE WHEN jel.debit_amount > 0 THEN COALESCE(NULLIF(jel.foreign_amount, 0), jel.debit_amount) ELSE 0 END AS debit,
        CASE WHEN jel.credit_amount > 0 THEN COALESCE(NULLIF(jel.foreign_amount, 0), jel.credit_amount) ELSE 0 END AS credit,
        UPPER(COALESCE(NULLIF(TRIM(jel.currency_code), ''), v_base_currency)) AS currency,
        jel.debit_amount AS debit_base,
        jel.credit_amount AS credit_base,
        COALESCE(inv.id, pay.id, je.reference_id, je.id) AS reference_id,
        COALESCE(je.reference_type, 'journal_entry') AS reference_type,
        CASE
          WHEN inv.id IS NOT NULL THEN
            CASE
              WHEN inv.status = 'paid' OR (COALESCE(inv.paid_amount, 0) >= inv.total_amount - 0.01 AND inv.total_amount > 0) THEN 'paid'
              WHEN COALESCE(inv.paid_amount, 0) > 0.005 THEN 'partial'
              WHEN inv.status IN ('void', 'cancelled') THEN 'void'
              ELSE 'unpaid'
            END
          WHEN pay.id IS NOT NULL THEN
            CASE
              WHEN pay.status = 'posted' THEN 'paid'
              WHEN pay.status = 'void' THEN 'void'
              ELSE 'draft'
            END
          ELSE 'posted'
        END AS payment_status,
        CASE
          WHEN inv.id IS NOT NULL AND UPPER(COALESCE(inv.currency_code, v_base_currency)) <> v_base_currency
               AND COALESCE(inv.total_document_amount, 0) > 0 AND COALESCE(inv.total_amount, 0) > 0
            THEN ROUND((COALESCE(inv.paid_amount, 0) / inv.total_amount) * inv.total_document_amount, 2)
          ELSE COALESCE(inv.paid_amount, pay.amount, 0)::numeric
        END AS paid_amount,
        CASE
          WHEN inv.id IS NOT NULL AND UPPER(COALESCE(inv.currency_code, v_base_currency)) <> v_base_currency
               AND COALESCE(inv.total_document_amount, 0) > 0 AND COALESCE(inv.total_amount, 0) > 0
            THEN GREATEST(
              ROUND(inv.total_document_amount - ROUND((COALESCE(inv.paid_amount, 0) / inv.total_amount) * inv.total_document_amount, 2), 2),
              0
            )
          ELSE COALESCE(GREATEST(inv.total_amount - COALESCE(inv.paid_amount, 0), 0), 0)::numeric
        END AS remaining_amount,
        COALESCE(inv_meta.item_count, 0)::bigint AS items_count,
        COALESCE(inv.payment_method, pay.payment_method, 'credit') AS payment_method
      FROM public.journal_entry_lines jel
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      JOIN public.accounts a ON a.id = jel.account_id
      LEFT JOIN public.invoices inv
        ON inv.id = je.reference_id
       AND je.reference_type IN ('sales_invoice', 'invoice', 'purchase_invoice', 'sale_return', 'sales_return', 'return_sale', 'purchase_return', 'return_purchase')
      LEFT JOIN public.payments pay
        ON pay.id = je.reference_id
       AND je.reference_type IN ('payment', 'payment_bond', 'receipt', 'receipt_bond', 'voucher')
      LEFT JOIN LATERAL (
        SELECT string_agg(DISTINCT inv_alloc.invoice_number, ', ') AS allocated_inv_numbers
        FROM public.payment_allocations pa
        JOIN public.invoices inv_alloc ON inv_alloc.id = pa.invoice_id
        WHERE pa.payment_id = pay.id
      ) alloc_meta ON true
      LEFT JOIN LATERAL (SELECT COUNT(*) AS item_count FROM public.invoice_items ii WHERE ii.invoice_id = inv.id) inv_meta ON true
      WHERE je.company_id = p_company_id
        AND je.status = 'posted'
        AND je.deleted_at IS NULL
        AND jel.deleted_at IS NULL
        AND jel.party_id = p_party_id
        AND a.deleted_at IS NULL
        AND NOT (je.reference_type = 'opening' AND COALESCE(je.description, '') LIKE '%ترحيل إقفال%')
        AND (a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%' OR a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%')
        AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
        AND (p_to_date IS NULL OR je.entry_date <= p_to_date)
        AND (v_filter_currency IS NULL OR UPPER(COALESCE(NULLIF(TRIM(jel.currency_code), ''), v_base_currency)) = v_filter_currency)
        AND public.fn_is_branch_scoped_row_allowed(je.company_id, COALESCE(jel.branch_id, je.branch_id))
    ) sub
  ) t;

  RETURN v_movements;
END;
$function$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.create_financial_bond(uuid, text, numeric, text, numeric, numeric, date, uuid, uuid, text, text, uuid, uuid, text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_financial_bond(uuid, text, numeric, text, numeric, numeric, date, uuid, uuid, text, text, uuid, uuid, text, uuid) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_party_statement(uuid, uuid, date, date, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_party_statement(uuid, uuid, date, date, text) FROM anon, PUBLIC;
