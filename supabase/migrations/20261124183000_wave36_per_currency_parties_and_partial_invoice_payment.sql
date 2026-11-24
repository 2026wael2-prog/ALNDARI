-- =============================================================================
-- Wave 36: Strict Per-Currency Customer Separation + Accurate Partial Invoice Payment
-- Date: 2026-11-24
-- Reversible: CREATE OR REPLACE FUNCTION only (zero destructive DDL, zero data mutation)
-- =============================================================================

-- 1. Fix get_party_currencies_by_company:
--    - Include branch_id IS NULL parties & lines (matches partiesApi & get_party_balances_by_company)
--    - Normalize NULL/blank currency_code to company base_currency ('SAR') so no SAR lines are dropped
--    - Exclude synthetic carry-forward snapshots ('ترحيل إقفال')
CREATE OR REPLACE FUNCTION public.get_party_currencies_by_company(p_company_id uuid)
RETURNS TABLE(
  party_id uuid,
  currency_code text,
  balance numeric,
  transaction_count integer,
  last_activity_date date
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_branch_id uuid;
  v_base_currency text;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  v_branch_id := public.fn_resolve_authorized_branch(p_company_id, NULL);

  SELECT UPPER(COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR'))
  INTO v_base_currency
  FROM public.companies c
  WHERE c.id = p_company_id
  LIMIT 1;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  RETURN QUERY
  WITH allowed_parties AS (
    SELECT p.id
    FROM public.parties p
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND (v_branch_id IS NULL OR p.branch_id = v_branch_id OR p.branch_id IS NULL)
  ),
  combined AS (
    SELECT
      jel.party_id,
      UPPER(COALESCE(NULLIF(TRIM(BOTH FROM jel.currency_code), ''), v_base_currency))::text AS cur_code,
      SUM(
        CASE
          WHEN UPPER(COALESCE(NULLIF(TRIM(BOTH FROM jel.currency_code), ''), v_base_currency)) <> v_base_currency
            THEN COALESCE(NULLIF(jel.foreign_amount, 0), ABS(jel.debit_amount - jel.credit_amount))
                 * CASE WHEN jel.debit_amount >= jel.credit_amount THEN 1 ELSE -1 END
          ELSE jel.debit_amount - jel.credit_amount
        END
      )::numeric(14,2) AS cur_balance,
      COUNT(*)::integer AS tx_count,
      MAX(je.entry_date) AS last_date
    FROM public.journal_entry_lines jel
    JOIN allowed_parties ap ON ap.id = jel.party_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.accounts a ON a.id = jel.account_id
    WHERE jel.company_id = p_company_id
      AND je.company_id = p_company_id
      AND a.deleted_at IS NULL
      AND (
        a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%'
        OR a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%'
      )
      AND jel.deleted_at IS NULL
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
      AND NOT (je.reference_type = 'opening' AND COALESCE(je.description, '') LIKE '%ترحيل إقفال%')
      AND (
        v_branch_id IS NULL
        OR COALESCE(jel.branch_id, je.branch_id) = v_branch_id
        OR COALESCE(jel.branch_id, je.branch_id) IS NULL
      )
    GROUP BY
      jel.party_id,
      UPPER(COALESCE(NULLIF(TRIM(BOTH FROM jel.currency_code), ''), v_base_currency))

    UNION ALL

    SELECT
      ob.party_id,
      UPPER(COALESCE(NULLIF(TRIM(BOTH FROM ob.currency_code), ''), v_base_currency))::text AS cur_code,
      SUM(CASE WHEN ob.direction = 'debit' THEN ob.amount ELSE -ob.amount END)::numeric(14,2) AS cur_balance,
      0::integer AS tx_count,
      NULL::date AS last_date
    FROM public.party_opening_balances ob
    JOIN allowed_parties ap ON ap.id = ob.party_id
    WHERE ob.company_id = p_company_id
      AND (v_branch_id IS NULL OR ob.branch_id = v_branch_id OR ob.branch_id IS NULL)
    GROUP BY
      ob.party_id,
      UPPER(COALESCE(NULLIF(TRIM(BOTH FROM ob.currency_code), ''), v_base_currency))
  )
  SELECT
    c.party_id,
    c.cur_code AS currency_code,
    ROUND(SUM(c.cur_balance), 2)::numeric AS balance,
    SUM(c.tx_count)::integer AS transaction_count,
    MAX(c.last_date) AS last_activity_date
  FROM combined c
  GROUP BY c.party_id, c.cur_code;
END;
$function$;

-- 2. Fix get_party_statement:
--    - Normalize NULL/blank currency_code to v_base_currency on BOTH SELECT and filter
--    - Exclude synthetic carry-forward snapshots ('ترحيل إقفال')
--    - Report paid_amount / remaining_amount in document currency for foreign-currency invoices
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
        0::bigint AS items_count
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
        0::bigint AS items_count
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
        COALESCE(jel.description, je.description, 'حركة محاسبية') AS description,
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
        COALESCE(inv_meta.item_count, 0)::bigint AS items_count
      FROM public.journal_entry_lines jel
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      JOIN public.accounts a ON a.id = jel.account_id
      LEFT JOIN public.invoices inv
        ON inv.id = je.reference_id
       AND je.reference_type IN ('sales_invoice', 'invoice', 'purchase_invoice', 'sale_return', 'sales_return', 'return_sale', 'purchase_return', 'return_purchase')
      LEFT JOIN public.payments pay
        ON pay.id = je.reference_id
       AND je.reference_type IN ('payment', 'payment_bond', 'receipt', 'receipt_bond', 'voucher')
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

-- 3. Harden create_financial_bond for accurate partial vs full invoice settlement
--    across BOTH SAR and foreign-currency (YER) invoices even when FX rate changed since invoice creation
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
  v_inv_total numeric;
  v_inv_doc_total numeric;
  v_inv_paid numeric;
  v_inv_doc_paid numeric;
  v_inv_doc_remaining numeric;
  v_remaining numeric;
  v_prop_base numeric;
  v_alloc_amount numeric := 0;
  v_final_inv_status text := NULL;
  v_final_inv_paid numeric := NULL;
  v_final_inv_remaining_base numeric := NULL;
  v_final_inv_remaining_doc numeric := NULL;
  v_uid uuid := auth.uid();
  v_dr_account uuid;
  v_cr_account uuid;
  v_clean_idem text := NULLIF(btrim(p_idempotency_key), '');
  v_comm_amount numeric := COALESCE(p_commission_amount, 0);
  v_comm_payment_id uuid;
BEGIN
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);
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

  SELECT UPPER(COALESCE(NULLIF(TRIM(base_currency), ''), 'SAR'))
  INTO v_base_currency
  FROM public.companies
  WHERE id = p_company_id
  LIMIT 1;
  v_base_currency := COALESCE(v_base_currency, 'SAR');
  v_currency := UPPER(TRIM(COALESCE(NULLIF(p_currency_code, ''), v_base_currency, 'SAR')));

  IF v_currency = v_base_currency THEN
    v_effective_rate := 1.0;
    v_base_amount    := ROUND(v_foreign_amount, 2);
  ELSIF v_currency = 'YER' THEN
    IF COALESCE(p_exchange_rate, 0) <= 0 OR p_exchange_rate = 1 THEN
      RAISE EXCEPTION 'invalid_currency_rate: سعر صرف الريال اليمني غير صالح (%)', p_exchange_rate USING ERRCODE = '23514';
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

  -- Lock & pre-validate target invoice BEFORE inserting payment so failures rollback cleanly
  IF p_invoice_id IS NOT NULL THEN
    SELECT
      UPPER(COALESCE(NULLIF(TRIM(currency_code), ''), v_base_currency)),
      COALESCE(total_amount, 0),
      COALESCE(total_document_amount, 0),
      COALESCE(paid_amount, 0),
      GREATEST(0, COALESCE(total_amount, 0) - COALESCE(paid_amount, 0))
    INTO v_inv_currency, v_inv_total, v_inv_doc_total, v_inv_paid, v_remaining
    FROM public.invoices
    WHERE id = p_invoice_id AND company_id = p_company_id AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'الفاتورة المحددة غير موجودة ضمن شركة السند';
    END IF;

    IF v_inv_currency <> v_currency THEN
      RAISE EXCEPTION 'تعذر تخصيص السند: عملة السند (%) تختلف عن عملة الفاتورة (%). سجّل السند بنفس عملة الفاتورة أو اتركه بدون تخصيص',
        v_currency, v_inv_currency;
    END IF;

    IF COALESCE(v_remaining, 0) <= 0.005 THEN
      RAISE EXCEPTION 'الفاتورة المحددة مسددة بالكامل - لا يمكن تخصيص سند إضافي لها';
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

  IF p_invoice_id IS NOT NULL THEN
    -- For foreign-currency invoices (e.g. YER) with total_document_amount > 0,
    -- allocate proportionally to the invoice's document currency so partial YER payments
    -- never accidentally mark the invoice fully paid when FX rates drift.
    IF v_inv_currency <> v_base_currency AND v_inv_doc_total > 0 AND v_inv_total > 0 THEN
      v_inv_doc_paid := ROUND((v_inv_paid / v_inv_total) * v_inv_doc_total, 2);
      v_inv_doc_remaining := GREATEST(0, ROUND(v_inv_doc_total - v_inv_doc_paid, 2));

      IF v_foreign_amount >= (v_inv_doc_remaining - 0.01) THEN
        v_alloc_amount := LEAST(v_base_amount, v_remaining);
      ELSE
        v_prop_base := ROUND((v_foreign_amount / v_inv_doc_total) * v_inv_total, 2);
        -- Keep partial allocation strictly below v_remaining when clearly partial in doc currency
        v_alloc_amount := LEAST(v_prop_base, v_base_amount, GREATEST(0, ROUND(v_remaining - 0.02, 2)));
        IF v_alloc_amount <= 0 AND v_prop_base > 0 THEN
          v_alloc_amount := LEAST(v_prop_base, v_base_amount, v_remaining);
        END IF;
      END IF;
    ELSE
      v_alloc_amount := LEAST(v_base_amount, v_remaining);
    END IF;

    IF v_alloc_amount > 0 THEN
      INSERT INTO public.payment_allocations(payment_id, invoice_id, amount, company_id)
      VALUES (v_payment_id, p_invoice_id, v_alloc_amount, p_company_id)
      ON CONFLICT DO NOTHING;
    END IF;

    SELECT status, COALESCE(paid_amount, 0)
    INTO v_final_inv_status, v_final_inv_paid
    FROM public.invoices
    WHERE id = p_invoice_id;

    v_final_inv_remaining_base := GREATEST(0, ROUND(v_inv_total - COALESCE(v_final_inv_paid, 0), 2));
    IF v_inv_currency <> v_base_currency AND v_inv_doc_total > 0 AND v_inv_total > 0 THEN
      v_final_inv_remaining_doc := GREATEST(
        0,
        ROUND(v_inv_doc_total - ROUND((COALESCE(v_final_inv_paid, 0) / v_inv_total) * v_inv_doc_total, 2), 2)
      );
    ELSE
      v_final_inv_remaining_doc := v_final_inv_remaining_base;
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
    'allocated_amount', v_alloc_amount,
    'invoice_status', v_final_inv_status,
    'invoice_remaining_base', v_final_inv_remaining_base,
    'invoice_remaining_doc', v_final_inv_remaining_doc,
    'status', 'success'
  );
END;
$function$;
