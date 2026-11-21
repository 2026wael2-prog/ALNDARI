-- ============================================================================
-- Migration: 20261121000002_wave1b_p0_bonds_expenses_voids_auth.sql
-- Wave 1B (P0): Fix Bonds, Allocations, Expenses, Voids & Manager Auth Posting
-- ============================================================================

-- 1. fn_auto_post_payment_journal()
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
            'ترحيل تلقائي - ' || (CASE WHEN new.type='transfer' THEN 'تحويل داخلي ' ELSE 'سند حساب عام ' END) || COALESCE(new.payment_number,''),
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
      VALUES (v_je_id, new.counterparty_account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'إيراد/مقابل - ' || COALESCE(new.payment_number,''));
    ELSE
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      VALUES (v_je_id, new.counterparty_account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'مقابل/صرف - ' || COALESCE(new.payment_number,''));
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
      'ترحيل تلقائي - ' || (CASE WHEN new.type='receipt' THEN 'سند قبض من عميل ' ELSE 'سند صرف/تحصيل من عميل ' END) || COALESCE(new.payment_number,''),
      'draft', new.created_by)
    RETURNING id INTO v_je_id;

    IF new.type = 'receipt' THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      VALUES (v_je_id, new.account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'قبض - ' || COALESCE(new.payment_number,''), NULL);
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      VALUES (v_je_id, v_acc_ar, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'تخفيض مدينون - ' || COALESCE(new.payment_number,''), new.party_id);
    ELSE
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      VALUES (v_je_id, v_acc_ar, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'زيادة مدينون (سند صرف) - ' || COALESCE(new.payment_number,''), new.party_id);
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
      'ترحيل تلقائي - ' || (CASE WHEN new.type IN ('disbursement', 'payment') THEN 'سند صرف لمورد ' ELSE 'سند قبض/تحصيل من مورد ' END) || COALESCE(new.payment_number,''),
      'draft', new.created_by)
    RETURNING id INTO v_je_id;

    IF new.type IN ('disbursement', 'payment') THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      VALUES (v_je_id, v_acc_ap, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'تخفيض دائنون - ' || COALESCE(new.payment_number,''), new.party_id);
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      VALUES (v_je_id, new.account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'صرف - ' || COALESCE(new.payment_number,''), NULL);
    ELSE
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      VALUES (v_je_id, new.account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'قبض من مورد - ' || COALESCE(new.payment_number,''), NULL);
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      VALUES (v_je_id, v_acc_ap, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, COALESCE(new.exchange_rate,1), 'زيادة دائنون (سند قبض) - ' || COALESCE(new.payment_number,''), new.party_id);
    END IF;

  ELSE
    RAISE EXCEPTION 'auto_post_failed: نوع الطرف غير معروف (%) للسند % - يجب أن يكون customer أو supplier', v_party_type, new.payment_number;
  END IF;

  UPDATE journal_entries SET status = 'posted' WHERE id = v_je_id;
  RETURN new;
END;
$function$;

-- 2. validate_payment_allocation_total_amount() — compare SAR allocations against SAR payment base amount
CREATE OR REPLACE FUNCTION public.validate_payment_allocation_total_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment_id          uuid;
  v_total_allocated     numeric;
  v_payment_base_amount numeric;
