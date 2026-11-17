-- Fix create_financial_bond (draft->posted order & receipt/payment direction for account bonds)
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
  v_remaining numeric;
  v_alloc_amount numeric;
  v_uid uuid := auth.uid();
  v_dr_account uuid;
  v_cr_account uuid;
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
    WHEN 'receipt' THEN 'receipt_bond'
    WHEN 'payment' THEN 'payment_bond'
    WHEN 'disbursement' THEN 'payment_bond'
    WHEN 'transfer' THEN 'internal_transfer'
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

  INSERT INTO payments(
    company_id, branch_id, party_id, type, amount, currency_code, exchange_rate,
    payment_date, payment_method, account_id, reference_type, notes, status, created_by
  ) VALUES (
    p_company_id, p_branch_id, v_party_id, CASE WHEN p_bond_type='disbursement' THEN 'disbursement' ELSE p_bond_type END,
    v_foreign_amount, p_currency_code, v_effective_rate,
    p_date, p_payment_method, p_cash_account_id, v_ref_type, p_description, 'posted', v_uid
  ) RETURNING id INTO v_payment_id;

  IF v_party_id IS NOT NULL THEN
    SELECT id INTO v_journal_id FROM journal_entries WHERE reference_id = v_payment_id AND deleted_at IS NULL LIMIT 1;
    IF v_journal_id IS NULL THEN
      RAISE EXCEPTION 'auto_post_failed: لم يتم ترحيل السند تلقائياً كما هو متوقع';
    END IF;
  ELSE
    INSERT INTO journal_entries(company_id, branch_id, entry_date, description, reference_type, reference_id, status, created_by)
    VALUES (p_company_id, p_branch_id, p_date, p_description, v_ref_type, v_payment_id, 'draft', v_uid)
    RETURNING id INTO v_journal_id;

    IF p_bond_type = 'receipt' THEN
      v_dr_account := p_cash_account_id;
      v_cr_account := v_counterparty_account_id;
    ELSE
      v_dr_account := v_counterparty_account_id;
      v_cr_account := p_cash_account_id;
    END IF;

    INSERT INTO journal_entry_lines(journal_entry_id, account_id, party_id, debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount, company_id, branch_id)
    VALUES
      (v_journal_id, v_dr_account, NULL, v_base_amount, 0, p_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id),
      (v_journal_id, v_cr_account, NULL, 0, v_base_amount, p_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id);

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
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
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_payment_id, 'payment_number', (SELECT payment_number FROM payments WHERE id = v_payment_id),
    'journal_id', v_journal_id, 'base_amount', v_base_amount, 'foreign_amount', v_foreign_amount,
    'exchange_rate', v_effective_rate, 'status', 'success'
  );
END;
$function$;
