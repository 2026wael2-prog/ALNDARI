-- 1. Add optional p_branch_id to fn_get_vat_return_report
DROP FUNCTION IF EXISTS public.fn_get_vat_return_report(uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_get_vat_return_report(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_standard_sales numeric := 0;
  v_standard_sales_vat numeric := 0;
  v_standard_purchases numeric := 0;
  v_standard_purchases_vat numeric := 0;
  v_output_vat_ledger numeric := 0;
  v_input_vat_ledger numeric := 0;
  v_net_vat numeric := 0;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT
    COALESCE(SUM(CASE WHEN type = 'sale' THEN subtotal ELSE -subtotal END), 0),
    COALESCE(SUM(CASE WHEN type = 'sale' THEN tax_amount ELSE -tax_amount END), 0)
  INTO v_standard_sales, v_standard_sales_vat
  FROM invoices
  WHERE company_id = p_company_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND type IN ('sale', 'sale_return')
    AND status IN ('posted', 'paid', 'partially_paid')
    AND deleted_at IS NULL
    AND issue_date BETWEEN p_start_date AND p_end_date;

  SELECT
    COALESCE(SUM(CASE WHEN type = 'purchase' THEN subtotal ELSE -subtotal END), 0),
    COALESCE(SUM(CASE WHEN type = 'purchase' THEN tax_amount ELSE -tax_amount END), 0)
  INTO v_standard_purchases, v_standard_purchases_vat
  FROM invoices
  WHERE company_id = p_company_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND type IN ('purchase', 'purchase_return')
    AND status IN ('posted', 'paid', 'partially_paid')
    AND deleted_at IS NULL
    AND issue_date BETWEEN p_start_date AND p_end_date;

  SELECT
    COALESCE(SUM(credit_amount), 0),
    COALESCE(SUM(debit_amount), 0)
  INTO v_output_vat_ledger, v_input_vat_ledger
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN accounts a ON a.id = jel.account_id
  WHERE je.company_id = p_company_id
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
    AND a.code = '2200'
    AND a.deleted_at IS NULL
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date BETWEEN p_start_date AND p_end_date;

  v_net_vat := v_standard_sales_vat - v_standard_purchases_vat;

  RETURN jsonb_build_object(
    'success', true,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'sales', jsonb_build_object(
      'taxable_amount', v_standard_sales,
      'tax_amount', v_standard_sales_vat
    ),
    'purchases', jsonb_build_object(
      'taxable_amount', v_standard_purchases,
      'tax_amount', v_standard_purchases_vat
    ),
    'net_vat_payable', v_net_vat,
    'vat_account_summary', jsonb_build_object(
      'total_credits', v_output_vat_ledger,
      'total_debits', v_input_vat_ledger,
      'net_balance', (v_output_vat_ledger - v_input_vat_ledger)
    )
  );
END;
$function$;

-- 2. Fix void_invoice: include 'sales_return' and reverse journals of allocated payments
CREATE OR REPLACE FUNCTION public.void_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_invoice      RECORD;
  v_new_jes      uuid[];
  v_pay          RECORD;
  v_void_ref     text;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found: %', p_invoice_id;
  END IF;
  IF v_invoice.status = 'void' THEN
    RAISE EXCEPTION 'already_void: الفاتورة ملغية مسبقاً';
  END IF;
  IF v_invoice.status = 'draft' THEN
    UPDATE invoices SET status = 'void', updated_at = now() WHERE id = p_invoice_id;
    PERFORM public.audit_write(
      'invoice_voided', 'invoices', p_invoice_id, v_invoice.company_id,
      jsonb_build_object('invoice_number', v_invoice.invoice_number, 'reversal_journal_count', 0)
    );
    RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'note', 'draft_cancelled');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_company_roles ucr
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = v_invoice.company_id
      AND ucr.role IN ('owner', 'admin', 'accountant')
  ) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fiscal_years
    WHERE company_id = v_invoice.company_id
      AND CURRENT_DATE BETWEEN start_date AND end_date AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'fiscal_year_closed: لا يمكن إلغاء فاتورة في سنة مالية مغلقة';
  END IF;

  PERFORM public.fn_reverse_inventory_for_reference(
    p_invoice_id,
    ARRAY['invoice', 'sales_invoice', 'purchase_invoice', 'sale_return', 'sales_return', 'purchase_return'],
    'void_invoice'
  );

  v_new_jes := public.fn_reverse_journal_entries(
    p_invoice_id,
    ARRAY['sales_invoice', 'purchase_invoice', 'sale_return', 'sales_return', 'purchase_return', 'receipt_bond', 'payment_bond'],
    'invoice_void',
    'عكس: ' || v_invoice.invoice_number || ' - ',
    auth.uid(), v_invoice.company_id
  );

  FOR v_pay IN
    SELECT DISTINCT p.id, p.payment_number, p.type
    FROM payment_allocations pa
    JOIN payments p ON p.id = pa.payment_id
    WHERE pa.invoice_id = p_invoice_id
      AND pa.deleted_at IS NULL
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
      ARRAY['receipt_bond', 'payment_bond', 'transfer_bond', 'payment'],
      v_void_ref,
      'عكس سند مرتبط بالفاتورة: ' || COALESCE(v_pay.payment_number, '') || ' - ',
      auth.uid(),
      v_invoice.company_id
    );
    UPDATE payments SET status = 'void', updated_at = now() WHERE id = v_pay.id;
  END LOOP;

  UPDATE invoices SET status = 'void', paid_amount = 0, updated_at = now() WHERE id = p_invoice_id;
  UPDATE payment_allocations SET deleted_at = now() WHERE invoice_id = p_invoice_id AND deleted_at IS NULL;

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