BEGIN
  v_payment_id := COALESCE(NEW.payment_id, OLD.payment_id);

  SELECT public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)
  INTO v_payment_base_amount
  FROM public.payments p
  WHERE p.id = v_payment_id
  FOR UPDATE;

  IF v_payment_base_amount IS NULL THEN
    RAISE EXCEPTION 'السند المالي المحدد غير موجود' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_allocated
  FROM public.payment_allocations
  WHERE payment_id = v_payment_id
    AND deleted_at IS NULL;

  IF v_total_allocated > v_payment_base_amount + 0.02 THEN
    RAISE EXCEPTION 'إجمالي مبالغ التوزيع (% ر.س) يتجاوز قيمة السند الأساسية (% ر.س)',
      ROUND(v_total_allocated, 2), ROUND(v_payment_base_amount, 2) USING ERRCODE = '23514';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3. create_financial_bond (18-arg)
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
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_journal_id uuid;
  v_payment_id uuid;
  v_main_payment_number text;
  v_existing_payment record;
  v_counterparty_account_id uuid;
  v_party_type text;
  v_ref_type text;
  v_party_id uuid := NULL;
  v_base_amount numeric;
  v_foreign_amount numeric;
  v_effective_rate numeric;
  v_currency text;
  v_base_currency text;
  v_inv_currency text;
  v_remaining numeric;
  v_alloc_amount numeric;
  v_uid uuid := auth.uid();
  v_dr_account uuid;
  v_cr_account uuid;
  v_clean_idem text := NULLIF(btrim(p_idempotency_key), '');
  v_comm_amount numeric := COALESCE(p_commission_amount, 0);
  v_comm_payment_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'access_denied: يتطلب تسجيل الدخول' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_uid
      AND ucr.company_id = p_company_id
      AND ucr.role IN ('owner', 'admin', 'manager', 'accountant', 'cashier')
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية إنشاء سند مالي' USING ERRCODE = '42501';
  END IF;

  IF v_clean_idem IS NOT NULL THEN
    SELECT p.id, p.payment_number, p.amount, p.exchange_rate, p.currency_code
    INTO v_existing_payment
    FROM public.payments p
    WHERE p.company_id = p_company_id
      AND p.idempotency_key = v_clean_idem
      AND p.deleted_at IS NULL
    LIMIT 1;

    IF FOUND THEN
      SELECT je.id INTO v_journal_id
      FROM public.journal_entries je
      WHERE je.reference_id = v_existing_payment.id AND je.deleted_at IS NULL
      LIMIT 1;

      RETURN jsonb_build_object(
        'id', v_existing_payment.id,
        'payment_number', v_existing_payment.payment_number,
        'journal_id', v_journal_id,
        'base_amount', public.fn_to_base_amount(v_existing_payment.currency_code, v_existing_payment.amount, v_existing_payment.exchange_rate),
        'foreign_amount', v_existing_payment.amount,
        'exchange_rate', v_existing_payment.exchange_rate,
        'status', 'success',
        'idempotent_replay', true
      );
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_years
    WHERE company_id = p_company_id AND p_date BETWEEN start_date AND end_date AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'التاريخ يقع خارج سنة مالية مفتوحة';
  END IF;

  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب الصندوق / البنك إلزامي';
  END IF;
  PERFORM public.assert_account_belongs_to_company(p_cash_account_id, p_company_id, 'p_cash_account_id');

  v_foreign_amount := COALESCE(NULLIF(p_foreign_amount, 0), p_amount);
  IF COALESCE(v_foreign_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: مبلغ السند يجب أن يكون أكبر من الصفر';
  END IF;

  IF v_comm_amount < 0 THEN
    RAISE EXCEPTION 'مبلغ العمولة غير صالح';
  END IF;
  IF v_comm_amount > 0 THEN
    IF p_commission_account_id IS NULL THEN
      RAISE EXCEPTION 'حساب مصروف العمولة إلزامي عند تحديد عمولة';
    END IF;
    PERFORM public.assert_account_belongs_to_company(p_commission_account_id, p_company_id, 'p_commission_account_id');
  END IF;

  SELECT COALESCE(base_currency, 'SAR') INTO v_base_currency FROM public.companies WHERE id = p_company_id LIMIT 1;
  v_currency := UPPER(TRIM(COALESCE(NULLIF(p_currency_code, ''), v_base_currency, 'SAR')));

  IF v_currency = v_base_currency THEN
    v_effective_rate := 1.0;
    v_base_amount    := ROUND(v_foreign_amount, 2);
  ELSIF v_currency = 'YER' THEN
    IF COALESCE(p_exchange_rate, 0) <= 0 OR p_exchange_rate = 1 THEN
      RAISE EXCEPTION 'invalid_currency_rate: سعر صرف الريال اليمني غير صالح (%)' , p_exchange_rate USING ERRCODE = '23514';
    END IF;
    v_effective_rate := CASE WHEN p_exchange_rate > 1 THEN ROUND(1.0 / p_exchange_rate, 6) ELSE p_exchange_rate END;
    v_base_amount    := ROUND(public.fn_to_base_amount(v_currency, v_foreign_amount, v_effective_rate), 2);
  ELSE
    v_effective_rate := COALESCE(NULLIF(p_exchange_rate, 0), 1.0);
    v_base_amount    := ROUND(public.fn_to_base_amount(v_currency, v_foreign_amount, v_effective_rate), 2);
  END IF;

  v_ref_type := CASE p_bond_type
    WHEN 'receipt' THEN 'receipt_bond'
    WHEN 'payment' THEN 'payment_bond'
    WHEN 'disbursement' THEN 'payment_bond'
    WHEN 'transfer' THEN 'transfer_bond'
    ELSE NULL
  END;
  IF v_ref_type IS NULL THEN
    RAISE EXCEPTION 'نوع السند غير صحيح: %', p_bond_type;
  END IF;

  IF p_bond_type = 'transfer' THEN
    PERFORM public.assert_account_belongs_to_company(p_counterparty_id, p_company_id, 'p_counterparty_id (transfer target account)');
    v_counterparty_account_id := p_counterparty_id;
  ELSIF p_counterparty_type = 'account' THEN
    PERFORM public.assert_account_belongs_to_company(p_counterparty_id, p_company_id, 'p_counterparty_id (account)');
    v_counterparty_account_id := p_counterparty_id;
  ELSE
    PERFORM public.assert_party_belongs_to_company(p_counterparty_id, p_company_id, 'p_counterparty_id (party)');
    v_party_id := p_counterparty_id;
    SELECT type INTO v_party_type FROM public.parties WHERE id = p_counterparty_id;
    IF v_party_type IS NULL THEN
      RAISE EXCEPTION 'الطرف التجاري غير موجود: %', p_counterparty_id;
    END IF;
  END IF;

  PERFORM set_config('app.rpc_authorized', 'true', true);

  INSERT INTO public.payments(
    company_id, branch_id, party_id, counterparty_account_id, type, amount, currency_code, exchange_rate,
    payment_date, payment_method, account_id, reference_type, notes, status, created_by, idempotency_key
  ) VALUES (
    p_company_id, p_branch_id, v_party_id, v_counterparty_account_id,
    CASE WHEN p_bond_type = 'disbursement' THEN 'disbursement' ELSE p_bond_type END,
    v_foreign_amount, v_currency, v_effective_rate,
    p_date, p_payment_method, p_cash_account_id, v_ref_type, p_description, 'posted', v_uid, v_clean_idem
  ) RETURNING id, payment_number INTO v_payment_id, v_main_payment_number;

  SELECT id INTO v_journal_id
  FROM public.journal_entries
  WHERE reference_id = v_payment_id AND deleted_at IS NULL
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    IF v_party_id IS NOT NULL THEN
      RAISE EXCEPTION 'auto_post_failed: لم يتم ترحيل السند تلقائياً كما هو متوقع';
    END IF;

    INSERT INTO public.journal_entries(company_id, branch_id, entry_date, description, reference_type, reference_id, status, created_by)
    VALUES (p_company_id, p_branch_id, p_date, p_description, v_ref_type, v_payment_id, 'draft', v_uid)
    RETURNING id INTO v_journal_id;

    IF p_bond_type = 'receipt' THEN
      v_dr_account := p_cash_account_id;
      v_cr_account := v_counterparty_account_id;
    ELSE
      v_dr_account := v_counterparty_account_id;
      v_cr_account := p_cash_account_id;
    END IF;

    INSERT INTO public.journal_entry_lines(journal_entry_id, account_id, party_id, debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount, company_id, branch_id)
    VALUES
      (v_journal_id, v_dr_account, NULL, v_base_amount, 0, p_description, v_currency, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id),
      (v_journal_id, v_cr_account, NULL, 0, v_base_amount, p_description, v_currency, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id);

    UPDATE public.journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  -- Allocate against invoice using BASE currency (SAR) since invoices.total_amount and paid_amount are in SAR
  IF p_invoice_id IS NOT NULL THEN
    SELECT currency_code, total_amount - COALESCE(paid_amount, 0)
    INTO v_inv_currency, v_remaining
    FROM public.invoices
    WHERE id = p_invoice_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'الفاتورة المحددة غير موجودة ضمن شركة السند';
    END IF;

    IF COALESCE(v_inv_currency, 'SAR') <> v_currency THEN
      RAISE EXCEPTION 'تعذر تخصيص السند: عملة السند (%) تختلف عن عملة الفاتورة (%). سجّل السند بنفس عملة الفاتورة أو اتركه بدون تخصيص',
        v_currency, v_inv_currency;
    END IF;

    IF COALESCE(v_remaining, 0) <= 0 THEN
      RAISE EXCEPTION 'الفاتورة المحددة مسددة بالكامل - لا يمكن تخصيص سند إضافي لها';
    END IF;

    v_alloc_amount := LEAST(v_base_amount, v_remaining);

    IF v_alloc_amount > 0 THEN
      INSERT INTO public.payment_allocations(payment_id, invoice_id, amount, company_id)
      VALUES (v_payment_id, p_invoice_id, v_alloc_amount, p_company_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF v_comm_amount > 0 AND p_commission_account_id IS NOT NULL AND v_main_payment_number IS NOT NULL THEN
    INSERT INTO public.payments(
      company_id, branch_id, party_id, counterparty_account_id, payment_number,
      type, amount, currency_code, exchange_rate,
      payment_date, payment_method, account_id, reference_type, reference_id, notes, status, created_by
    ) VALUES (
      p_company_id, p_branch_id, NULL, p_commission_account_id, v_main_payment_number || ':comm',
      'disbursement', v_comm_amount, v_currency, v_effective_rate,
      p_date, p_payment_method, p_cash_account_id, 'payment_bond', v_payment_id,
      'عمولة سند: ' || COALESCE(NULLIF(p_description, ''), v_main_payment_number),
      'posted', v_uid
    ) RETURNING id INTO v_comm_payment_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_payment_id,
    'payment_number', v_main_payment_number,
    'journal_id', v_journal_id,
    'commission_payment_id', v_comm_payment_id,
    'base_amount', v_base_amount,
    'foreign_amount', v_foreign_amount,
    'exchange_rate', v_effective_rate,
    'status', 'success'
  );
END;
$function$;

-- 4. commit_expense_v2 (3-arg)
CREATE OR REPLACE FUNCTION public.commit_expense_v2(
  p_company_id uuid,
  p_user_id uuid,
  p_data jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_user_id);
  v_expense_id uuid;
  v_voucher_number text;
  v_idempotency_key text;
  v_category_id uuid;
  v_amount numeric;
  v_base_amount numeric;
  v_currency_code text;
  v_exchange_rate numeric;
  v_date date;
  v_description text;
  v_payment_method text;
  v_branch_id uuid;
  v_fiscal_year_id uuid;
  v_cash_account_id uuid;
  v_explicit_acc_raw text;
  v_expense_account_id uuid;
  v_entry_id uuid;
  v_raw_cat text;
  v_raw_branch text;
  v_raw_amount text;
  v_existing_id uuid;
  v_existing_voucher text;
  v_existing_amount numeric;
  v_existing_je_id uuid;
  v_max_voucher bigint;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id_required: معرف المنشأة مطلوب';
  END IF;

  IF v_uid IS NULL OR (
    NOT public.is_super_admin() AND NOT EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = v_uid
        AND ucr.company_id = p_company_id
        AND ucr.role IN ('owner', 'admin', 'manager', 'accountant', 'cashier')
    )
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية تسجيل مصروف' USING ERRCODE = '42501';
  END IF;

  -- 1) Sanitize Amount & Exchange Rate
  v_raw_amount := REPLACE(REPLACE(COALESCE(p_data->>'amount', '0'), ',', '.'), ' ', '');
  v_amount := COALESCE(v_raw_amount::numeric, 0);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: مبلغ المصروف يجب أن يكون أكبر من الصفر';
  END IF;

  v_currency_code := UPPER(TRIM(COALESCE(NULLIF(p_data->>'currency_code', ''), NULLIF(p_data->>'currency', ''), 'SAR')));
  v_exchange_rate := COALESCE(NULLIF(p_data->>'exchange_rate', '')::numeric, 1);

  IF v_currency_code = 'SAR' THEN
    v_exchange_rate := 1;
  ELSIF v_currency_code = 'YER' THEN
    IF v_exchange_rate <= 0 OR v_exchange_rate = 1 THEN
      RAISE EXCEPTION 'invalid_currency_rate: سعر صرف الريال اليمني غير صالح (%)' , v_exchange_rate USING ERRCODE = '23514';
    END IF;
    IF v_exchange_rate > 1 THEN
      v_exchange_rate := ROUND(1.0 / v_exchange_rate, 6);
    END IF;
  ELSIF v_exchange_rate <= 0 THEN
    v_exchange_rate := 1;
  END IF;

  -- 2) Sanitize Date & Description
  BEGIN
    v_date := COALESCE(
      NULLIF(p_data->>'expense_date', '')::date,
      NULLIF(p_data->>'date', '')::date,
      CURRENT_DATE
    );
  EXCEPTION WHEN OTHERS THEN
    v_date := CURRENT_DATE;
  END;

  v_description    := COALESCE(NULLIF(TRIM(p_data->>'description'), ''), 'مصروف نثري');
  v_payment_method := LOWER(COALESCE(NULLIF(TRIM(p_data->>'payment_method'), ''), 'cash'));

  -- 2b) Currency Sanity Guard
  IF v_currency_code = 'SAR' AND v_amount >= 500.0 THEN
    IF (v_description ~* '(عشاء|غداء|غدا|قات|ماء|ثلج|حلاقة|رصيد|تكس|مدرسة|دفاتر|طماط|بصل|كريم|سيجارة|نثري)')
       AND NOT COALESCE((p_data->>'confirm_large_sar')::boolean, false) THEN
      RAISE EXCEPTION 'suspected_currency_mistake: المبلغ المدخل (% ر.س) يبدو كأنه بالريال اليمني لمصاريف نثرية. يرجى اختيار الريال اليمني (YER) أو تأكيد المبلغ بالريال السعودي.', v_amount;
    END IF;
  END IF;

  v_base_amount := ROUND(public.fn_to_base_amount(v_currency_code, v_amount, v_exchange_rate), 2);

  -- 3) Sanitize Category UUID
  v_raw_cat := TRIM(COALESCE(p_data->>'category_id', ''));
  IF v_raw_cat <> '' AND v_raw_cat ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_category_id := v_raw_cat::uuid;
  ELSE
    v_category_id := NULL;
  END IF;

  IF v_category_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.expense_categories
      WHERE id = v_category_id AND company_id = p_company_id AND deleted_at IS NULL
    ) THEN
      v_category_id := NULL;
    END IF;
  END IF;

  IF v_category_id IS NULL THEN
    SELECT id INTO v_category_id FROM public.expense_categories
    WHERE company_id = p_company_id AND deleted_at IS NULL
    ORDER BY is_system DESC, created_at ASC
    LIMIT 1;

    IF v_category_id IS NULL THEN
      INSERT INTO public.expense_categories (company_id, name, is_system)
      VALUES (p_company_id, 'مصروفات عامة', true)
      RETURNING id INTO v_category_id;
    END IF;
  END IF;

  -- 4) Idempotency & Debounce Protection
  v_idempotency_key := NULLIF(TRIM(COALESCE(p_data->>'idempotency_key', '')), '');
  IF v_idempotency_key IS NOT NULL THEN
    SELECT id, voucher_number, amount INTO v_existing_id, v_existing_voucher, v_existing_amount
    FROM public.expenses
    WHERE company_id = p_company_id AND idempotency_key = v_idempotency_key AND deleted_at IS NULL
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      SELECT id INTO v_existing_je_id FROM public.journal_entries
      WHERE reference_id = v_existing_id AND reference_type = 'expense' AND deleted_at IS NULL LIMIT 1;

      RETURN jsonb_build_object(
        'id', v_existing_id,
        'voucher_number', v_existing_voucher,
        'amount', v_existing_amount,
        'base_amount', v_base_amount,
        'journal_entry_id', v_existing_je_id,
        'status', 'posted',
        'is_duplicate', true
      );
    END IF;
  END IF;

  SELECT id, voucher_number, amount INTO v_existing_id, v_existing_voucher, v_existing_amount
  FROM public.expenses
  WHERE company_id = p_company_id
    AND category_id = v_category_id
    AND amount = v_amount
    AND currency_code = v_currency_code
    AND expense_date = v_date
    AND description = v_description
    AND created_at >= NOW() - INTERVAL '15 seconds'
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    SELECT id INTO v_existing_je_id FROM public.journal_entries
    WHERE reference_id = v_existing_id AND reference_type = 'expense' AND deleted_at IS NULL LIMIT 1;

    RETURN jsonb_build_object(
      'id', v_existing_id,
      'voucher_number', v_existing_voucher,
      'amount', v_existing_amount,
      'base_amount', v_base_amount,
      'journal_entry_id', v_existing_je_id,
      'status', 'posted',
      'is_duplicate', true
    );
  END IF;

  -- 5) Sanitize Branch UUID
  v_raw_branch := TRIM(COALESCE(p_data->>'branch_id', ''));
  IF v_raw_branch <> '' AND v_raw_branch ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_branch_id := v_raw_branch::uuid;
  ELSE
    v_branch_id := NULL;
  END IF;

  -- 6) Require Open Fiscal Year
  SELECT id INTO v_fiscal_year_id FROM public.fiscal_years
  WHERE company_id = p_company_id AND is_closed = false
    AND v_date BETWEEN start_date AND end_date
  LIMIT 1;

  IF v_fiscal_year_id IS NULL THEN
    RAISE EXCEPTION 'fiscal_year_closed: تاريخ المصروف (%) يقع خارج سنة مالية مفتوحة', v_date;
  END IF;

  -- 7) Voucher Number (atomic serialization per company)
  PERFORM pg_advisory_xact_lock(hashtext('expense_voucher_' || p_company_id::text));

  v_voucher_number := TRIM(COALESCE(p_data->>'voucher_number', ''));
  IF v_voucher_number = '' OR EXISTS (
    SELECT 1 FROM public.expenses
    WHERE company_id = p_company_id AND voucher_number = v_voucher_number AND deleted_at IS NULL
  ) THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(voucher_number, '\D', '', 'g'), '')::bigint), 0) + 1
    INTO v_max_voucher
    FROM public.expenses
    WHERE company_id = p_company_id;

    v_voucher_number := v_max_voucher::text;
  END IF;

  -- 8) Resolve Expense Account (strictly from category, fallback 5600/5300/5200, NEVER 5100)
  SELECT a.id INTO v_expense_account_id
  FROM public.expense_categories ec
  JOIN public.accounts a ON a.id = ec.account_id
  WHERE ec.id = v_category_id
    AND a.company_id = p_company_id
    AND a.allow_posting = true
    AND a.is_active = true
    AND a.deleted_at IS NULL;

  IF v_expense_account_id IS NULL THEN
    SELECT id INTO v_expense_account_id FROM public.accounts
    WHERE company_id = p_company_id
      AND (type = 'expense' OR code LIKE '5%')
      AND code NOT IN ('5100')
      AND allow_posting = true
      AND is_active = true
      AND deleted_at IS NULL
    ORDER BY
      CASE
        WHEN code = '5600' THEN 0
        WHEN code = '5300' THEN 1
        WHEN code = '5200' THEN 2
        ELSE 3
      END, code
    LIMIT 1;
  END IF;

  -- 9) Resolve Funding Account: explicit account -> bank for bank/card/transfer -> cash matching currency
  v_explicit_acc_raw := TRIM(COALESCE(p_data->>'payment_account_id', p_data->>'cash_account_id', p_data->>'account_id', ''));
  IF v_explicit_acc_raw <> '' AND v_explicit_acc_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_cash_account_id FROM public.accounts
    WHERE id = v_explicit_acc_raw::uuid
      AND company_id = p_company_id
      AND allow_posting = true
      AND is_active = true
      AND deleted_at IS NULL;
  END IF;

  IF v_cash_account_id IS NULL AND v_payment_method IN ('bank', 'bank_transfer', 'transfer', 'card', 'network', 'pos') THEN
    SELECT id INTO v_cash_account_id FROM public.accounts
    WHERE company_id = p_company_id
      AND (code LIKE '102%' OR code LIKE '112%' OR (type = 'asset' AND (name_ar LIKE '%بنك%' OR name_ar LIKE '%مصرف%' OR name_en ILIKE '%bank%')))
      AND allow_posting = true
      AND is_active = true
      AND deleted_at IS NULL
    ORDER BY CASE WHEN currency_code = v_currency_code THEN 0 ELSE 1 END, code
    LIMIT 1;
  END IF;

  IF v_cash_account_id IS NULL THEN
    SELECT id INTO v_cash_account_id FROM public.accounts
    WHERE company_id = p_company_id
      AND (code LIKE '101%' OR code LIKE '1101%' OR (type = 'asset' AND (name_ar LIKE '%صندوق%' OR name_ar LIKE '%نقد%' OR name_ar LIKE '%كاش%')) OR (type = 'asset' AND name_en ILIKE '%cash%'))
      AND allow_posting = true
      AND is_active = true
      AND deleted_at IS NULL
    ORDER BY CASE WHEN currency_code = v_currency_code THEN 0 ELSE 1 END, code
    LIMIT 1;
  END IF;

  IF v_expense_account_id IS NULL OR v_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'auto_post_failed: تعذر العثور على حساب المصروف أو حساب الخزينة/البنك القابل للترحيل';
  END IF;

  -- 10) Insert Expense
  INSERT INTO public.expenses (
    company_id, category_id, voucher_number, description,
    amount, currency_code, exchange_rate, expense_date,
    status, payment_method, created_by, branch_id, idempotency_key
  ) VALUES (
    p_company_id, v_category_id, v_voucher_number, v_description,
    v_amount, v_currency_code, v_exchange_rate, v_date,
    'posted', v_payment_method, v_uid, v_branch_id, v_idempotency_key
  ) RETURNING id INTO v_expense_id;

  -- 11) Create & Post Balanced Journal Entry
  PERFORM set_config('app.rpc_authorized', 'true', true);

  INSERT INTO public.journal_entries (
    company_id, entry_date, description,
    reference_type, reference_id, status, created_by, branch_id, fiscal_year_id
  ) VALUES (
    p_company_id,
    v_date, v_description,
    'expense', v_expense_id, 'draft', v_uid, v_branch_id, v_fiscal_year_id
  ) RETURNING id INTO v_entry_id;

  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount,
    description, currency_code, exchange_rate, foreign_amount, company_id, branch_id
  ) VALUES
    (v_entry_id, v_expense_account_id, v_base_amount, 0,
     v_description, v_currency_code, v_exchange_rate, v_amount, p_company_id, v_branch_id),
    (v_entry_id, v_cash_account_id, 0, v_base_amount,
     v_description, v_currency_code, v_exchange_rate, v_amount, p_company_id, v_branch_id);

  UPDATE public.journal_entries
  SET status = 'posted'
  WHERE id = v_entry_id;

  -- 12) Audit Write
  BEGIN
    PERFORM public.audit_write(
      'expense_committed', 'expenses',
      v_expense_id,
      p_company_id,
      jsonb_build_object('amount', v_amount, 'base_amount', v_base_amount, 'voucher_number', v_voucher_number, 'journal_entry_id', v_entry_id)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'id', v_expense_id,
    'voucher_number', v_voucher_number,
    'amount', v_amount,
    'base_amount', v_base_amount,
    'journal_entry_id', v_entry_id,
    'status', 'posted',
    'is_duplicate', false
  );
