-- ============================================================================
-- Migration: 20261121000005_wave2b_reconciliation_upgrade.sql
-- Wave 2B: Upgrade Daily Reconciliation & Quick Drawer Expense RPCs
--          FIXED for Live DB Ground Truth:
--            * invoices.total_amount is ALREADY in base currency (SAR)
--            * invoices.total_document_amount is in document currency
--            * payments.amount & expenses.amount are in document currency
-- ============================================================================

-- 1. Columns on companies & daily_reconciliations
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS reconciliation_variance_tolerance numeric(19,4);

ALTER TABLE public.daily_reconciliations
    ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'SAR',
    ADD COLUMN IF NOT EXISTS cash_count_rates jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS counted_from_denominations boolean NOT NULL DEFAULT false;

-- 2. Internal helper functions
CREATE OR REPLACE FUNCTION public.fn_safe_numeric(p_value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
BEGIN
    IF p_value IS NULL THEN RETURN NULL; END IF;
    IF TRIM(p_value) !~ '^-?[0-9]+(\.[0-9]+)?$' THEN RETURN NULL; END IF;
    RETURN TRIM(p_value)::numeric;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_reconciliation_tolerance(p_company_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_currency text := 'SAR';
    v_configured numeric;
BEGIN
    SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR'),
           c.reconciliation_variance_tolerance
      INTO v_currency, v_configured
      FROM public.companies c
     WHERE c.id = p_company_id
     LIMIT 1;

    IF v_configured IS NOT NULL AND v_configured >= 0 THEN
        RETURN ROUND(v_configured, 4);
    END IF;

    RETURN CASE UPPER(COALESCE(v_currency, 'SAR'))
        WHEN 'YER' THEN 500
        WHEN 'SAR' THEN 10
        WHEN 'AED' THEN 20
        WHEN 'QAR' THEN 20
        WHEN 'EGP' THEN 25
        WHEN 'USD' THEN 3
        WHEN 'CNY' THEN 10
        WHEN 'OMR' THEN 1
        WHEN 'KWD' THEN 1
        WHEN 'BHD' THEN 1
        ELSE 10
    END;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_reconciliation_rates(
    p_company_id uuid,
    p_date date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT COALESCE(jsonb_object_agg(t.currency_code, t.rate_to_base), '{}'::jsonb)
    FROM (
        SELECT DISTINCT ON (UPPER(TRIM(er.currency_code)))
               UPPER(TRIM(er.currency_code)) AS currency_code,
               er.rate_to_base
          FROM public.exchange_rates er
         WHERE er.company_id = p_company_id
           AND er.effective_date <= COALESCE(p_date, CURRENT_DATE)
           AND er.rate_to_base > 0
         ORDER BY UPPER(TRIM(er.currency_code)), er.effective_date DESC, er.created_at DESC
    ) t;
$$;

CREATE OR REPLACE FUNCTION public.fn_cash_counts_to_base(
    p_counts jsonb,
    p_rates jsonb,
    p_base_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_base text := UPPER(COALESCE(NULLIF(TRIM(p_base_currency), ''), 'SAR'));
    v_rows jsonb := '[]'::jsonb;
    v_missing jsonb := '[]'::jsonb;
    v_total numeric := 0;
    v_has_counts boolean := false;
    v_nested_count integer := 0;
    v_currency text;
    v_counts jsonb;
    v_currency_total numeric := 0;
    v_rate numeric;
    v_base_total numeric;
BEGIN
    IF p_counts IS NULL OR jsonb_typeof(p_counts) <> 'object' THEN
        RETURN jsonb_build_object(
            'rows', '[]'::jsonb, 'total_base', 0, 'missing_rates', '[]'::jsonb, 'has_counts', false
        );
    END IF;

    SELECT COUNT(*)::integer INTO v_nested_count
      FROM jsonb_each(p_counts) e
     WHERE jsonb_typeof(e.value) = 'object';

    IF v_nested_count > 0 THEN
        FOR v_currency, v_counts IN
            SELECT UPPER(TRIM(e.key)), e.value
              FROM jsonb_each(p_counts) e
             WHERE jsonb_typeof(e.value) = 'object'
        LOOP
            SELECT COALESCE(SUM(
                       CASE WHEN d.key ~ '^[0-9]+(\.[0-9]+)?$'
                                 AND d.value ~ '^-?[0-9]+(\.[0-9]+)?$'
                            THEN (d.key)::numeric * (d.value)::numeric
                            ELSE 0 END
                   ), 0)
              INTO v_currency_total
              FROM jsonb_each_text(v_counts) d;

            IF v_currency_total <= 0 THEN CONTINUE; END IF;

            v_has_counts := true;

            IF v_currency = v_base THEN
                v_rate := 1;
            ELSE
                v_rate := COALESCE(public.fn_safe_numeric(p_rates ->> v_currency), 0);
            END IF;

            IF v_rate > 0 THEN
                v_base_total := public.fn_to_base_amount(v_currency, v_currency_total, v_rate, v_base);
            ELSE
                v_base_total := 0;
                v_missing := v_missing || to_jsonb(v_currency);
            END IF;

            v_total := v_total + v_base_total;
            v_rows := v_rows || jsonb_build_object(
                'currency', v_currency,
                'total', ROUND(v_currency_total, 4),
                'rate', COALESCE(v_rate, 0),
                'base_total', ROUND(v_base_total, 4)
            );
        END LOOP;
    ELSE
        SELECT COALESCE(SUM(
                   CASE WHEN d.key ~ '^[0-9]+(\.[0-9]+)?$'
                             AND d.value ~ '^-?[0-9]+(\.[0-9]+)?$'
                        THEN (d.key)::numeric * (d.value)::numeric
                        ELSE 0 END
               ), 0)
          INTO v_currency_total
          FROM jsonb_each_text(p_counts) d;

        IF v_currency_total > 0 THEN
            v_has_counts := true;
            v_total := v_currency_total;
            v_rows := jsonb_build_array(jsonb_build_object(
                'currency', v_base,
                'total', ROUND(v_currency_total, 4),
                'rate', 1,
                'base_total', ROUND(v_currency_total, 4)
            ));
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'rows', v_rows,
        'total_base', ROUND(v_total, 4),
        'missing_rates', v_missing,
        'has_counts', v_has_counts
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_safe_numeric(text) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_tolerance(uuid) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_rates(uuid, date) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_cash_counts_to_base(jsonb, jsonb, text) FROM anon, PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_reconciliation_tolerance(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reconciliation_rates(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_cash_counts_to_base(jsonb, jsonb, text) TO service_role;

-- 3. get_daily_drawer_summary — uses i.total_amount directly (already SAR) & i.total_document_amount for raw totals
CREATE OR REPLACE FUNCTION public.get_daily_drawer_summary(
    p_company_id uuid,
    p_date date,
    p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid;
    v_base_currency text := 'SAR';
    v_branch_count integer := 0;
    v_last_petty_currency text;
    v_opening_float numeric(19,4) := 0;
    v_total_sales numeric(19,4) := 0;
    v_cash_sales numeric(19,4) := 0;
    v_card_sales numeric(19,4) := 0;
    v_transfer_sales numeric(19,4) := 0;
    v_credit_sales numeric(19,4) := 0;
    v_other_sales numeric(19,4) := 0;
    v_returns_cash numeric(19,4) := 0;
    v_returns_card numeric(19,4) := 0;
    v_cash_receipts numeric(19,4) := 0;
    v_cash_disbursements numeric(19,4) := 0;
    v_card_receipts numeric(19,4) := 0;
    v_petty_expenses numeric(19,4) := 0;
    v_expected_cash numeric(19,4) := 0;
    v_expected_card numeric(19,4) := 0;
    v_sales_by_currency jsonb := '[]'::jsonb;
    v_tx_by_currency jsonb := '[]'::jsonb;
    v_employee_breakdown jsonb := '[]'::jsonb;
    v_existing_reconciliation jsonb := NULL;
    v_cash_rates jsonb := '{}'::jsonb;
    v_tolerance numeric(19,4) := 10;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'عذراً، يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
    END IF;

    PERFORM public.verify_company_access(p_company_id);

    SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency
    FROM public.companies c
    WHERE c.id = p_company_id
    LIMIT 1;
    v_base_currency := COALESCE(v_base_currency, 'SAR');

    v_cash_rates := public.fn_reconciliation_rates(p_company_id, p_date);
    v_tolerance := public.fn_reconciliation_tolerance(p_company_id);

    SELECT COUNT(*)::integer INTO v_branch_count
    FROM public.branches br
    WHERE br.company_id = p_company_id;

    SELECT r.float_retained_for_tomorrow INTO v_opening_float
    FROM public.daily_reconciliations r
    WHERE r.company_id = p_company_id
      AND r.branch_id IS NOT DISTINCT FROM p_branch_id
      AND r.reconciliation_date < p_date
    ORDER BY r.reconciliation_date DESC, r.shift_number DESC
    LIMIT 1;
    v_opening_float := COALESCE(v_opening_float, 0);

    -- Invoices: total_amount is ALREADY in base currency (SAR) in live DB! Do NOT double-convert!
    SELECT
        COALESCE(SUM(CASE WHEN i.type = 'sale' THEN COALESCE(i.total_amount, 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.type = 'sale' AND i.payment_method = 'cash' THEN COALESCE(i.total_amount, 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.type = 'sale' AND i.payment_method IN ('card', 'network', 'mada') THEN COALESCE(i.total_amount, 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.type = 'sale' AND i.payment_method IN ('transfer', 'bank') THEN COALESCE(i.total_amount, 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.type = 'sale' AND i.payment_method = 'credit' THEN COALESCE(i.total_amount, 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.type = 'sale' AND COALESCE(i.payment_method, '') NOT IN ('cash', 'card', 'network', 'mada', 'transfer', 'bank', 'credit') THEN COALESCE(i.total_amount, 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.type IN ('sale_return', 'return_sale') AND i.payment_method = 'cash' THEN COALESCE(i.total_amount, 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.type IN ('sale_return', 'return_sale') AND i.payment_method IN ('card', 'network', 'mada') THEN COALESCE(i.total_amount, 0) ELSE 0 END), 0)
    INTO
        v_total_sales, v_cash_sales, v_card_sales, v_transfer_sales,
        v_credit_sales, v_other_sales, v_returns_cash, v_returns_card
    FROM public.invoices i
    WHERE i.company_id = p_company_id
      AND i.branch_id IS NOT DISTINCT FROM p_branch_id
      AND i.issue_date = p_date
      AND i.status NOT IN ('draft', 'cancelled', 'void')
      AND i.deleted_at IS NULL;

    -- Payments: stored in document currency -> convert to base via fn_to_base_amount
    SELECT
        COALESCE(SUM(CASE WHEN pay.type = 'receipt' AND pay.payment_method = 'cash' THEN public.fn_to_base_amount(pay.currency_code, pay.amount, pay.exchange_rate, v_base_currency) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pay.type IN ('payment', 'disbursement') AND pay.payment_method = 'cash' THEN public.fn_to_base_amount(pay.currency_code, pay.amount, pay.exchange_rate, v_base_currency) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pay.type = 'receipt' AND pay.payment_method IN ('card', 'network', 'mada') THEN public.fn_to_base_amount(pay.currency_code, pay.amount, pay.exchange_rate, v_base_currency) ELSE 0 END), 0)
    INTO v_cash_receipts, v_cash_disbursements, v_card_receipts
    FROM public.payments pay
    WHERE pay.company_id = p_company_id
      AND pay.branch_id IS NOT DISTINCT FROM p_branch_id
      AND pay.payment_date = p_date
      AND pay.status NOT IN ('draft', 'void', 'cancelled')
      AND pay.deleted_at IS NULL;

    -- Expenses: stored in document currency -> convert to base via fn_to_base_amount
    SELECT COALESCE(SUM(public.fn_to_base_amount(e.currency_code, e.amount, e.exchange_rate, v_base_currency)), 0)
    INTO v_petty_expenses
    FROM public.expenses e
    WHERE e.company_id = p_company_id
      AND e.branch_id IS NOT DISTINCT FROM p_branch_id
      AND e.expense_date = p_date
      AND e.payment_method = 'cash'
      AND e.status NOT IN ('draft', 'void', 'cancelled')
      AND e.deleted_at IS NULL;

    SELECT e.currency_code INTO v_last_petty_currency
    FROM public.expenses e
    WHERE e.company_id = p_company_id
      AND e.payment_method = 'cash'
      AND e.currency_code IS NOT NULL
      AND e.deleted_at IS NULL
    ORDER BY e.created_at DESC
    LIMIT 1;

    v_expected_cash := v_opening_float + v_cash_sales - v_returns_cash + v_cash_receipts - v_cash_disbursements - v_petty_expenses;
    v_expected_card := v_card_sales - v_returns_card + v_card_receipts;

    -- Sales by currency: raw_total = total_document_amount, base_total = total_amount
    SELECT COALESCE(jsonb_agg(row_to_json(sc) ORDER BY sc.base_total DESC), '[]'::jsonb)
    INTO v_sales_by_currency
    FROM (
        SELECT COALESCE(NULLIF(TRIM(i.currency_code), ''), v_base_currency) AS currency_code,
               COUNT(*)::integer AS invoice_count,
               ROUND(SUM(COALESCE(NULLIF(i.total_document_amount, 0), i.total_amount, 0)), 4) AS raw_total,
               ROUND(SUM(COALESCE(i.total_amount, 0)), 4) AS base_total
        FROM public.invoices i
        WHERE i.company_id = p_company_id
          AND i.branch_id IS NOT DISTINCT FROM p_branch_id
          AND i.issue_date = p_date
          AND i.type = 'sale'
          AND i.status NOT IN ('draft', 'cancelled', 'void')
          AND i.deleted_at IS NULL
        GROUP BY 1
    ) sc;

    SELECT COALESCE(jsonb_agg(emp_row), '[]'::jsonb)
    INTO v_employee_breakdown
    FROM (
        SELECT
            i.created_by AS user_id,
            COALESCE(NULLIF(TRIM(pr.full_name), ''), 'موظف') AS employee_name,
            COUNT(*)::integer AS invoice_count,
            ROUND(SUM(COALESCE(i.total_amount, 0)), 4) AS total_sales,
            ROUND(SUM(CASE WHEN i.payment_method = 'cash' THEN COALESCE(i.total_amount, 0) ELSE 0 END), 4) AS cash_sales,
            ROUND(SUM(CASE WHEN i.payment_method IN ('card', 'network', 'mada') THEN COALESCE(i.total_amount, 0) ELSE 0 END), 4) AS card_sales,
            ROUND(SUM(CASE WHEN i.payment_method IN ('transfer', 'bank') THEN COALESCE(i.total_amount, 0) ELSE 0 END), 4) AS transfer_sales,
            ROUND(SUM(CASE WHEN i.payment_method = 'credit' THEN COALESCE(i.total_amount, 0) ELSE 0 END), 4) AS credit_sales,
            ROUND(SUM(CASE WHEN COALESCE(i.payment_method, '') NOT IN ('cash', 'card', 'network', 'mada', 'transfer', 'bank', 'credit') THEN COALESCE(i.total_amount, 0) ELSE 0 END), 4) AS other_sales
        FROM public.invoices i
        LEFT JOIN public.profiles pr ON pr.id = i.created_by
        WHERE i.company_id = p_company_id
          AND i.branch_id IS NOT DISTINCT FROM p_branch_id
          AND i.issue_date = p_date
          AND i.type = 'sale'
          AND i.status NOT IN ('draft', 'cancelled', 'void')
          AND i.deleted_at IS NULL
        GROUP BY i.created_by, pr.full_name
        ORDER BY total_sales DESC
    ) emp_row;
    v_employee_breakdown := COALESCE(v_employee_breakdown, '[]'::jsonb);

    -- tx_by_currency: raw document amounts + exact SAR base amounts (zero double conversion!)
    SELECT COALESCE(jsonb_agg(row_to_json(tx) ORDER BY tx.is_base_currency DESC, tx.net_cash_base DESC), '[]'::jsonb)
    INTO v_tx_by_currency
    FROM (
        SELECT
            m.currency_code,
            (m.currency_code = v_base_currency) AS is_base_currency,
            ROUND(SUM(m.cash_in_doc), 4) AS cash_sales,
            ROUND(SUM(m.card_in_doc), 4) AS card_sales,
            ROUND(SUM(m.cash_ret_doc), 4) AS returns_cash,
            ROUND(SUM(m.card_ret_doc), 4) AS returns_card,
            ROUND(SUM(m.cash_rcpt_doc), 4) AS cash_receipts,
            ROUND(SUM(m.cash_disb_doc), 4) AS cash_disbursements,
            ROUND(SUM(m.petty_doc), 4) AS petty_expenses,
            ROUND(SUM(m.cash_in_doc - m.cash_ret_doc + m.cash_rcpt_doc - m.cash_disb_doc - m.petty_doc), 4) AS net_cash,
            ROUND(SUM(m.net_cash_base), 4) AS net_cash_base
        FROM (
            SELECT COALESCE(NULLIF(TRIM(i.currency_code), ''), v_base_currency) AS currency_code,
                   CASE WHEN i.type = 'sale' AND i.payment_method = 'cash' THEN COALESCE(NULLIF(i.total_document_amount, 0), i.total_amount, 0) ELSE 0 END AS cash_in_doc,
                   CASE WHEN i.type = 'sale' AND i.payment_method IN ('card', 'network', 'mada') THEN COALESCE(NULLIF(i.total_document_amount, 0), i.total_amount, 0) ELSE 0 END AS card_in_doc,
                   CASE WHEN i.type IN ('sale_return', 'return_sale') AND i.payment_method = 'cash' THEN COALESCE(NULLIF(i.total_document_amount, 0), i.total_amount, 0) ELSE 0 END AS cash_ret_doc,
                   CASE WHEN i.type IN ('sale_return', 'return_sale') AND i.payment_method IN ('card', 'network', 'mada') THEN COALESCE(NULLIF(i.total_document_amount, 0), i.total_amount, 0) ELSE 0 END AS card_ret_doc,
                   0::numeric AS cash_rcpt_doc,
                   0::numeric AS cash_disb_doc,
                   0::numeric AS petty_doc,
                   CASE
                     WHEN i.type = 'sale' AND i.payment_method = 'cash' THEN COALESCE(i.total_amount, 0)
                     WHEN i.type IN ('sale_return', 'return_sale') AND i.payment_method = 'cash' THEN -COALESCE(i.total_amount, 0)
                     ELSE 0
                   END AS net_cash_base
            FROM public.invoices i
            WHERE i.company_id = p_company_id
              AND i.branch_id IS NOT DISTINCT FROM p_branch_id
              AND i.issue_date = p_date
              AND i.type IN ('sale', 'sale_return', 'return_sale')
              AND i.status NOT IN ('draft', 'cancelled', 'void')
              AND i.deleted_at IS NULL
            UNION ALL
            SELECT COALESCE(NULLIF(TRIM(pay.currency_code), ''), v_base_currency),
                   0, 0, 0, 0,
                   CASE WHEN pay.type = 'receipt' AND pay.payment_method = 'cash' THEN pay.amount ELSE 0 END,
                   CASE WHEN pay.type IN ('payment', 'disbursement') AND pay.payment_method = 'cash' THEN pay.amount ELSE 0 END,
                   0,
                   CASE
                     WHEN pay.type = 'receipt' AND pay.payment_method = 'cash' THEN public.fn_to_base_amount(pay.currency_code, pay.amount, pay.exchange_rate, v_base_currency)
                     WHEN pay.type IN ('payment', 'disbursement') AND pay.payment_method = 'cash' THEN -public.fn_to_base_amount(pay.currency_code, pay.amount, pay.exchange_rate, v_base_currency)
                     ELSE 0
                   END
            FROM public.payments pay
            WHERE pay.company_id = p_company_id
              AND pay.branch_id IS NOT DISTINCT FROM p_branch_id
              AND pay.payment_date = p_date
              AND pay.type IN ('receipt', 'payment', 'disbursement')
              AND pay.status NOT IN ('draft', 'void', 'cancelled')
              AND pay.deleted_at IS NULL
            UNION ALL
            SELECT COALESCE(NULLIF(TRIM(e.currency_code), ''), v_base_currency),
                   0, 0, 0, 0, 0, 0,
                   CASE WHEN e.payment_method = 'cash' THEN e.amount ELSE 0 END,
                   CASE WHEN e.payment_method = 'cash' THEN -public.fn_to_base_amount(e.currency_code, e.amount, e.exchange_rate, v_base_currency) ELSE 0 END
            FROM public.expenses e
            WHERE e.company_id = p_company_id
              AND e.branch_id IS NOT DISTINCT FROM p_branch_id
              AND e.expense_date = p_date
              AND e.status NOT IN ('draft', 'void', 'cancelled')
              AND e.deleted_at IS NULL
        ) m
        GROUP BY m.currency_code
    ) tx;

    SELECT row_to_json(r)::jsonb INTO v_existing_reconciliation
    FROM public.daily_reconciliations r
    WHERE r.company_id = p_company_id
      AND r.branch_id IS NOT DISTINCT FROM p_branch_id
      AND r.reconciliation_date = p_date
    ORDER BY r.shift_number DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'date', p_date,
        'base_currency', v_base_currency,
        'currency', v_base_currency,
        'scope_branch_id', p_branch_id,
        'scope_is_company', (p_branch_id IS NULL),
        'company_branch_count', v_branch_count,
        'variance_tolerance', v_tolerance,
        'last_petty_expense_currency', COALESCE(v_last_petty_currency, v_base_currency),
        'opening_float', v_opening_float,
        'total_sales', v_total_sales,
        'cash_sales', v_cash_sales,
        'card_sales', v_card_sales,
        'transfer_sales', v_transfer_sales,
        'credit_sales', v_credit_sales,
        'other_sales', v_other_sales,
        'sales_buckets_total', ROUND(v_cash_sales + v_card_sales + v_transfer_sales + v_credit_sales + v_other_sales, 4),
        'returns_cash', v_returns_cash,
        'returns_card', v_returns_card,
        'cash_receipts', v_cash_receipts,
        'cash_disbursements', v_cash_disbursements,
        'card_receipts', v_card_receipts,
        'petty_expenses_cash', v_petty_expenses,
        'expected_cash_in_drawer', v_expected_cash,
        'expected_card_terminal', v_expected_card,
        'sales_by_currency', v_sales_by_currency,
        'tx_by_currency', v_tx_by_currency,
        'cash_rates', v_cash_rates,
        'employee_breakdown', v_employee_breakdown,
        'existing_reconciliation', v_existing_reconciliation,
        'is_already_closed', (
            v_existing_reconciliation IS NOT NULL
            AND COALESCE(v_existing_reconciliation->>'is_locked', 'false') = 'true'
        )
    );
END;
$$;

-- 4. commit_daily_reconciliation (12-arg with p_cash_rates — required for unambiguous PostgREST matching with legacy 11-arg wrapper)
CREATE OR REPLACE FUNCTION public.commit_daily_reconciliation(
    p_company_id uuid,
    p_date date,
    p_branch_id uuid,
    p_opening_float numeric,
    p_actual_cash_counted numeric,
    p_cash_denominations jsonb,
    p_card_terminal_receipt_total numeric,
    p_float_retained_for_tomorrow numeric,
    p_cash_handed_to_owner numeric,
    p_variance_reason text,
    p_notes text,
    p_cash_rates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid;
    v_user_role text;
    v_summary jsonb;
    v_opening_float numeric(19,4);
    v_expected_cash numeric(19,4);
    v_cash_variance numeric(19,4);
    v_expected_card numeric(19,4);
    v_card_variance numeric(19,4);
    v_tolerance numeric(19,4) := 10;
    v_branch_count integer := 0;
    v_reconciliation_id uuid;
    v_existing_locked boolean := false;
    v_base_currency text := 'SAR';
    v_counts jsonb;
    v_counted_server numeric(19,4) := 0;
    v_has_counts boolean := false;
    v_missing_rates text;
    v_actual_cash numeric(19,4) := 0;
    v_count_rates jsonb := '{}'::jsonb;
    v_rate_key text;
    v_rate_value numeric;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'عذراً، يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
    END IF;

    PERFORM public.verify_company_access(p_company_id);

    SELECT ucr.role INTO v_user_role
    FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_user_id AND ucr.company_id = p_company_id
    LIMIT 1;

    IF v_user_role = 'viewer' THEN
        RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية لإقفال يومية الصندوق والمطابقة' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_company_id::text || ':' || COALESCE(p_branch_id::text, 'company-scope') || ':' || p_date::text, 0)
    );

    SELECT COUNT(*)::integer INTO v_branch_count FROM public.branches br WHERE br.company_id = p_company_id;

    IF p_branch_id IS NULL AND v_branch_count > 1 THEN
        RAISE EXCEPTION 'عذراً، يجب تحديد الفرع قبل إقفال اليومية (هذه المنشأة بها % فروع). اختر الفرع ثم أعد المحاولة', v_branch_count
            USING ERRCODE = '22023';
    END IF;

    SELECT dr.id, dr.is_locked INTO v_reconciliation_id, v_existing_locked
    FROM public.daily_reconciliations dr
    WHERE dr.company_id = p_company_id
      AND dr.branch_id IS NOT DISTINCT FROM p_branch_id
      AND dr.reconciliation_date = p_date
      AND dr.shift_number = 1
    LIMIT 1;

    IF v_reconciliation_id IS NOT NULL AND v_existing_locked = true AND v_user_role <> 'owner' THEN
        RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية لتعديل إقفال يومية مقفلة بالفعل. هذا الإجراء مقتصر على المالك فقط'
            USING ERRCODE = '42501';
    END IF;

    v_summary := public.get_daily_drawer_summary(p_company_id, p_date, p_branch_id);

    v_base_currency := COALESCE(v_summary->>'base_currency', 'SAR');
    v_expected_cash := COALESCE((v_summary->>'expected_cash_in_drawer')::numeric, 0);
    v_expected_card := COALESCE((v_summary->>'expected_card_terminal')::numeric, 0);
    v_tolerance := COALESCE((v_summary->>'variance_tolerance')::numeric, 10);
    v_opening_float := COALESCE((v_summary->>'opening_float')::numeric, 0);

    v_count_rates := COALESCE(v_summary->'cash_rates', '{}'::jsonb);
    IF p_cash_rates IS NOT NULL AND jsonb_typeof(p_cash_rates) = 'object' THEN
        FOR v_rate_key, v_rate_value IN
            SELECT UPPER(TRIM(kv.key)), COALESCE(public.fn_safe_numeric(kv.value), 0)
              FROM jsonb_each_text(p_cash_rates) kv
        LOOP
            IF COALESCE(v_count_rates ->> v_rate_key, '') = '' THEN
                v_count_rates := v_count_rates || jsonb_build_object(v_rate_key, v_rate_value);
            END IF;
        END LOOP;
    END IF;
    v_count_rates := COALESCE(v_count_rates, '{}'::jsonb);

    v_counts := public.fn_cash_counts_to_base(p_cash_denominations, v_count_rates, v_base_currency);
    v_has_counts := COALESCE((v_counts->>'has_counts')::boolean, false);
    v_counted_server := COALESCE((v_counts->>'total_base')::numeric, 0);

    SELECT string_agg(value, '، ') INTO v_missing_rates
      FROM jsonb_array_elements_text(COALESCE(v_counts->'missing_rates', '[]'::jsonb));

    IF v_missing_rates IS NOT NULL THEN
        RAISE EXCEPTION 'عذراً، لا يوجد سعر صرف صالح للعملات المعدودة (%): اضبط سعر الصرف قبل اعتماد الإقفال',
            v_missing_rates USING ERRCODE = '22023';
    END IF;

    v_actual_cash := CASE WHEN v_has_counts THEN v_counted_server ELSE COALESCE(p_actual_cash_counted, 0) END;

    IF COALESCE(p_float_retained_for_tomorrow, 0) + COALESCE(p_cash_handed_to_owner, 0) > v_actual_cash + v_tolerance THEN
        RAISE EXCEPTION 'عذراً، توزيع النقد يتجاوز المبلغ المعدود: الفكة (%) + المسلَّم للمالك (%) أكبر من المعدود (%) بعملة %',
            COALESCE(p_float_retained_for_tomorrow, 0), COALESCE(p_cash_handed_to_owner, 0), v_actual_cash, v_base_currency
            USING ERRCODE = '22023';
    END IF;

    v_cash_variance := ROUND(v_actual_cash - v_expected_cash, 4);
    v_card_variance := ROUND(COALESCE(p_card_terminal_receipt_total, 0) - v_expected_card, 4);

    IF ABS(v_cash_variance) > v_tolerance AND COALESCE(NULLIF(TRIM(p_variance_reason), ''), '') = '' THEN
        RAISE EXCEPTION 'عذراً، يجب كتابة سبب (مبرر) فارق الكاش % عندما يتجاوز حد التسامح %',
            v_cash_variance, v_tolerance USING ERRCODE = '22023';
    END IF;

    IF ABS(v_card_variance) > v_tolerance AND COALESCE(NULLIF(TRIM(p_variance_reason), ''), '') = '' THEN
        RAISE EXCEPTION 'عذراً، يجب كتابة سبب (مبرر) فارق الشبكة % عندما يتجاوز حد التسامح %',
            v_card_variance, v_tolerance USING ERRCODE = '22023';
    END IF;

    IF v_reconciliation_id IS NOT NULL THEN
        UPDATE public.daily_reconciliations SET
            opening_float = v_opening_float,
            float_retained_for_tomorrow = COALESCE(p_float_retained_for_tomorrow, 0),
            cash_handed_to_owner = COALESCE(p_cash_handed_to_owner, 0),
            total_sales = COALESCE((v_summary->>'total_sales')::numeric, 0),
            cash_sales = COALESCE((v_summary->>'cash_sales')::numeric, 0),
            card_sales = COALESCE((v_summary->>'card_sales')::numeric, 0),
            transfer_sales = COALESCE((v_summary->>'transfer_sales')::numeric, 0),
            credit_sales = COALESCE((v_summary->>'credit_sales')::numeric, 0),
            returns_cash = COALESCE((v_summary->>'returns_cash')::numeric, 0),
            returns_card = COALESCE((v_summary->>'returns_card')::numeric, 0),
            cash_receipts = COALESCE((v_summary->>'cash_receipts')::numeric, 0),
            cash_disbursements = COALESCE((v_summary->>'cash_disbursements')::numeric, 0),
            petty_expenses_cash = COALESCE((v_summary->>'petty_expenses_cash')::numeric, 0),
            expected_cash_in_drawer = v_expected_cash,
            actual_cash_counted = v_actual_cash,
            cash_denominations = COALESCE(p_cash_denominations, '{}'::jsonb),
            base_currency = v_base_currency,
            cash_count_rates = v_count_rates,
            counted_from_denominations = v_has_counts,
            card_terminal_receipt_total = COALESCE(p_card_terminal_receipt_total, 0),
            cash_variance = v_cash_variance,
            card_variance = v_card_variance,
            variance_reason = p_variance_reason,
            employee_breakdown = COALESCE(v_summary->'employee_breakdown', '[]'::jsonb),
            notes = p_notes,
            closed_by = v_user_id,
            closed_at = now(),
            is_locked = true,
            updated_at = now()
        WHERE id = v_reconciliation_id;
    ELSE
        INSERT INTO public.daily_reconciliations (
            company_id, branch_id, reconciliation_date, shift_number, status,
            opening_float, float_retained_for_tomorrow, cash_handed_to_owner,
            total_sales, cash_sales, card_sales, transfer_sales, credit_sales,
            returns_cash, returns_card, cash_receipts, cash_disbursements, petty_expenses_cash,
            expected_cash_in_drawer, actual_cash_counted, cash_denominations,
            base_currency, cash_count_rates, counted_from_denominations,
            card_terminal_receipt_total, cash_variance, card_variance, variance_reason,
            employee_breakdown, notes, closed_by, closed_at, is_locked
        ) VALUES (
            p_company_id, p_branch_id, p_date, 1, 'closed',
            v_opening_float, COALESCE(p_float_retained_for_tomorrow, 0), COALESCE(p_cash_handed_to_owner, 0),
            COALESCE((v_summary->>'total_sales')::numeric, 0),
            COALESCE((v_summary->>'cash_sales')::numeric, 0),
            COALESCE((v_summary->>'card_sales')::numeric, 0),
            COALESCE((v_summary->>'transfer_sales')::numeric, 0),
            COALESCE((v_summary->>'credit_sales')::numeric, 0),
            COALESCE((v_summary->>'returns_cash')::numeric, 0),
            COALESCE((v_summary->>'returns_card')::numeric, 0),
            COALESCE((v_summary->>'cash_receipts')::numeric, 0),
            COALESCE((v_summary->>'cash_disbursements')::numeric, 0),
            COALESCE((v_summary->>'petty_expenses_cash')::numeric, 0),
            v_expected_cash, v_actual_cash, COALESCE(p_cash_denominations, '{}'::jsonb),
            v_base_currency, v_count_rates, v_has_counts,
            COALESCE(p_card_terminal_receipt_total, 0), v_cash_variance, v_card_variance, p_variance_reason,
            COALESCE(v_summary->'employee_breakdown', '[]'::jsonb), p_notes, v_user_id, now(), true
        ) RETURNING id INTO v_reconciliation_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'reconciliation_id', v_reconciliation_id,
        'base_currency', v_base_currency,
        'cash_rates', v_count_rates,
        'actual_cash_counted', v_actual_cash,
        'counted_from_denominations', v_has_counts,
        'counted_rows', COALESCE(v_counts->'rows', '[]'::jsonb),
        'opening_float', v_opening_float,
        'expected_cash_in_drawer', v_expected_cash,
        'expected_card_terminal', v_expected_card,
        'cash_variance', v_cash_variance,
        'card_variance', v_card_variance,
        'variance_tolerance', v_tolerance,
        'is_within_tolerance', (ABS(v_cash_variance) <= v_tolerance AND ABS(v_card_variance) <= v_tolerance),
        'cash_handed_to_owner', COALESCE(p_cash_handed_to_owner, 0),
        'float_retained_for_tomorrow', COALESCE(p_float_retained_for_tomorrow, 0),
        'message', 'تم إقفال يومية المحل واعتماد المطابقة بنجاح'
    );
END;
$$;

-- Legacy 11-arg wrapper delegates cleanly to 12-arg
CREATE OR REPLACE FUNCTION public.commit_daily_reconciliation(
    p_company_id uuid,
    p_date date,
    p_branch_id uuid,
    p_opening_float numeric,
    p_actual_cash_counted numeric,
    p_cash_denominations jsonb,
    p_card_terminal_receipt_total numeric,
    p_float_retained_for_tomorrow numeric,
    p_cash_handed_to_owner numeric,
    p_variance_reason text DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT public.commit_daily_reconciliation(
        p_company_id, p_date, p_branch_id, p_opening_float, p_actual_cash_counted,
        p_cash_denominations, p_card_terminal_receipt_total, p_float_retained_for_tomorrow,
        p_cash_handed_to_owner, p_variance_reason, p_notes, NULL::jsonb
    );
$$;

-- 5. record_quick_drawer_expense (8-arg delegating to commit_expense_v2 so it posts balanced JEs!)
CREATE OR REPLACE FUNCTION public.record_quick_drawer_expense(
    p_company_id uuid,
    p_amount numeric,
    p_description text,
    p_branch_id uuid,
    p_expense_date date,
    p_currency_code text,
    p_exchange_rate numeric,
    p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_user_role text;
    v_actual_date date := COALESCE(p_expense_date, CURRENT_DATE);
    v_base_currency text := 'SAR';
    v_currency text;
    v_rate numeric := p_exchange_rate;
    v_category_id uuid;
    v_existing record;
    v_result jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'عذراً، يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
    END IF;

    PERFORM public.verify_company_access(p_company_id);

    SELECT ucr.role INTO v_user_role
    FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_user_id AND ucr.company_id = p_company_id
    LIMIT 1;

    IF v_user_role = 'viewer' THEN
        RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية تسجيل مصروف نثري' USING ERRCODE = '42501';
    END IF;

    IF COALESCE(p_amount, 0) <= 0 THEN
        RAISE EXCEPTION 'مبلغ المصروف يجب أن يكون أكبر من الصفر' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(NULLIF(TRIM(p_description), ''), '') = '' THEN
        RAISE EXCEPTION 'يرجى كتابة بيان المصروف' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency FROM public.companies c WHERE c.id = p_company_id LIMIT 1;

    v_currency := UPPER(COALESCE(NULLIF(TRIM(p_currency_code), ''), v_base_currency, 'SAR'));

    IF v_currency = v_base_currency THEN
        v_rate := 1;
    ELSE
        IF v_rate IS NULL OR v_rate <= 0 THEN
            SELECT er.rate_to_base INTO v_rate
            FROM public.exchange_rates er
            WHERE er.company_id = p_company_id
              AND er.currency_code = v_currency
              AND er.effective_date <= v_actual_date
            ORDER BY er.effective_date DESC, er.created_at DESC
            LIMIT 1;
        END IF;

        IF v_rate IS NULL OR v_rate <= 0 THEN
            RAISE EXCEPTION 'عذراً، لا يوجد سعر صرف مسجل لعملة % بتاريخ %.', v_currency, v_actual_date
                USING ERRCODE = '22023';
        END IF;
    END IF;

    SELECT e.id, e.voucher_number, e.amount, e.currency_code, e.exchange_rate INTO v_existing
    FROM public.expenses e
    WHERE e.company_id = p_company_id
      AND e.branch_id IS NOT DISTINCT FROM p_branch_id
      AND e.expense_date = v_actual_date
      AND e.payment_method = 'cash'
      AND e.deleted_at IS NULL
      AND ABS(e.amount - p_amount) < 0.0001
      AND TRIM(e.description) = TRIM(p_description)
      AND e.created_at > (now() - interval '3 minutes')
    ORDER BY e.created_at DESC
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'expense_id', v_existing.id,
            'voucher_number', v_existing.voucher_number,
            'amount', v_existing.amount,
            'currency_code', v_existing.currency_code,
            'exchange_rate', v_existing.exchange_rate,
            'description', TRIM(p_description),
            'expense_date', v_actual_date,
            'message', 'تم تجاهل النقر المزدوج — المصروف مسجَّل بالفعل بنفس البيانات'
        );
    END IF;

    SELECT ec.id INTO v_category_id
    FROM public.expense_categories ec
    WHERE ec.company_id = p_company_id AND ec.deleted_at IS NULL
    ORDER BY (CASE WHEN ec.name LIKE '%نثر%' OR ec.name LIKE '%نثريات%' THEN 0 ELSE 1 END), ec.created_at ASC
    LIMIT 1;

    IF v_category_id IS NULL THEN
        INSERT INTO public.expense_categories (company_id, name, description)
        VALUES (p_company_id, 'نثريات ومصروفات الدرج', 'المصروفات النثرية اليومية السريعة من الدرج')
        RETURNING id INTO v_category_id;
    END IF;

    v_result := public.commit_expense_v2(
        p_company_id,
        v_user_id,
        jsonb_build_object(
            'category_id', v_category_id,
            'amount', p_amount,
            'currency_code', v_currency,
            'exchange_rate', v_rate,
            'expense_date', v_actual_date,
            'description', TRIM(p_description),
            'payment_method', 'cash',
            'branch_id', p_branch_id,
            'idempotency_key', p_idempotency_key
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'duplicate', false,
        'expense_id', v_result->>'id',
        'voucher_number', v_result->>'voucher_number',
        'journal_entry_id', v_result->>'journal_entry_id',
        'amount', p_amount,
        'base_amount', v_result->>'base_amount',
        'currency_code', v_currency,
        'exchange_rate', v_rate,
        'base_currency', v_base_currency,
        'description', TRIM(p_description),
        'expense_date', v_actual_date,
        'message', 'تم تسجيل مصروف الدرج وترحيل قيده المحاسبي بنجاح'
    );
END;
$$;

-- Legacy 5-arg wrapper delegates cleanly to 8-arg so legacy callers ALSO post balanced JEs!
CREATE OR REPLACE FUNCTION public.record_quick_drawer_expense(
    p_company_id uuid,
    p_amount numeric,
    p_description text,
    p_branch_id uuid DEFAULT NULL::uuid,
    p_expense_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT public.record_quick_drawer_expense(
        p_company_id, p_amount, p_description, p_branch_id, p_expense_date,
        NULL::text, NULL::numeric, NULL::text
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_drawer_summary(uuid, date, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_daily_drawer_summary(uuid, date, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.commit_daily_reconciliation(uuid, date, uuid, numeric, numeric, jsonb, numeric, numeric, numeric, text, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.commit_daily_reconciliation(uuid, date, uuid, numeric, numeric, jsonb, numeric, numeric, numeric, text, text, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.commit_daily_reconciliation(uuid, date, uuid, numeric, numeric, jsonb, numeric, numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.commit_daily_reconciliation(uuid, date, uuid, numeric, numeric, jsonb, numeric, numeric, numeric, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.record_quick_drawer_expense(uuid, numeric, text, uuid, date, text, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_quick_drawer_expense(uuid, numeric, text, uuid, date, text, numeric, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.record_quick_drawer_expense(uuid, numeric, text, uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_quick_drawer_expense(uuid, numeric, text, uuid, date) TO authenticated, service_role;