-- 3. Fix void_bond: also void and reverse linked ':comm' commission payment if present
CREATE OR REPLACE FUNCTION public.void_bond(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment record;
  v_comm    record;
  v_new_jes uuid[];
  v_void_ref_type text;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;

  IF v_payment IS NULL OR v_payment.status = 'void' THEN
    RAISE EXCEPTION 'Payment not found or already voided';
  END IF;

  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = v_payment.company_id
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية إلغاء هذا السند';
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

  v_new_jes := public.fn_reverse_journal_entries(
    p_payment_id,
    ARRAY['receipt_bond', 'payment_bond', 'transfer_bond', 'payment'],
    v_void_ref_type,
    'عكس سند: ' || COALESCE(v_payment.payment_number, '') || ' - ',
    auth.uid(),
    v_payment.company_id
  );

  UPDATE public.payments SET status = 'void', updated_at = now() WHERE id = p_payment_id;

  IF v_payment.payment_number IS NOT NULL THEN
    FOR v_comm IN
      SELECT * FROM public.payments
      WHERE company_id = v_payment.company_id
        AND payment_number = v_payment.payment_number || ':comm'
        AND status <> 'void'
        AND deleted_at IS NULL
    LOOP
      PERFORM public.fn_reverse_journal_entries(
        v_comm.id,
        ARRAY['receipt_bond', 'payment_bond', 'transfer_bond', 'payment'],
        'payment_bond_void',
        'عكس عمولة سند: ' || COALESCE(v_comm.payment_number, '') || ' - ',
        auth.uid(),
        v_comm.company_id
      );
      UPDATE public.payments SET status = 'void', updated_at = now() WHERE id = v_comm.id;
    END LOOP;
  END IF;

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

-- 4. Harden post_manual_journal: validate account ownership, allow_posting, and non-negative lines
CREATE OR REPLACE FUNCTION public.post_manual_journal(
  p_company_id uuid,
  p_user_id uuid,
  p_date date,
  p_description text,
  p_lines jsonb,
  p_currency_code text DEFAULT 'SAR'::text,
  p_exchange_rate numeric DEFAULT 1,
  p_reference_type text DEFAULT NULL::text,
  p_branch_id uuid DEFAULT NULL::uuid
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
  v_created_by   uuid;
  v_acc_ok       boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_company_roles ucr
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.role IN ('owner', 'admin', 'accountant')
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية ترحيل القيود المحاسبية لهذه الشركة';
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
    AS x(account_id uuid, debit numeric, credit numeric)
  LOOP
    IF COALESCE(v_line.debit, 0) < 0 OR COALESCE(v_line.credit, 0) < 0 THEN
      RAISE EXCEPTION 'لا يُسمح بمبالغ سالبة في أسطر القيد';
    END IF;
    IF COALESCE(v_line.debit, 0) > 0 AND COALESCE(v_line.credit, 0) > 0 THEN
      RAISE EXCEPTION 'لا يمكن أن يحتوي السطر الواحد على مبلغ مدين ودائن معاً';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = v_line.account_id
        AND a.company_id = p_company_id
        AND a.deleted_at IS NULL
        AND COALESCE(a.allow_posting, true) = true
    ) INTO v_acc_ok;

    IF NOT v_acc_ok THEN
      RAISE EXCEPTION 'الحساب المحدد غير صالح أو غير قابل للترحيل المباشر';
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

  v_created_by := COALESCE(auth.uid(), p_user_id);

  INSERT INTO journal_entries(
    company_id, branch_id, entry_date, description, reference_type, status, created_by
  ) VALUES (
    p_company_id, p_branch_id, p_date, p_description,
    COALESCE(p_reference_type, 'manual'), 'draft', v_created_by
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