END;
$function$;

-- 5. fn_reverse_journal_entries (6-arg)
CREATE OR REPLACE FUNCTION public.fn_reverse_journal_entries(
  p_source_reference_id uuid,
  p_source_reference_types text[],
  p_new_reference_type text,
  p_description_prefix text,
  p_created_by uuid,
  p_company_id uuid
)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_je RECORD;
  v_new_je_id uuid;
  v_line RECORD;
  v_result uuid[] := '{}';
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  PERFORM set_config('app.rpc_authorized', 'true', true);

  FOR v_je IN
    SELECT id, description, branch_id, fiscal_year_id FROM journal_entries
    WHERE reference_id = p_source_reference_id
      AND reference_type = ANY(p_source_reference_types)
      AND status = 'posted' AND deleted_at IS NULL
      AND company_id = p_company_id
    ORDER BY created_at ASC
  LOOP
    INSERT INTO journal_entries(
      company_id, branch_id, fiscal_year_id, entry_date, description,
      reference_type, reference_id, status, created_by
    )
    VALUES (
      p_company_id, v_je.branch_id, v_je.fiscal_year_id, CURRENT_DATE,
      p_description_prefix || COALESCE(v_je.description, ''),
      p_new_reference_type, p_source_reference_id, 'draft', p_created_by
    )
    RETURNING id INTO v_new_je_id;

    FOR v_line IN
      SELECT * FROM journal_entry_lines
      WHERE journal_entry_id = v_je.id AND deleted_at IS NULL
    LOOP
      INSERT INTO journal_entry_lines(
        journal_entry_id, account_id, party_id, branch_id,
        debit_amount, credit_amount,
        description, currency_code, exchange_rate, foreign_amount, company_id
      )
      VALUES (
        v_new_je_id, v_line.account_id, v_line.party_id, v_line.branch_id,
        v_line.credit_amount, v_line.debit_amount,
        'عكس: ' || COALESCE(v_line.description, ''), v_line.currency_code, v_line.exchange_rate,
        v_line.foreign_amount, p_company_id
      );
    END LOOP;

    UPDATE journal_entries SET status = 'posted' WHERE id = v_new_je_id;

    v_result := v_result || v_new_je_id;
  END LOOP;

  RETURN v_result;
