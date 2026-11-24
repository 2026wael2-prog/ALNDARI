-- Wave 33: Harden post_manual_journal RPC
-- 1) Populate fiscal_year_id on manual journal entries
-- 2) Allow branch managers ('manager') alongside owner/admin/accountant and set app.rpc_authorized
-- 3) Safely cast optional party_id (handling empty strings) and validate party ownership

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
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_journal_id     uuid;
  v_fiscal_year_id uuid;
  v_line           jsonb;
  v_account_id     uuid;
  v_party_id       uuid;
  v_debit          numeric;
  v_credit         numeric;
  v_line_desc      text;
  v_base_debit     numeric;
  v_base_credit    numeric;
  v_foreign_amt    numeric;
  v_total_debit    numeric := 0;
  v_total_credit   numeric := 0;
  v_created_by     uuid;
  v_acc_ok         boolean;
  v_party_ok       boolean;
BEGIN
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  IF NOT EXISTS (
    SELECT 1 FROM user_company_roles ucr
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.role IN ('owner', 'admin', 'accountant', 'manager')
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية ترحيل القيود المحاسبية لهذه الشركة';
  END IF;

  IF p_exchange_rate IS NULL OR p_exchange_rate <= 0 THEN
    RAISE EXCEPTION 'سعر صرف غير صالح: يجب أن يكون أكبر من صفر';
  END IF;

  SELECT fy.id
  INTO v_fiscal_year_id
  FROM fiscal_years fy
  WHERE fy.company_id = p_company_id
    AND p_date BETWEEN fy.start_date AND fy.end_date
    AND fy.is_closed = false
  ORDER BY fy.start_date DESC
  LIMIT 1;

  IF v_fiscal_year_id IS NULL THEN
    RAISE EXCEPTION 'لا توجد سنة مالية مفتوحة تغطي تاريخ القيد المحدد';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'لا يمكن ترحيل قيد بدون أسطر';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_account_id := NULLIF(BTRIM(COALESCE(v_line->>'account_id', '')), '')::uuid;
    v_party_id   := NULLIF(BTRIM(COALESCE(v_line->>'party_id', '')), '')::uuid;
    v_debit      := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit     := COALESCE((v_line->>'credit')::numeric, 0);

    IF v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'لا يُسمح بمبالغ سالبة في أسطر القيد';
    END IF;
    IF v_debit > 0 AND v_credit > 0 THEN
      RAISE EXCEPTION 'لا يمكن أن يحتوي السطر الواحد على مبلغ مدين ودائن معاً';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = v_account_id
        AND a.company_id = p_company_id
        AND a.deleted_at IS NULL
        AND COALESCE(a.allow_posting, true) = true
    ) INTO v_acc_ok;

    IF NOT v_acc_ok THEN
      RAISE EXCEPTION 'الحساب المحدد غير صالح أو غير قابل للترحيل المباشر';
    END IF;

    IF v_party_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM parties p
        WHERE p.id = v_party_id
          AND p.company_id = p_company_id
          AND p.deleted_at IS NULL
      ) INTO v_party_ok;

      IF NOT v_party_ok THEN
        RAISE EXCEPTION 'العميل أو الطرف المحدد غير صالح أو غير موجود';
      END IF;
    END IF;

    v_total_debit  := v_total_debit  + public.fn_to_base_amount(p_currency_code, v_debit, p_exchange_rate);
    v_total_credit := v_total_credit + public.fn_to_base_amount(p_currency_code, v_credit, p_exchange_rate);
  END LOOP;

  IF v_total_debit <= 0 THEN
    RAISE EXCEPTION 'لا يمكن ترحيل قيد بقيمة صفرية: إجمالي المدين = %', v_total_debit;
  END IF;

  IF ABS(v_total_debit - v_total_credit) > 0.001 THEN
    RAISE EXCEPTION 'القيد غير متوازن: المدين (%) لا يساوي الدائن (%)', v_total_debit, v_total_credit;
  END IF;

  v_created_by := COALESCE(auth.uid(), p_user_id);

  PERFORM set_config('app.rpc_authorized', 'true', true);

  INSERT INTO journal_entries(
    company_id, branch_id, fiscal_year_id, entry_date, description, reference_type, status, created_by
  ) VALUES (
    p_company_id, p_branch_id, v_fiscal_year_id, p_date, p_description,
    COALESCE(p_reference_type, 'manual'), 'draft', v_created_by
  ) RETURNING id INTO v_journal_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_account_id := NULLIF(BTRIM(COALESCE(v_line->>'account_id', '')), '')::uuid;
    v_party_id   := NULLIF(BTRIM(COALESCE(v_line->>'party_id', '')), '')::uuid;
    v_debit      := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit     := COALESCE((v_line->>'credit')::numeric, 0);
    v_line_desc  := NULLIF(BTRIM(COALESCE(v_line->>'description', '')), '');

    v_base_debit  := public.fn_to_base_amount(p_currency_code, v_debit, p_exchange_rate);
    v_base_credit := public.fn_to_base_amount(p_currency_code, v_credit, p_exchange_rate);
    v_foreign_amt := GREATEST(v_debit, v_credit);

    INSERT INTO journal_entry_lines(
      journal_entry_id, account_id, party_id,
      debit_amount, credit_amount, description,
      currency_code, exchange_rate, foreign_amount, company_id, branch_id
    ) VALUES (
      v_journal_id, v_account_id, v_party_id,
      v_base_debit, v_base_credit,
      COALESCE(v_line_desc, p_description),
      p_currency_code, p_exchange_rate, v_foreign_amt,
      p_company_id, p_branch_id
    );
  END LOOP;

  UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;

  RETURN v_journal_id;
END;
$function$;