END;
$function$;

-- 6. void_invoice (1-arg)
CREATE OR REPLACE FUNCTION public.void_invoice(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invoice      RECORD;
  v_new_jes      uuid[];
  v_pay          RECORD;
  v_void_ref     text;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found: %', p_invoice_id;
  END IF;

  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = v_invoice.company_id
      AND ucr.role IN ('owner', 'admin', 'accountant')
  ) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  IF v_invoice.status = 'void' THEN
    RAISE EXCEPTION 'already_void: الفاتورة ملغية مسبقاً';
  END IF;

  PERFORM set_config('app.rpc_authorized', 'true', true);

  IF v_invoice.status = 'draft' THEN
    UPDATE public.invoices SET status = 'void', updated_at = now() WHERE id = p_invoice_id;
    PERFORM public.audit_write(
      'invoice_voided', 'invoices', p_invoice_id, v_invoice.company_id,
      jsonb_build_object('invoice_number', v_invoice.invoice_number, 'reversal_journal_count', 0)
    );
    RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'note', 'draft_cancelled');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_years
    WHERE company_id = v_invoice.company_id
      AND CURRENT_DATE BETWEEN start_date AND end_date AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'fiscal_year_closed: لا يمكن إلغاء فاتورة في سنة مالية مغلقة';
  END IF;

  -- Include both 'sale_invoice' and 'sales_invoice'
  PERFORM public.fn_reverse_inventory_for_reference(
    p_invoice_id,
    ARRAY['invoice', 'sale_invoice', 'sales_invoice', 'purchase_invoice', 'sale_return', 'sales_return', 'purchase_return'],
    'void_invoice'
  );

  -- Include 'invoice' so historical migrated invoices reverse cleanly
  v_new_jes := public.fn_reverse_journal_entries(
    p_invoice_id,
    ARRAY['invoice', 'sale_invoice', 'sales_invoice', 'purchase_invoice', 'sale_return', 'sales_return', 'purchase_return', 'receipt_bond', 'payment_bond'],
    'invoice_void',
    'عكس: ' || v_invoice.invoice_number || ' - ',
    auth.uid(), v_invoice.company_id
  );

  -- Capture linked payment IDs, then soft-delete allocations BEFORE voiding payments
  UPDATE public.payment_allocations SET deleted_at = now(), updated_at = now()
  WHERE invoice_id = p_invoice_id AND deleted_at IS NULL;

  PERFORM set_config('app.voiding_payment', 'true', true);

  FOR v_pay IN
    SELECT DISTINCT p.id, p.payment_number, p.type
    FROM public.payment_allocations pa
    JOIN public.payments p ON p.id = pa.payment_id
    WHERE pa.invoice_id = p_invoice_id
      AND p.company_id = v_invoice.company_id
      AND p.deleted_at IS NULL
      AND p.status <> 'void'
  LOOP
    v_void_ref := CASE
      WHEN v_pay.type = 'receipt' THEN 'receipt_bond_void'
      WHEN v_pay.type = 'transfer' THEN 'transfer_bond_void'
      ELSE 'payment_bond_void'
    END;
    PERFORM public.fn_reverse_journal_entries(
      v_pay.id,
      ARRAY['receipt_bond', 'payment_bond', 'transfer_bond', 'payment', 'voucher'],
      v_void_ref,
      'عكس سند مرتبط بالفاتورة: ' || COALESCE(v_pay.payment_number, '') || ' - ',
      auth.uid(),
      v_invoice.company_id
    );
    UPDATE public.payments SET status = 'void', updated_at = now() WHERE id = v_pay.id;
  END LOOP;

  PERFORM set_config('app.voiding_payment', 'false', true);

  UPDATE public.invoices SET status = 'void', paid_amount = 0, advance_payment = 0, updated_at = now() WHERE id = p_invoice_id;

  PERFORM public.audit_write(
    'invoice_voided', 'invoices', p_invoice_id, v_invoice.company_id,
    jsonb_build_object('invoice_number', v_invoice.invoice_number, 'reversal_journal_count', coalesce(array_length(v_new_jes, 1), 0))
  );

  RETURN jsonb_build_object(
    'success', true, 'invoice_id', p_invoice_id, 'invoice_number', v_invoice.invoice_number,
    'reversal_journal_ids', v_new_jes
  );
END;
$function$;

-- 7. void_bond (1-arg)
CREATE OR REPLACE FUNCTION public.void_bond(p_payment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment record;
  v_comm    record;
  v_new_jes uuid[];
  v_void_ref_type text;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_payment IS NULL OR v_payment.status = 'void' THEN
    RAISE EXCEPTION 'Payment not found or already voided';
  END IF;

  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = v_payment.company_id
      AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية إلغاء هذا السند' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_years
    WHERE company_id = v_payment.company_id
      AND v_payment.payment_date BETWEEN start_date AND end_date
      AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'لا يمكن إلغاء سند في سنة مالية مغلقة';
  END IF;

  v_void_ref_type := CASE
    WHEN v_payment.type = 'receipt' THEN 'receipt_bond_void'
    WHEN v_payment.type = 'transfer' THEN 'transfer_bond_void'
    ELSE 'payment_bond_void'
  END;

  PERFORM set_config('app.rpc_authorized', 'true', true);

  -- Include 'voucher' so migrated live vouchers reverse cleanly
  v_new_jes := public.fn_reverse_journal_entries(
    p_payment_id,
    ARRAY['receipt_bond', 'payment_bond', 'transfer_bond', 'payment', 'voucher'],
    v_void_ref_type,
    'عكس سند: ' || COALESCE(v_payment.payment_number, '') || ' - ',
    auth.uid(),
    v_payment.company_id
  );

  UPDATE public.payment_allocations
  SET deleted_at = now(), updated_at = now()
  WHERE payment_id = p_payment_id AND deleted_at IS NULL;

  -- Preserve original + reversal JEs while setting status = 'void'
  PERFORM set_config('app.voiding_payment', 'true', true);
  UPDATE public.payments SET status = 'void', updated_at = now() WHERE id = p_payment_id;

  IF v_payment.payment_number IS NOT NULL THEN
    FOR v_comm IN
      SELECT * FROM public.payments
      WHERE company_id = v_payment.company_id
        AND payment_number = v_payment.payment_number || ':comm'
        AND status <> 'void'
        AND deleted_at IS NULL
      FOR UPDATE
    LOOP
      PERFORM public.fn_reverse_journal_entries(
        v_comm.id,
        ARRAY['receipt_bond', 'payment_bond', 'transfer_bond', 'payment', 'voucher'],
        'payment_bond_void',
        'عكس عمولة سند: ' || COALESCE(v_comm.payment_number, '') || ' - ',
        auth.uid(),
        v_comm.company_id
      );
      UPDATE public.payments SET status = 'void', updated_at = now() WHERE id = v_comm.id;
    END LOOP;
  END IF;

  PERFORM set_config('app.voiding_payment', 'false', true);

  BEGIN
    PERFORM public.audit_write(
      'bond_voided', 'payments', p_payment_id, v_payment.company_id,
      jsonb_build_object(
        'payment_number', v_payment.payment_number,
        'type', v_payment.type,
        'amount', v_payment.amount,
        'reversal_journal_ids', v_new_jes
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$;

-- 8. void_expense (1-arg) — enforce role guard + app.rpc_authorized
CREATE OR REPLACE FUNCTION public.void_expense(p_expense_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_expense RECORD;
  v_new_jes uuid[];
BEGIN
  SELECT * INTO v_expense FROM public.expenses WHERE id = p_expense_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found: %', p_expense_id;
  END IF;

  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = v_expense.company_id
      AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية إلغاء المصروفات' USING ERRCODE = '42501';
  END IF;

  IF v_expense.status = 'void' THEN
    RAISE EXCEPTION 'Expense is already voided';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_years
    WHERE company_id = v_expense.company_id AND CURRENT_DATE BETWEEN start_date AND end_date AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'لا يمكن إلغاء مصروف في سنة مالية مغلقة';
  END IF;

  PERFORM set_config('app.rpc_authorized', 'true', true);

  v_new_jes := public.fn_reverse_journal_entries(
    p_expense_id, ARRAY['expense'], 'expense_void', 'عكس مصروف: ' || COALESCE(v_expense.description, '') || ' - ',
    auth.uid(), v_expense.company_id
  );

  UPDATE public.expenses SET status = 'void', updated_at = now() WHERE id = p_expense_id;

  BEGIN
    PERFORM public.audit_write(
      'expense_voided', 'expenses', p_expense_id, v_expense.company_id,
      jsonb_build_object(
        'amount', v_expense.amount,
        'voucher_number', v_expense.voucher_number,
        'description', v_expense.description,
        'reversal_journal_ids', v_new_jes
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'expense_id', p_expense_id,
    'reversal_journal_ids', v_new_jes
  );
END;
$function$;

-- 9. finalize_audit_session (3-arg) — add app.rpc_authorized for managers
CREATE OR REPLACE FUNCTION public.finalize_audit_session(p_session_id uuid, p_user_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session RECORD;
    v_item JSONB;
    v_new_qty NUMERIC;
    v_raw_qty NUMERIC;
    v_current_qty NUMERIC;
    v_diff NUMERIC;
    v_adj_count INT := 0;
    v_product RECORD;
    v_txn_type TEXT;
    v_effective_user_id UUID;
    v_unit_cost NUMERIC;
    v_line_cost NUMERIC;
    v_total_adj_gain NUMERIC := 0;
    v_total_adj_loss NUMERIC := 0;
    v_inv_account_id UUID;
    v_adj_account_id UUID;
    v_branch_id UUID;
    v_journal_id UUID;
    v_net_adj NUMERIC;
BEGIN
    v_effective_user_id := auth.uid();

    IF v_effective_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_session
    FROM public.audit_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'جلسة الجرد غير موجودة' USING ERRCODE = 'P0002';
    END IF;

    IF v_session.status <> 'active' THEN
        IF v_session.status = 'completed' THEN
            RETURN jsonb_build_object('status', 'already_completed', 'adjusted', 0);
        ELSE
            RAISE EXCEPTION 'لا يمكن اعتماد جلسة جرد ملغاة أو غير نشطة' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF NOT (v_session.company_id IN (SELECT public.get_auth_companies()) AND public.user_is_admin_or_manager(v_session.company_id)) THEN
        RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية اعتماد وترحيل الجرد' USING ERRCODE = '42501';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'بنود الاعتماد غير صالحة' USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(p_items) > 10000 THEN
        RAISE EXCEPTION 'عدد بنود الاعتماد يتجاوز الحد المسموح (10000)' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        IF (v_item->>'counted_quantity') IS NULL OR (v_item->>'product_id') IS NULL THEN
            CONTINUE;
        END IF;

        v_raw_qty := (v_item->>'counted_quantity')::NUMERIC;

        IF v_raw_qty IS NULL
           OR v_raw_qty = 'NaN'::NUMERIC
           OR v_raw_qty = 'Infinity'::NUMERIC
           OR v_raw_qty = '-Infinity'::NUMERIC
           OR v_raw_qty < 0
           OR v_raw_qty > 1000000 THEN
            RAISE EXCEPTION 'كمية الجرد غير صالحة للمنتج %', (v_item->>'product_id') USING ERRCODE = '22023';
        END IF;

        SELECT id INTO v_product
        FROM public.audit_items
        WHERE session_id = p_session_id
          AND product_id = (v_item->>'product_id')::UUID;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'المنتج % غير مرصود في بنود جلسة الجرد', (v_item->>'product_id') USING ERRCODE = '22023';
        END IF;

        SELECT id INTO v_product
        FROM public.products
        WHERE id = (v_item->>'product_id')::UUID
          AND company_id = v_session.company_id
          AND deleted_at IS NULL;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'المنتج غير موجود أو لا ينتمي لمنشأة جلسة الجرد' USING ERRCODE = '22023';
        END IF;

        v_new_qty := v_raw_qty;

        UPDATE public.audit_items
        SET counted_quantity = v_new_qty
        WHERE session_id = p_session_id
          AND product_id = (v_item->>'product_id')::UUID;

        SELECT quantity INTO v_current_qty
        FROM public.product_stock
        WHERE company_id = v_session.company_id
          AND product_id = (v_item->>'product_id')::UUID
          AND warehouse_id = v_session.warehouse_id
        FOR UPDATE;

        IF NOT FOUND THEN
            v_current_qty := 0;
        END IF;

        v_diff := v_new_qty - v_current_qty;

        IF v_diff = 0 THEN
            INSERT INTO public.product_stock (product_id, warehouse_id, quantity, company_id, updated_by, updated_at)
            VALUES (
                (v_item->>'product_id')::UUID,
                v_session.warehouse_id,
                v_new_qty,
                v_session.company_id,
                v_effective_user_id,
                NOW()
            )
            ON CONFLICT (company_id, product_id, warehouse_id) DO NOTHING;
        ELSE
            SELECT id, purchase_price, cost_price INTO v_product
            FROM public.products
            WHERE id = (v_item->>'product_id')::UUID;

            v_unit_cost := COALESCE(NULLIF(v_product.cost_price, 0), v_product.purchase_price, 0);
            v_line_cost := ROUND(ABS(v_diff) * v_unit_cost, 4);
            v_txn_type := CASE WHEN v_diff > 0 THEN 'adj_in' ELSE 'adj_out' END;

            IF v_diff > 0 THEN
                v_total_adj_gain := v_total_adj_gain + v_line_cost;
            ELSE
                v_total_adj_loss := v_total_adj_loss + v_line_cost;
            END IF;

            INSERT INTO public.inventory_transactions (
                company_id, product_id, warehouse_id, quantity,
                unit_cost, total_cost, transaction_type,
                reference_type, reference_id, created_by
            ) VALUES (
                v_session.company_id,
                (v_item->>'product_id')::UUID,
                v_session.warehouse_id,
                ABS(v_diff),
                v_unit_cost,
                v_line_cost,
                v_txn_type,
                'stock_audit',
                p_session_id,
                v_effective_user_id
            );
        END IF;

        v_adj_count := v_adj_count + 1;
    END LOOP;

    v_net_adj := ROUND(v_total_adj_gain - v_total_adj_loss, 2);
    IF ABS(v_net_adj) > 0.01 THEN
        SELECT w.branch_id INTO v_branch_id
        FROM public.warehouses w
        WHERE w.id = v_session.warehouse_id;

        SELECT a.id INTO v_inv_account_id
        FROM public.accounts a
        WHERE a.company_id = v_session.company_id
          AND a.deleted_at IS NULL
          AND COALESCE(a.allow_posting, true) = true
          AND (a.code = '1200' OR a.code LIKE 'MZ-131%' OR a.code LIKE '131%')
        ORDER BY CASE WHEN a.code = '1200' THEN 0 ELSE 1 END, a.code
        LIMIT 1;

        SELECT a.id INTO v_adj_account_id
        FROM public.accounts a
        WHERE a.company_id = v_session.company_id
          AND a.deleted_at IS NULL
          AND COALESCE(a.allow_posting, true) = true
          AND (a.code = '5200' OR a.code = '5100' OR a.code LIKE '50%')
        ORDER BY CASE WHEN a.code = '5200' THEN 0 WHEN a.code = '5100' THEN 1 ELSE 2 END, a.code
        LIMIT 1;

        IF v_inv_account_id IS NOT NULL AND v_adj_account_id IS NOT NULL THEN
            PERFORM set_config('app.rpc_authorized', 'true', true);

            INSERT INTO public.journal_entries (
                company_id, branch_id, entry_date, description, reference_type, reference_id, status, created_by
            ) VALUES (
                v_session.company_id,
                v_branch_id,
                CURRENT_DATE,
                'تسوية فروقات الجرد المخزني',
                'stock_audit',
                p_session_id,
                'draft',
                v_effective_user_id
            ) RETURNING id INTO v_journal_id;

            IF v_net_adj > 0 THEN
                INSERT INTO public.journal_entry_lines (
                    journal_entry_id, account_id, debit_amount, credit_amount, description, company_id, branch_id
                ) VALUES
                    (v_journal_id, v_inv_account_id, v_net_adj, 0, 'فائض جرد مخزني', v_session.company_id, v_branch_id),
                    (v_journal_id, v_adj_account_id, 0, v_net_adj, 'فائض جرد مخزني', v_session.company_id, v_branch_id);
            ELSE
                INSERT INTO public.journal_entry_lines (
                    journal_entry_id, account_id, debit_amount, credit_amount, description, company_id, branch_id
                ) VALUES
                    (v_journal_id, v_adj_account_id, ABS(v_net_adj), 0, 'عجز جرد مخزني', v_session.company_id, v_branch_id),
                    (v_journal_id, v_inv_account_id, 0, ABS(v_net_adj), 'عجز جرد مخزني', v_session.company_id, v_branch_id);
            END IF;

            UPDATE public.journal_entries SET status = 'posted' WHERE id = v_journal_id;
        END IF;
    END IF;

    UPDATE public.audit_sessions
    SET status = 'completed',
        completed_at = NOW(),
        completed_by = v_effective_user_id
    WHERE id = p_session_id;

    UPDATE public.inventory_session_drafts
    SET items = '[]'::jsonb, updated_at = NOW()
    WHERE session_id = p_session_id;

    RETURN jsonb_build_object(
        'status', 'completed',
        'adjusted', v_adj_count,
        'journal_id', v_journal_id
    );
END;
$function$;

-- 10. fn_close_fiscal_year (2-arg) — add jel.deleted_at IS NULL + app.rpc_authorized
CREATE OR REPLACE FUNCTION public.fn_close_fiscal_year(p_fiscal_year_id uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_fy RECORD;
  v_company_id uuid;
  v_branch_id uuid;
  v_base_currency text;
  v_retained_earnings_account RECORD;
  v_je_id uuid;
  v_rev_cur RECORD;
  v_exp_cur RECORD;
  v_total_rev numeric := 0;
  v_total_exp numeric := 0;
  v_net_income numeric := 0;
  v_line_count int := 0;
  v_next_fy_id uuid;
  v_next_year_name text;
  v_next_start_date date;
  v_next_end_date date;
  v_current_user_id uuid;
BEGIN
  SELECT * INTO v_fy FROM fiscal_years WHERE id = p_fiscal_year_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fiscal_year_not_found: السنة المالية غير موجودة';
  END IF;

  v_company_id := v_fy.company_id;
  PERFORM public.fn_assert_company_access(v_company_id);

  IF NOT (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = auth.uid()
        AND ucr.company_id = v_company_id
        AND ucr.role = 'owner'
    )
  ) THEN
    RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية: إغلاق السنة المالية عملية سيادية تتطلب صلاحية المالك (owner)'
      USING ERRCODE = '42501';
  END IF;

  IF v_fy.is_closed THEN
    RAISE EXCEPTION 'fiscal_year_already_closed: هذه السنة المالية مقفلة مسبقاً في تاريخ %', v_fy.closed_at;
  END IF;

  SELECT base_currency INTO v_base_currency FROM companies WHERE id = v_company_id;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  SELECT * INTO v_retained_earnings_account
  FROM accounts
  WHERE company_id = v_company_id AND code = '3200' AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'retained_earnings_account_missing: لم يتم العثور على حساب الأرباح المبقاة (3200)';
  END IF;

  SELECT id INTO v_branch_id FROM branches WHERE company_id = v_company_id AND is_main = true LIMIT 1;
  v_current_user_id := COALESCE(p_created_by, auth.uid());

  PERFORM set_config('app.rpc_authorized', 'true', true);

  INSERT INTO journal_entries (
    company_id, branch_id, fiscal_year_id, entry_date, description,
    reference_type, reference_id, status, created_by
  )
  VALUES (
    v_company_id, v_branch_id, v_fy.id, v_fy.end_date,
    'قيد إقفال السنة المالية ' || v_fy.name || ' وترحيل الأرباح والخسائر',
    'fiscal_year_closing', v_fy.id, 'draft', v_current_user_id
  )
  RETURNING id INTO v_je_id;

  FOR v_rev_cur IN
    SELECT
      jel.account_id,
      a.code,
      a.name_ar,
      SUM(jel.credit_amount - jel.debit_amount) AS net_credit
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    JOIN accounts a ON a.id = jel.account_id
    WHERE je.company_id = v_company_id
      AND (je.fiscal_year_id = v_fy.id OR (je.entry_date BETWEEN v_fy.start_date AND v_fy.end_date))
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
      AND jel.deleted_at IS NULL
      AND a.type = 'revenue'
      AND je.id != v_je_id
      AND COALESCE(je.reference_type, '') != 'fiscal_year_closing'
    GROUP BY jel.account_id, a.code, a.name_ar
    HAVING SUM(jel.credit_amount - jel.debit_amount) != 0
  LOOP
    v_total_rev := v_total_rev + v_rev_cur.net_credit;
    v_line_count := v_line_count + 1;

    IF v_rev_cur.net_credit > 0 THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, branch_id, company_id,
        debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount
      ) VALUES (
        v_je_id, v_rev_cur.account_id, v_branch_id, v_company_id,
        v_rev_cur.net_credit, 0,
        'إقفال إيراد: ' || v_rev_cur.name_ar, v_base_currency, 1, 0
      );
    ELSE
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, branch_id, company_id,
        debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount
      ) VALUES (
        v_je_id, v_rev_cur.account_id, v_branch_id, v_company_id,
        0, ABS(v_rev_cur.net_credit),
        'إقفال إيراد مدين: ' || v_rev_cur.name_ar, v_base_currency, 1, 0
      );
    END IF;
  END LOOP;

  FOR v_exp_cur IN
    SELECT
      jel.account_id,
      a.code,
      a.name_ar,
      SUM(jel.debit_amount - jel.credit_amount) AS net_debit
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    JOIN accounts a ON a.id = jel.account_id
    WHERE je.company_id = v_company_id
      AND (je.fiscal_year_id = v_fy.id OR (je.entry_date BETWEEN v_fy.start_date AND v_fy.end_date))
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
      AND jel.deleted_at IS NULL
      AND a.type = 'expense'
      AND je.id != v_je_id
      AND COALESCE(je.reference_type, '') != 'fiscal_year_closing'
    GROUP BY jel.account_id, a.code, a.name_ar
    HAVING SUM(jel.debit_amount - jel.credit_amount) != 0
  LOOP
    v_total_exp := v_total_exp + v_exp_cur.net_debit;
    v_line_count := v_line_count + 1;

    IF v_exp_cur.net_debit > 0 THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, branch_id, company_id,
        debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount
      ) VALUES (
        v_je_id, v_exp_cur.account_id, v_branch_id, v_company_id,
        0, v_exp_cur.net_debit,
        'إقفال مصروف: ' || v_exp_cur.name_ar, v_base_currency, 1, 0
      );
    ELSE
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, branch_id, company_id,
        debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount
      ) VALUES (
        v_je_id, v_exp_cur.account_id, v_branch_id, v_company_id,
        ABS(v_exp_cur.net_debit), 0,
        'إقفال مصروف دائن: ' || v_exp_cur.name_ar, v_base_currency, 1, 0
      );
    END IF;
  END LOOP;

  v_net_income := v_total_rev - v_total_exp;

  IF v_net_income > 0 THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, branch_id, company_id,
      debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount
    ) VALUES (
      v_je_id, v_retained_earnings_account.id, v_branch_id, v_company_id,
      0, v_net_income,
      'ترحيل صافي أرباح السنة المالية ' || v_fy.name, v_base_currency, 1, 0
    );
    v_line_count := v_line_count + 1;
  ELSIF v_net_income < 0 THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, branch_id, company_id,
      debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount
    ) VALUES (
      v_je_id, v_retained_earnings_account.id, v_branch_id, v_company_id,
      ABS(v_net_income), 0,
      'ترحيل صافي خسائر السنة المالية ' || v_fy.name, v_base_currency, 1, 0
    );
    v_line_count := v_line_count + 1;
  END IF;

  IF v_line_count > 0 THEN
    UPDATE journal_entries SET status = 'posted' WHERE id = v_je_id;
  ELSE
    UPDATE journal_entries SET status = 'void', deleted_at = NOW() WHERE id = v_je_id;
    v_je_id := NULL;
  END IF;

  UPDATE fiscal_years
  SET is_closed = true, closed_at = NOW(), updated_at = NOW()
  WHERE id = v_fy.id;

  v_next_year_name := 'سنة ' || (to_char(v_fy.end_date + INTERVAL '1 day', 'YYYY')) || ' المالية';
  v_next_start_date := v_fy.end_date + INTERVAL '1 day';
  v_next_end_date := (v_fy.end_date + INTERVAL '1 day' + INTERVAL '1 year' - INTERVAL '1 day')::date;

  SELECT id INTO v_next_fy_id FROM fiscal_years
  WHERE company_id = v_company_id AND start_date = v_next_start_date;

  IF v_next_fy_id IS NULL THEN
    INSERT INTO fiscal_years (company_id, name, start_date, end_date, is_closed)
    VALUES (v_company_id, v_next_year_name, v_next_start_date, v_next_end_date, false)
    RETURNING id INTO v_next_fy_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'closed_fiscal_year_id', v_fy.id,
    'closing_journal_entry_id', v_je_id,
    'total_revenues', v_total_rev,
    'total_expenses', v_total_exp,
    'net_income', v_net_income,
    'next_fiscal_year_id', v_next_fy_id
  );
END;
$function$;

-- Explicit RPC execute privileges
REVOKE EXECUTE ON FUNCTION public.create_financial_bond(uuid, text, numeric, text, numeric, numeric, date, uuid, uuid, text, text, uuid, uuid, text, uuid, text, numeric, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_financial_bond(uuid, text, numeric, text, numeric, numeric, date, uuid, uuid, text, text, uuid, uuid, text, uuid, text, numeric, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.commit_expense_v2(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.commit_expense_v2(uuid, uuid, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_reverse_journal_entries(uuid, text[], text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reverse_journal_entries(uuid, text[], text, text, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.void_invoice(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.void_invoice(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.void_bond(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.void_bond(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.void_expense(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.void_expense(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_audit_session(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.finalize_audit_session(uuid, uuid, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_close_fiscal_year(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_close_fiscal_year(uuid, uuid) TO authenticated, service_role;
