-- ============================================================================
-- Wave 34: Single Source of Truth for Financial Reports, Party Balances,
--          Multi-Currency FX Valuation, Reconciliation Indexes & Owner Audit RPC
-- Reversible: All functions use CREATE OR REPLACE; indexes use IF NOT EXISTS.
-- ZERO mutation of existing production journal/invoice/payment data.
-- ============================================================================

-- 1) Fix report_account_balances: exclude synthetic annual carry-forward snapshots
--    (reference_type = 'opening' AND description LIKE '%ترحيل إقفال%')
--    matching Wave 31 get_account_ledger while keeping true first-year opening entries.
CREATE OR REPLACE FUNCTION public.report_account_balances(
  p_company_id uuid,
  p_as_of_date date DEFAULT CURRENT_DATE,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  account_id uuid,
  balance numeric,
  total_debit numeric,
  total_credit numeric,
  foreign_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_base_currency text;
  v_as_of date;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  SELECT base_currency INTO v_base_currency
  FROM public.companies
  WHERE id = p_company_id;

  v_as_of := COALESCE(p_as_of_date, CURRENT_DATE);

  RETURN QUERY
  SELECT
    l.account_id,
    (SUM(l.debit_amount) - SUM(l.credit_amount))::numeric AS balance,
    SUM(l.debit_amount)::numeric AS total_debit,
    SUM(l.credit_amount)::numeric AS total_credit,
    CASE
      WHEN a.currency_code = v_base_currency OR a.currency_code IS NULL THEN
        SUM(l.debit_amount) - SUM(l.credit_amount)
      ELSE
        SUM(
          CASE
            WHEN l.foreign_amount IS NOT NULL AND l.foreign_amount <> 0 THEN
              CASE WHEN l.debit_amount >= l.credit_amount THEN ABS(l.foreign_amount) ELSE -ABS(l.foreign_amount) END
            WHEN COALESCE(l.exchange_rate, 0) > 0 THEN
              CASE
                WHEN l.debit_amount >= l.credit_amount THEN
                  public.fn_from_base_amount(COALESCE(l.currency_code, a.currency_code), l.debit_amount - l.credit_amount, l.exchange_rate)
                ELSE
                  -public.fn_from_base_amount(COALESCE(l.currency_code, a.currency_code), l.credit_amount - l.debit_amount, l.exchange_rate)
              END
            ELSE
              l.debit_amount - l.credit_amount
          END
        )
    END::numeric AS foreign_balance
  FROM public.journal_entry_lines l
  JOIN public.journal_entries j
    ON j.id = l.journal_entry_id
   AND j.company_id = p_company_id
   AND j.status = 'posted'
   AND j.deleted_at IS NULL
   AND j.entry_date <= v_as_of
   AND NOT (j.reference_type = 'opening' AND j.description LIKE '%ترحيل إقفال%')
  JOIN public.accounts a
    ON a.id = l.account_id
   AND a.company_id = p_company_id
  WHERE l.company_id = p_company_id
    AND l.deleted_at IS NULL
    AND (p_branch_id IS NULL OR COALESCE(l.branch_id, j.branch_id) = p_branch_id)
  GROUP BY l.account_id, a.currency_code
  ORDER BY l.account_id;
END;
$function$;

-- 2) Fix report_trial_balance: exclude synthetic annual carry-forward snapshots
CREATE OR REPLACE FUNCTION public.report_trial_balance(
  p_company_id uuid,
  p_from date,
  p_to date,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  account_code text,
  account_id uuid,
  account_name text,
  account_type text,
  balance numeric,
  total_debit numeric,
  total_credit numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_from date := COALESCE(p_from, make_date(EXTRACT(YEAR FROM COALESCE(p_to, CURRENT_DATE))::int, 1, 1));
  v_to date := COALESCE(p_to, CURRENT_DATE);
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  RETURN QUERY
  WITH line_totals AS (
    SELECT
      l.account_id,
      SUM(l.debit_amount) AS debit_amount,
      SUM(l.credit_amount) AS credit_amount,
      SUM(l.debit_amount) - SUM(l.credit_amount) AS balance
    FROM public.journal_entries j
    JOIN public.journal_entry_lines l
      ON l.journal_entry_id = j.id
     AND l.company_id = p_company_id
     AND l.deleted_at IS NULL
    WHERE j.company_id = p_company_id
      AND j.status = 'posted'
      AND j.deleted_at IS NULL
      AND j.entry_date BETWEEN v_from AND v_to
      AND NOT (j.reference_type = 'opening' AND j.description LIKE '%ترحيل إقفال%')
      AND (p_branch_id IS NULL OR COALESCE(l.branch_id, j.branch_id) = p_branch_id)
    GROUP BY l.account_id
  )
  SELECT
    a.code,
    a.id,
    a.name_ar,
    a.type,
    COALESCE(lt.balance, 0),
    COALESCE(lt.debit_amount, 0),
    COALESCE(lt.credit_amount, 0)
  FROM public.accounts a
  LEFT JOIN line_totals lt ON lt.account_id = a.id
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND a.deleted_at IS NULL
  ORDER BY a.code;
END;
$function$;

-- 3) Fix report_profit_loss_detailed: exclude synthetic opening carry-forwards & closing entries
CREATE OR REPLACE FUNCTION public.report_profit_loss_detailed(
  p_company_id uuid,
  p_from date,
  p_to date,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  total_debit numeric,
  total_credit numeric,
  balance numeric,
  is_cogs boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  RETURN QUERY
  SELECT
    a.id,
    a.code,
    a.name_ar,
    a.type,
    COALESCE(SUM(jel.debit_amount), 0),
    COALESCE(SUM(jel.credit_amount), 0),
    CASE
      WHEN a.type = 'revenue' THEN COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0)
      ELSE COALESCE(SUM(jel.debit_amount) - SUM(jel.credit_amount), 0)
    END,
    (a.code = '5100' OR a.code LIKE '51%' OR a.code LIKE '312%' OR a.code LIKE 'MZ-5%' OR a.code LIKE 'MZ-312%')
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.type IN ('revenue', 'expense')
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date BETWEEN p_from AND p_to
    AND COALESCE(je.reference_type, '') NOT IN ('fiscal_year_closing', 'closing', 'closing_entry', 'year_end_closing', 'opening', 'opening_balance')
    AND NOT (je.reference_type = 'opening' AND je.description LIKE '%ترحيل إقفال%')
    AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id)
  GROUP BY a.id, a.code, a.name_ar, a.type
  HAVING COALESCE(SUM(jel.debit_amount), 0) <> 0 OR COALESCE(SUM(jel.credit_amount), 0) <> 0
  ORDER BY a.code ASC;
END;
$function$;

-- 4) Fix report_profit_loss: exclude synthetic opening carry-forwards & closing entries
CREATE OR REPLACE FUNCTION public.report_profit_loss(
  p_company_id uuid,
  p_from date DEFAULT NULL::date,
  p_to date DEFAULT NULL::date,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(category text, amount numeric, type text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_from date := COALESCE(p_from, make_date(EXTRACT(YEAR FROM COALESCE(p_to, CURRENT_DATE))::int, 1, 1));
  v_to date := COALESCE(p_to, CURRENT_DATE);
  v_revenue numeric := 0;
  v_expense numeric := 0;
  v_net_profit numeric := 0;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  WITH rev_exp_accounts AS (
    SELECT id, accounts.type AS act_type
    FROM public.accounts
    WHERE accounts.company_id = p_company_id
      AND accounts.type IN ('revenue', 'expense')
      AND accounts.deleted_at IS NULL
  ),
  line_totals AS (
    SELECT
      rea.act_type,
      SUM(l.debit_amount) AS debit_amount,
      SUM(l.credit_amount) AS credit_amount
    FROM public.journal_entries e
    JOIN public.journal_entry_lines l
      ON l.journal_entry_id = e.id
     AND l.company_id = p_company_id
     AND l.deleted_at IS NULL
    JOIN rev_exp_accounts rea ON rea.id = l.account_id
    WHERE e.company_id = p_company_id
      AND e.status = 'posted'
      AND e.deleted_at IS NULL
      AND COALESCE(e.reference_type, '') NOT IN ('fiscal_year_closing', 'closing', 'closing_entry', 'year_end_closing', 'opening', 'opening_balance')
      AND e.entry_date BETWEEN v_from AND v_to
      AND (p_branch_id IS NULL OR COALESCE(l.branch_id, e.branch_id) = p_branch_id)
    GROUP BY rea.act_type
  )
  SELECT
    COALESCE(MAX(CASE WHEN lt.act_type = 'revenue' THEN lt.credit_amount - lt.debit_amount ELSE 0 END), 0),
    COALESCE(MAX(CASE WHEN lt.act_type = 'expense' THEN lt.debit_amount - lt.credit_amount ELSE 0 END), 0)
  INTO v_revenue, v_expense
  FROM line_totals lt;

  v_net_profit := v_revenue - v_expense;
  category := 'الإيرادات'; amount := v_revenue; type := 'revenue'; RETURN NEXT;
  category := 'المصروفات'; amount := v_expense; type := 'expense'; RETURN NEXT;
  category := 'صافي الربح/الخسارة'; amount := v_net_profit; type := 'net_profit'; RETURN NEXT;
END;
$function$;

-- 5) Fix report_balance_sheet_detailed & report_balance_sheet: exclude synthetic carry-forward snapshots
CREATE OR REPLACE FUNCTION public.report_balance_sheet_detailed(
  p_company_id uuid,
  p_as_of_date date DEFAULT CURRENT_DATE,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  total_debit numeric,
  total_credit numeric,
  balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_date date := COALESCE(p_as_of_date, CURRENT_DATE);
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  RETURN QUERY
  SELECT
    a.id,
    a.code,
    a.name_ar,
    a.type,
    COALESCE(rab.total_debit, 0),
    COALESCE(rab.total_credit, 0),
    CASE
      WHEN a.type = 'asset' THEN COALESCE(rab.balance, 0)
      WHEN a.type IN ('liability', 'equity') THEN -COALESCE(rab.balance, 0)
      ELSE COALESCE(rab.balance, 0)
    END
  FROM public.accounts a
  JOIN (
    SELECT
      l.account_id,
      SUM(l.debit_amount) - SUM(l.credit_amount) AS balance,
      SUM(l.debit_amount) AS total_debit,
      SUM(l.credit_amount) AS total_credit
    FROM public.journal_entry_lines l
    JOIN public.journal_entries j ON j.id = l.journal_entry_id
    WHERE j.company_id = p_company_id
      AND j.status = 'posted'
      AND j.deleted_at IS NULL
      AND l.deleted_at IS NULL
      AND j.entry_date <= v_date
      AND NOT (j.reference_type = 'opening' AND j.description LIKE '%ترحيل إقفال%')
      AND (p_branch_id IS NULL OR COALESCE(l.branch_id, j.branch_id) = p_branch_id)
    GROUP BY l.account_id
    HAVING ABS(SUM(l.debit_amount) - SUM(l.credit_amount)) > 0.001
  ) rab ON rab.account_id = a.id
  WHERE a.company_id = p_company_id
    AND a.type IN ('asset', 'liability', 'equity')
    AND a.deleted_at IS NULL
  ORDER BY a.code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_balance_sheet(
  p_company_id uuid,
  p_as_of_date date DEFAULT NULL::date,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(category text, amount numeric, type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_date date := COALESCE(p_as_of_date, CURRENT_DATE);
  v_assets numeric;
  v_liabilities numeric;
  v_equity numeric;
  v_current_earnings numeric;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  WITH clean_lines AS (
    SELECT a.type AS acc_type, jel.debit_amount, jel.credit_amount
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.accounts a ON a.id = jel.account_id
    WHERE a.company_id = p_company_id
      AND je.company_id = p_company_id
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
      AND jel.deleted_at IS NULL
      AND je.entry_date <= v_date
      AND NOT (je.reference_type = 'opening' AND je.description LIKE '%ترحيل إقفال%')
      AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id)
  )
  SELECT
    COALESCE(SUM(CASE WHEN acc_type = 'asset' THEN debit_amount - credit_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN acc_type = 'liability' THEN credit_amount - debit_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN acc_type = 'equity' THEN credit_amount - debit_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN acc_type = 'revenue' THEN credit_amount - debit_amount WHEN acc_type = 'expense' THEN -(debit_amount - credit_amount) ELSE 0 END), 0)
  INTO v_assets, v_liabilities, v_equity, v_current_earnings
  FROM clean_lines;

  category := 'الأصول'; amount := v_assets; type := 'asset'; RETURN NEXT;
  category := 'الالتزامات'; amount := v_liabilities; type := 'liability'; RETURN NEXT;
  category := 'حقوق الملكية'; amount := (v_equity + v_current_earnings); type := 'equity'; RETURN NEXT;
  category := 'صافي أرباح/خسائر الفترة'; amount := v_current_earnings; type := 'retained_earnings'; RETURN NEXT;
END;
$function$;

-- 6) Fix get_party_balances_by_company: Single Source of Truth using original per-currency
--    balances converted at central exchange_rates (eliminates phantom 2021-2025 FX drift!)
--    and includes branch_id IS NULL parties consistently with partiesApi.getParties.
CREATE OR REPLACE FUNCTION public.get_party_balances_by_company(p_company_id uuid)
RETURNS TABLE(party_id uuid, balance numeric, type text)
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

  SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
  INTO v_base_currency
  FROM public.companies c
  WHERE c.id = p_company_id;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  RETURN QUERY
  WITH latest_rates AS (
    SELECT DISTINCT ON (lr.currency_code)
      UPPER(TRIM(lr.currency_code)) AS currency_code,
      lr.rate_to_base
    FROM public.exchange_rates lr
    WHERE lr.company_id = p_company_id
      AND lr.effective_date <= CURRENT_DATE
    ORDER BY lr.currency_code, lr.effective_date DESC, lr.created_at DESC
  ),
  ar_ap_accounts AS (
    SELECT a.id
    FROM public.accounts a
    WHERE a.company_id = p_company_id
      AND a.deleted_at IS NULL
      AND (
        a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%'
        OR a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%'
      )
  ),
  journal_by_cur AS (
    SELECT
      jel.party_id,
      UPPER(COALESCE(NULLIF(TRIM(jel.currency_code), ''), v_base_currency)) AS cur,
      SUM(
        CASE
          WHEN UPPER(COALESCE(NULLIF(TRIM(jel.currency_code), ''), v_base_currency)) <> v_base_currency
               AND jel.foreign_amount IS NOT NULL AND jel.foreign_amount <> 0 THEN
            CASE WHEN jel.debit_amount >= jel.credit_amount THEN ABS(jel.foreign_amount) ELSE -ABS(jel.foreign_amount) END
          WHEN UPPER(COALESCE(NULLIF(TRIM(jel.currency_code), ''), v_base_currency)) <> v_base_currency
               AND COALESCE(jel.exchange_rate, 0) > 0 THEN
            CASE
              WHEN jel.debit_amount >= jel.credit_amount THEN
                public.fn_from_base_amount(UPPER(TRIM(jel.currency_code)), jel.debit_amount - jel.credit_amount, jel.exchange_rate)
              ELSE
                -public.fn_from_base_amount(UPPER(TRIM(jel.currency_code)), jel.credit_amount - jel.debit_amount, jel.exchange_rate)
            END
          ELSE
            jel.debit_amount - jel.credit_amount
        END
      ) AS cur_balance
    FROM public.journal_entry_lines jel
    JOIN ar_ap_accounts a ON a.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.company_id = p_company_id
      AND je.company_id = p_company_id
      AND jel.deleted_at IS NULL
      AND jel.party_id IS NOT NULL
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
      AND NOT (je.reference_type = 'opening' AND je.description LIKE '%ترحيل إقفال%')
      AND (v_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = v_branch_id OR COALESCE(jel.branch_id, je.branch_id) IS NULL)
    GROUP BY jel.party_id, UPPER(COALESCE(NULLIF(TRIM(jel.currency_code), ''), v_base_currency))
  ),
  opening_by_cur AS (
    SELECT
      ob.party_id,
      UPPER(COALESCE(NULLIF(TRIM(ob.currency_code), ''), v_base_currency)) AS cur,
      SUM(CASE WHEN ob.direction = 'debit' THEN ob.amount ELSE -ob.amount END) AS cur_balance
    FROM public.party_opening_balances ob
    WHERE ob.company_id = p_company_id
      AND (v_branch_id IS NULL OR ob.branch_id = v_branch_id OR ob.branch_id IS NULL)
    GROUP BY ob.party_id, UPPER(COALESCE(NULLIF(TRIM(ob.currency_code), ''), v_base_currency))
  ),
  merged_cur AS (
    SELECT
      COALESCE(j.party_id, o.party_id) AS pid,
      COALESCE(j.cur, o.cur) AS cur,
      COALESCE(j.cur_balance, 0) + COALESCE(o.cur_balance, 0) AS raw_balance
    FROM journal_by_cur j
    FULL OUTER JOIN opening_by_cur o ON o.party_id = j.party_id AND o.cur = j.cur
  ),
  valued_per_party AS (
    SELECT
      m.pid,
      SUM(
        CASE
          WHEN m.cur = v_base_currency THEN m.raw_balance
          ELSE
            CASE
              WHEN m.raw_balance >= 0 THEN public.fn_to_base_amount(m.cur, m.raw_balance, lr.rate_to_base, v_base_currency)
              ELSE -public.fn_to_base_amount(m.cur, ABS(m.raw_balance), lr.rate_to_base, v_base_currency)
            END
        END
      )::numeric(14,2) AS unified_balance
    FROM merged_cur m
    LEFT JOIN latest_rates lr ON lr.currency_code = m.cur
    GROUP BY m.pid
  )
  SELECT
    p.id AS party_id,
    COALESCE(v.unified_balance, 0)::numeric(14,2) AS balance,
    p.type::text
  FROM public.parties p
  LEFT JOIN valued_per_party v ON v.pid = p.id
  WHERE p.company_id = p_company_id
    AND p.deleted_at IS NULL
    AND (v_branch_id IS NULL OR p.branch_id = v_branch_id OR p.branch_id IS NULL);
END;
$function$;

-- 7) Fix get_dashboard_summary:
--    a) Use the exact same central-rate per-currency valuation for customer/supplier debts
--    b) Exclude fx_adjustment, recurring_rent_reversal, opening/closing, and MZ-121556 from expenses
--       (eliminates -6,251 SAR today's expense distortion)
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    vc uuid;
    v_target_branch uuid;
    v_base_currency text := 'SAR';
    v_total_debts NUMERIC := 0;
    v_total_supplier_debts NUMERIC := 0;
    v_total_cogs NUMERIC := 0;
    v_res jsonb;
BEGIN
    vc := public.verify_company_access(p_company_id);
    v_target_branch := public.fn_resolve_authorized_branch(vc, p_branch_id);

    SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency
    FROM public.companies c WHERE c.id = vc;
    v_base_currency := COALESCE(v_base_currency, 'SAR');

    -- Single Source of Truth for Customer Receivables & Supplier Payables (valued at central exchange_rates)
    WITH latest_rates AS (
      SELECT DISTINCT ON (lr.currency_code)
        UPPER(TRIM(lr.currency_code)) AS currency_code,
        lr.rate_to_base
      FROM public.exchange_rates lr
      WHERE lr.company_id = vc AND lr.effective_date <= CURRENT_DATE
      ORDER BY lr.currency_code, lr.effective_date DESC, lr.created_at DESC
    ),
    ar_ap_accounts AS (
      SELECT a.id FROM public.accounts a
      WHERE a.company_id = vc AND a.deleted_at IS NULL
        AND (
          a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%'
          OR a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%'
        )
    ),
    j_cur AS (
      SELECT
        jel.party_id,
        UPPER(COALESCE(NULLIF(TRIM(jel.currency_code), ''), v_base_currency)) AS cur,
        SUM(
          CASE
            WHEN UPPER(COALESCE(NULLIF(TRIM(jel.currency_code), ''), v_base_currency)) <> v_base_currency
                 AND jel.foreign_amount IS NOT NULL AND jel.foreign_amount <> 0 THEN
              CASE WHEN jel.debit_amount >= jel.credit_amount THEN ABS(jel.foreign_amount) ELSE -ABS(jel.foreign_amount) END
            WHEN UPPER(COALESCE(NULLIF(TRIM(jel.currency_code), ''), v_base_currency)) <> v_base_currency
                 AND COALESCE(jel.exchange_rate, 0) > 0 THEN
              CASE
                WHEN jel.debit_amount >= jel.credit_amount THEN
                  public.fn_from_base_amount(UPPER(TRIM(jel.currency_code)), jel.debit_amount - jel.credit_amount, jel.exchange_rate)
                ELSE
                  -public.fn_from_base_amount(UPPER(TRIM(jel.currency_code)), jel.credit_amount - jel.debit_amount, jel.exchange_rate)
              END
            ELSE jel.debit_amount - jel.credit_amount
          END
        ) AS cur_bal
      FROM public.journal_entry_lines jel
      JOIN ar_ap_accounts a ON a.id = jel.account_id
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      WHERE jel.company_id = vc AND je.company_id = vc
        AND jel.deleted_at IS NULL AND jel.party_id IS NOT NULL
        AND je.status = 'posted' AND je.deleted_at IS NULL
        AND NOT (je.reference_type = 'opening' AND je.description LIKE '%ترحيل إقفال%')
        AND (v_target_branch IS NULL OR COALESCE(jel.branch_id, je.branch_id) = v_target_branch OR COALESCE(jel.branch_id, je.branch_id) IS NULL)
      GROUP BY jel.party_id, UPPER(COALESCE(NULLIF(TRIM(jel.currency_code), ''), v_base_currency))
    ),
    o_cur AS (
      SELECT
        ob.party_id,
        UPPER(COALESCE(NULLIF(TRIM(ob.currency_code), ''), v_base_currency)) AS cur,
        SUM(CASE WHEN ob.direction = 'debit' THEN ob.amount ELSE -ob.amount END) AS cur_bal
      FROM public.party_opening_balances ob
      WHERE ob.company_id = vc
        AND (v_target_branch IS NULL OR ob.branch_id = v_target_branch OR ob.branch_id IS NULL)
      GROUP BY ob.party_id, UPPER(COALESCE(NULLIF(TRIM(ob.currency_code), ''), v_base_currency))
    ),
    merged AS (
      SELECT
        COALESCE(j.party_id, o.party_id) AS party_id,
        COALESCE(j.cur, o.cur) AS cur,
        COALESCE(j.cur_bal, 0) + COALESCE(o.cur_bal, 0) AS raw_bal
      FROM j_cur j
      FULL OUTER JOIN o_cur o ON o.party_id = j.party_id AND o.cur = j.cur
    ),
    party_totals AS (
      SELECT
        pt.id,
        pt.type,
        SUM(
          CASE
            WHEN m.cur = v_base_currency THEN m.raw_bal
            WHEN m.raw_bal >= 0 THEN public.fn_to_base_amount(m.cur, m.raw_bal, lr.rate_to_base, v_base_currency)
            ELSE -public.fn_to_base_amount(m.cur, ABS(m.raw_bal), lr.rate_to_base, v_base_currency)
          END
        ) AS bal
      FROM public.parties pt
      JOIN merged m ON m.party_id = pt.id
      LEFT JOIN latest_rates lr ON lr.currency_code = m.cur
      WHERE pt.company_id = vc
        AND pt.deleted_at IS NULL
        AND (v_target_branch IS NULL OR pt.branch_id = v_target_branch OR pt.branch_id IS NULL)
      GROUP BY pt.id, pt.type
    )
    SELECT
      COALESCE(ROUND(SUM(CASE WHEN type IN ('customer', 'both') AND bal > 0 THEN bal ELSE 0 END), 2), 0),
      COALESCE(ROUND(SUM(CASE WHEN type IN ('supplier', 'both') AND bal < 0 THEN ABS(bal) ELSE 0 END), 2), 0)
    INTO v_total_debts, v_total_supplier_debts
    FROM party_totals;

    SELECT COALESCE(ROUND(SUM(
      CASE
        WHEN i.type = 'sale' THEN
          public.fn_effective_line_cogs_base(i.currency_code, i.exchange_rate, ii.quantity, ii.total, ii.cost_price, p.cost_price, p.purchase_price)
        WHEN i.type IN ('sale_return', 'return_sale') THEN
          -public.fn_effective_line_cogs_base(i.currency_code, i.exchange_rate, ii.quantity, ii.total, ii.cost_price, p.cost_price, p.purchase_price)
        ELSE 0
      END
    ), 2), 0) INTO v_total_cogs
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    LEFT JOIN public.products p ON p.id = ii.product_id
    WHERE i.company_id = vc AND i.deleted_at IS NULL
      AND i.status IN ('posted','paid','confirmed','partially_paid')
      AND i.type IN ('sale', 'sale_return', 'return_sale')
      AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
      AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
      AND (v_target_branch IS NULL OR i.branch_id = v_target_branch);

    WITH inv_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'sale' AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from) AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          WHEN i.type IN ('sale_return', 'return_sale') AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from) AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            -1 * public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          ELSE 0 END), 2), 0) AS total_sales,
        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'purchase' AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from) AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          WHEN i.type IN ('purchase_return', 'return_purchase') AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from) AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            -1 * public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          ELSE 0 END), 2), 0) AS total_purchases,
        COUNT(*) FILTER (
          WHERE i.type = 'sale' AND i.status NOT IN ('draft', 'void')
            AND (p_date_from IS NULL OR i.issue_date >= p_date_from) AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
        ) AS invoice_count
      FROM public.invoices i
      WHERE i.company_id = vc AND i.deleted_at IS NULL
        AND (v_target_branch IS NULL OR i.branch_id = v_target_branch)
    ),
    pay_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE WHEN p.type = 'receipt' AND (p_date_from IS NULL OR p.payment_date >= p_date_from) AND (p_date_to IS NULL OR p.payment_date <= p_date_to)
          THEN public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate) ELSE 0 END), 2), 0) AS receipt_bonds,
        COALESCE(ROUND(SUM(CASE WHEN p.type IN ('disbursement', 'payment') AND (p_date_from IS NULL OR p.payment_date >= p_date_from) AND (p_date_to IS NULL OR p.payment_date <= p_date_to)
          THEN public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate) ELSE 0 END), 2), 0) AS payment_bonds
      FROM public.payments p
      WHERE p.company_id = vc AND p.status = 'posted' AND p.deleted_at IS NULL
        AND (v_target_branch IS NULL OR p.branch_id = v_target_branch)
    ),
    exp_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE
          WHEN (
            (a.code LIKE 'MZ-3%' AND a.code NOT LIKE 'MZ-312%')
            OR (a.type = 'expense' AND a.code NOT LIKE 'MZ-5%' AND a.code NOT LIKE '51%' AND a.code NOT LIKE '312%' AND a.code NOT LIKE 'MZ-312%')
          )
          AND a.code <> 'MZ-121556'
          THEN jel.debit_amount - jel.credit_amount
          ELSE 0 END), 2), 0) AS total_expenses
      FROM public.journal_entry_lines jel
      JOIN public.accounts a ON a.id = jel.account_id
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      WHERE a.company_id = vc AND a.deleted_at IS NULL AND jel.deleted_at IS NULL AND je.deleted_at IS NULL AND je.status = 'posted'
        AND COALESCE(je.reference_type, '') NOT IN ('opening', 'opening_balance', 'closing', 'closing_entry', 'year_end_closing', 'fiscal_year_closing', 'fx_adjustment', 'recurring_rent_reversal')
        AND (p_date_from IS NULL OR je.entry_date >= p_date_from) AND (p_date_to IS NULL OR je.entry_date <= p_date_to)
        AND (v_target_branch IS NULL OR COALESCE(jel.branch_id, je.branch_id) = v_target_branch)
    )
    SELECT jsonb_build_object(
      'total_sales', inv.total_sales, 'total_purchases', inv.total_purchases, 'total_expenses', exp.total_expenses,
      'total_cogs', v_total_cogs, 'gross_profit', ROUND(inv.total_sales - v_total_cogs, 2),
      'receipt_bonds', pay.receipt_bonds, 'payment_bonds', pay.payment_bonds,
      'total_debts', v_total_debts, 'total_supplier_debts', v_total_supplier_debts, 'invoice_count', inv.invoice_count
    ) INTO v_res
    FROM inv_summary inv CROSS JOIN pay_summary pay CROSS JOIN exp_summary exp;

    RETURN v_res;
END;
$function$;

-- 8) Fix get_dashboard_totals: respect p_branch_id on customer & supplier debts
CREATE OR REPLACE FUNCTION public.get_dashboard_totals(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sales          numeric;
  v_purchases      numeric;
  v_expenses       numeric;
  v_debts          numeric;
  v_supplier_debts numeric;
BEGIN
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT COALESCE(SUM(
    CASE
      WHEN i.type = 'sale' THEN i.total_amount
      WHEN i.type IN ('sale_return', 'return_sale') THEN -i.total_amount
      ELSE 0
    END
  ), 0)
  INTO v_sales
  FROM public.invoices i
  WHERE i.company_id = p_company_id
    AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    AND i.type IN ('sale', 'sale_return', 'return_sale')
    AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
    AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
    AND i.deleted_at IS NULL;

  SELECT COALESCE(SUM(
    CASE
      WHEN i.type = 'purchase' THEN i.total_amount
      WHEN i.type IN ('purchase_return', 'return_purchase') THEN -i.total_amount
      ELSE 0
    END
  ), 0)
  INTO v_purchases
  FROM public.invoices i
  WHERE i.company_id = p_company_id
    AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    AND i.type IN ('purchase', 'purchase_return', 'return_purchase')
    AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
    AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
    AND i.deleted_at IS NULL;

  SELECT COALESCE(SUM(
    public.fn_to_base_amount(e.currency_code, e.amount, e.exchange_rate)
  ), 0)
  INTO v_expenses
  FROM public.expenses e
  WHERE e.company_id = p_company_id
    AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
    AND e.status IN ('posted', 'paid')
    AND e.deleted_at IS NULL;

  SELECT
    COALESCE(SUM(CASE WHEN pb.type IN ('customer', 'both') AND pb.balance > 0 THEN pb.balance ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pb.type IN ('supplier', 'both') AND pb.balance < 0 THEN ABS(pb.balance) ELSE 0 END), 0)
  INTO v_debts, v_supplier_debts
  FROM public.get_party_balances_by_company(p_company_id) pb
  JOIN public.parties pt ON pt.id = pb.party_id AND pt.deleted_at IS NULL
  WHERE (p_branch_id IS NULL OR pt.branch_id = p_branch_id OR pt.branch_id IS NULL);

  RETURN json_build_object(
    'total_sales',          ROUND(v_sales,          2),
    'total_purchases',      ROUND(v_purchases,      2),
    'total_expenses',       ROUND(v_expenses,       2),
    'total_debts',          ROUND(v_debts,          2),
    'total_supplier_debts', ROUND(v_supplier_debts, 2)
  );
END;
$function$;

-- 9) Fix get_debt_followup_dashboard: filter branch inside ledger_debts & exclude carry-forward snapshots
CREATE OR REPLACE FUNCTION public.get_debt_followup_dashboard(
  p_company_id uuid,
  p_due_soon_days integer DEFAULT 7,
  p_critical_days integer DEFAULT 30,
  p_reminder_window_days integer DEFAULT 3,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT NULL::integer
)
RETURNS TABLE(
  party_id uuid,
  party_name text,
  party_phone text,
  category text,
  credit_limit numeric,
  currency_code text,
  outstanding_balance numeric,
  overdue_amount numeric,
  oldest_due_date date,
  next_due_date date,
  days_overdue integer,
  classification text,
  reminder_status text,
  last_reminded_at timestamp with time zone,
  last_contact_date timestamp with time zone,
  has_broken_promise boolean,
  pending_promise_count bigint,
  pending_promise_amount numeric,
  pending_promise_date date,
  invoice_count bigint,
  opening_balance numeric,
  escalation_stage text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_allowed_branches uuid[];
    v_target_branches uuid[];
    v_claims text := current_setting('request.jwt.claims', true);
    v_is_super boolean;
    v_has_all_branches boolean := false;
    v_stage_call integer;
    v_stage_visit integer;
    v_stage_legal integer;
    v_effective_limit integer;
BEGIN
    p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);
    PERFORM public.fn_assert_company_access(p_company_id);

    v_effective_limit := COALESCE(p_limit, 100);

    SELECT c.stage_call_days, c.stage_visit_days, c.stage_legal_days
      INTO v_stage_call, v_stage_visit, v_stage_legal
      FROM public.debt_followup_config c
     WHERE c.company_id = p_company_id
     LIMIT 1;

    v_stage_call  := COALESCE(v_stage_call, 30);
    v_stage_visit := COALESCE(v_stage_visit, 60);
    v_stage_legal := COALESCE(v_stage_legal, 90);

    v_is_super := public.is_super_admin()
      OR (v_claims IS NOT NULL AND btrim(v_claims) <> '' AND left(btrim(v_claims), 1) = '{' AND (v_claims::jsonb ->> 'role') = 'service_role')
      OR ((v_claims IS NULL OR btrim(v_claims) = '') AND session_user IN ('postgres', 'supabase_admin'));

    SELECT ARRAY_AGG(b) INTO v_allowed_branches FROM public.get_auth_branches(p_company_id) AS b;

    IF v_allowed_branches IS NULL OR ARRAY_LENGTH(v_allowed_branches, 1) = 0 THEN
        IF v_is_super THEN
            SELECT ARRAY_AGG(id) INTO v_allowed_branches FROM public.branches WHERE company_id = p_company_id;
        ELSE
            RETURN;
        END IF;
    END IF;

    IF p_branch_id IS NOT NULL THEN
        IF NOT (p_branch_id = ANY(v_allowed_branches)) AND NOT v_is_super THEN
            RETURN;
        END IF;
        v_target_branches := ARRAY[p_branch_id];
    ELSE
        v_target_branches := v_allowed_branches;
        SELECT (COUNT(*) = (SELECT COUNT(*) FROM public.branches WHERE company_id = p_company_id))
        INTO v_has_all_branches
        FROM unnest(v_allowed_branches);
    END IF;

    RETURN QUERY
    WITH ar_accounts AS (
        SELECT a.id
          FROM public.accounts a
         WHERE a.company_id = p_company_id
           AND a.deleted_at IS NULL
           AND (a.code LIKE '121%' OR a.code LIKE 'MZ-121%' OR a.code LIKE '1100%')
    ),
    ledger_debts AS (
        SELECT jel.party_id,
               jel.currency_code::text AS cur,
               sum(
                 CASE
                   WHEN upper(TRIM(BOTH FROM jel.currency_code)) <> 'SAR'
                     THEN COALESCE(NULLIF(jel.foreign_amount, 0), abs(jel.debit_amount - jel.credit_amount))
                          * CASE WHEN jel.debit_amount >= jel.credit_amount THEN 1 ELSE -1 END
                   ELSE jel.debit_amount - jel.credit_amount
                 END
               )::numeric AS outstanding
          FROM public.journal_entry_lines jel
          JOIN public.journal_entries je ON je.id = jel.journal_entry_id
         WHERE jel.company_id = p_company_id
           AND je.company_id = p_company_id
           AND jel.deleted_at IS NULL
           AND jel.party_id IS NOT NULL
           AND jel.currency_code IS NOT NULL
           AND je.status = 'posted'
           AND je.deleted_at IS NULL
           AND NOT (je.reference_type = 'opening' AND je.description LIKE '%ترحيل إقفال%')
           AND jel.account_id IN (SELECT id FROM ar_accounts)
           AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id OR COALESCE(jel.branch_id, je.branch_id) IS NULL)
         GROUP BY jel.party_id, jel.currency_code
    ),
    invoice_aging AS (
        SELECT i.party_id,
               SUM(CASE WHEN i.due_date < v_today
                        THEN i.total_amount - COALESCE(i.paid_amount, 0) ELSE 0 END) AS overdue_amount,
               MIN(i.due_date) FILTER (WHERE i.due_date < v_today) AS oldest_due_date,
               MIN(i.due_date) FILTER (WHERE i.due_date >= v_today) AS next_due_date,
               COUNT(*) AS invoice_count
          FROM public.invoices i
         WHERE i.company_id = p_company_id
           AND i.type = 'sale'
           AND i.status IN ('posted', 'confirmed', 'partially_paid')
           AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0
           AND i.deleted_at IS NULL
           AND i.party_id IS NOT NULL
           AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
           AND (p_branch_id IS NOT NULL OR v_is_super OR v_has_all_branches OR i.branch_id = ANY(v_target_branches))
         GROUP BY i.party_id
    ),
    opening_balances AS (
        SELECT ob.party_id,
               ob.currency_code::text AS cur,
               sum(CASE WHEN ob.direction = 'debit' THEN ob.amount ELSE -ob.amount END) AS opening_amount
          FROM public.party_opening_balances ob
         WHERE ob.company_id = p_company_id
           AND (p_branch_id IS NULL OR ob.branch_id = p_branch_id)
           AND (p_branch_id IS NOT NULL OR v_is_super OR v_has_all_branches OR ob.branch_id = ANY(v_target_branches))
         GROUP BY ob.party_id, ob.currency_code
    ),
    combined AS (
        SELECT COALESCE(ld.party_id, ob.party_id) AS party_id,
               COALESCE(ld.cur, ob.cur) AS cur,
               COALESCE(ld.outstanding, 0) + COALESCE(ob.opening_amount, 0) AS outstanding_balance,
               COALESCE(ag.overdue_amount, 0) AS overdue_amount,
               ag.oldest_due_date,
               ag.next_due_date,
               COALESCE(ag.invoice_count, 0) AS invoice_count,
               COALESCE(ob.opening_amount, 0) AS opening_balance
          FROM ledger_debts ld
          FULL OUTER JOIN opening_balances ob ON ob.party_id = ld.party_id AND ob.cur = ld.cur
          LEFT JOIN invoice_aging ag ON ag.party_id = COALESCE(ld.party_id, ob.party_id)
    ),
    ranked_candidates AS (
        SELECT c.party_id,
               p.name::TEXT AS party_name,
               p.phone::TEXT AS party_phone,
               COALESCE(pc.name, '---')::TEXT AS category,
               p.credit_limit,
               c.cur AS currency_code,
               c.outstanding_balance,
               c.overdue_amount,
               c.oldest_due_date,
               c.next_due_date,
               CASE WHEN c.oldest_due_date IS NOT NULL THEN (v_today - c.oldest_due_date) ELSE 0 END AS days_overdue,
               CASE
                   WHEN c.oldest_due_date IS NOT NULL AND (v_today - c.oldest_due_date) >= p_critical_days THEN 'critical'
                   WHEN c.oldest_due_date IS NOT NULL AND c.oldest_due_date < v_today THEN 'overdue'
                   WHEN c.next_due_date = v_today THEN 'due_today'
                   WHEN c.next_due_date IS NOT NULL AND c.next_due_date <= v_today + p_due_soon_days THEN 'due_soon'
                   ELSE 'current'
               END AS classification,
               c.invoice_count,
               c.opening_balance
          FROM combined c
          JOIN public.parties p ON p.id = c.party_id AND p.deleted_at IS NULL AND p.is_collectible
            AND (p_branch_id IS NULL OR p.branch_id = p_branch_id OR p.branch_id IS NULL)
          LEFT JOIN public.party_categories pc ON pc.id = p.category_id
         WHERE c.outstanding_balance > 0
         ORDER BY c.outstanding_balance DESC NULLS LAST
         LIMIT v_effective_limit
    )
    SELECT rc.party_id, rc.party_name, rc.party_phone, rc.category, rc.credit_limit,
           rc.currency_code, rc.outstanding_balance,
           LEAST(rc.overdue_amount, rc.outstanding_balance) AS overdue_amount,
           rc.oldest_due_date, rc.next_due_date, rc.days_overdue, rc.classification,
           CASE
               WHEN lr.last_reminded_at IS NOT NULL
                    AND lr.last_reminded_at >= NOW() - make_interval(days => p_reminder_window_days)
                    THEN 'reminded'
               ELSE 'needs_reminder'
           END AS reminder_status,
           lr.last_reminded_at, lc.last_contact_date,
           COALESCE(ps.has_broken_promise, false) AS has_broken_promise,
           COALESCE(ps.pending_promise_count, 0) AS pending_promise_count,
           COALESCE(ps.pending_promise_amount, 0) AS pending_promise_amount,
           ps.pending_promise_date,
           rc.invoice_count, rc.opening_balance,
           CASE
               WHEN rc.days_overdue >= v_stage_legal THEN 'legal'
               WHEN rc.days_overdue >= v_stage_visit THEN 'visit'
               WHEN rc.days_overdue >= v_stage_call  THEN 'call'
               WHEN rc.days_overdue >  p_critical_days THEN 'reminder'
               ELSE 'monitor'
           END AS escalation_stage
      FROM ranked_candidates rc
      LEFT JOIN LATERAL (
          SELECT BOOL_OR(pp.status = 'broken') AS has_broken_promise,
                 COUNT(*) FILTER (WHERE pp.status = 'pending') AS pending_promise_count,
                 SUM(pp.amount) FILTER (WHERE pp.status = 'pending') AS pending_promise_amount,
                 MIN(pp.promise_date) FILTER (WHERE pp.status = 'pending') AS pending_promise_date
            FROM public.debt_payment_promises pp
           WHERE pp.company_id = p_company_id AND pp.party_id = rc.party_id
      ) ps ON true
      LEFT JOIN LATERAL (
          SELECT ml.created_at AS last_reminded_at
            FROM public.debt_message_log ml
           WHERE ml.company_id = p_company_id AND ml.party_id = rc.party_id AND ml.status = 'sent'
           ORDER BY ml.created_at DESC LIMIT 1
      ) lr ON true
      LEFT JOIN LATERAL (
          SELECT ca.created_at AS last_contact_date
            FROM public.customer_activities ca
           WHERE ca.company_id = p_company_id AND ca.customer_id = rc.party_id
           ORDER BY ca.created_at DESC LIMIT 1
      ) lc ON true
     ORDER BY rc.outstanding_balance DESC NULLS LAST, rc.days_overdue DESC NULLS LAST;
END;
$function$;

-- 10) Permanent Read-Only Owner Reconciliation Report RPC
CREATE OR REPLACE FUNCTION public.get_owner_reconciliation_report(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_date date := COALESCE(p_as_of_date, CURRENT_DATE);
  v_year_start date := make_date(EXTRACT(YEAR FROM COALESCE(p_as_of_date, CURRENT_DATE))::int, 1, 1);
  v_result jsonb;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  WITH clean_gl AS (
    SELECT
      a.id AS account_id,
      a.code,
      a.type,
      je.entry_date,
      je.reference_type,
      jel.debit_amount,
      jel.credit_amount
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.accounts a ON a.id = jel.account_id
    WHERE je.company_id = p_company_id
      AND jel.company_id = p_company_id
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
      AND jel.deleted_at IS NULL
      AND je.entry_date <= v_date
      AND NOT (je.reference_type = 'opening' AND je.description LIKE '%ترحيل إقفال%')
      AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id)
  ),
  per_account AS (
    SELECT
      account_id,
      code,
      type,
      SUM(debit_amount) AS dr,
      SUM(credit_amount) AS cr,
      SUM(debit_amount - credit_amount) AS dr_minus_cr
    FROM clean_gl
    GROUP BY account_id, code, type
  ),
  tb AS (
    SELECT
      ROUND(COALESCE(SUM(dr), 0)::numeric, 2) AS total_debit,
      ROUND(COALESCE(SUM(cr), 0)::numeric, 2) AS total_credit,
      ROUND(COALESCE(SUM(dr_minus_cr), 0)::numeric, 2) AS imbalance,
      ROUND(COALESCE(SUM(CASE WHEN type = 'asset' THEN dr_minus_cr ELSE 0 END), 0)::numeric, 2) AS assets,
      ROUND(COALESCE(SUM(CASE WHEN type = 'liability' AND dr_minus_cr < 0 THEN -dr_minus_cr ELSE 0 END), 0)::numeric, 2) AS liabilities_gross_credit,
      ROUND(COALESCE(SUM(CASE WHEN type = 'liability' AND dr_minus_cr > 0 THEN dr_minus_cr ELSE 0 END), 0)::numeric, 2) AS liabilities_contra_debit,
      ROUND(COALESCE(SUM(CASE WHEN type = 'liability' THEN -dr_minus_cr ELSE 0 END), 0)::numeric, 2) AS liabilities_net,
      ROUND(COALESCE(SUM(CASE WHEN type = 'equity' THEN -dr_minus_cr ELSE 0 END), 0)::numeric, 2) AS equity_base,
      ROUND(COALESCE(SUM(CASE WHEN type = 'revenue' THEN -dr_minus_cr WHEN type = 'expense' THEN -dr_minus_cr ELSE 0 END), 0)::numeric, 2) AS cumulative_earnings
    FROM per_account
  ),
  ytd_gl AS (
    SELECT
      ROUND(COALESCE(SUM(CASE WHEN type = 'revenue' AND COALESCE(reference_type,'') NOT IN ('opening','opening_balance','closing','closing_entry','fiscal_year_closing') THEN credit_amount - debit_amount ELSE 0 END), 0)::numeric, 2) AS gl_revenue_ytd,
      ROUND(COALESCE(SUM(CASE WHEN type = 'expense' AND COALESCE(reference_type,'') NOT IN ('opening','opening_balance','closing','closing_entry','fiscal_year_closing') THEN debit_amount - credit_amount ELSE 0 END), 0)::numeric, 2) AS gl_expense_ytd
    FROM clean_gl
    WHERE entry_date >= v_year_start
  ),
  ytd_invoices AS (
    SELECT
      COUNT(*) FILTER (WHERE type = 'sale') AS sale_count_ytd,
      ROUND(COALESCE(SUM(CASE WHEN type = 'sale' THEN total_amount WHEN type IN ('sale_return','return_sale') THEN -total_amount ELSE 0 END), 0)::numeric, 2) AS net_sales_ytd,
      COUNT(*) FILTER (WHERE type = 'purchase') AS purchase_count_ytd,
      ROUND(COALESCE(SUM(CASE WHEN type = 'purchase' THEN total_amount WHEN type IN ('purchase_return','return_purchase') THEN -total_amount ELSE 0 END), 0)::numeric, 2) AS net_purchases_ytd
    FROM public.invoices
    WHERE company_id = p_company_id
      AND deleted_at IS NULL
      AND status IN ('posted', 'confirmed', 'paid', 'partially_paid')
      AND issue_date BETWEEN v_year_start AND v_date
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
  ),
  vouchers AS (
    SELECT
      COUNT(*) FILTER (WHERE type = 'receipt') AS receipt_count,
      ROUND(COALESCE(SUM(CASE WHEN type = 'receipt' THEN public.fn_to_base_amount(currency_code, amount, exchange_rate) ELSE 0 END), 0)::numeric, 2) AS receipt_total_base,
      COUNT(*) FILTER (WHERE type IN ('disbursement', 'payment')) AS disbursement_count,
      ROUND(COALESCE(SUM(CASE WHEN type IN ('disbursement', 'payment') THEN public.fn_to_base_amount(currency_code, amount, exchange_rate) ELSE 0 END), 0)::numeric, 2) AS disbursement_total_base
    FROM public.payments
    WHERE company_id = p_company_id
      AND deleted_at IS NULL
      AND status <> 'void'
      AND payment_date <= v_date
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
  ),
  party_subledger AS (
    SELECT
      COUNT(*) FILTER (WHERE pb.type IN ('customer','both') AND pb.balance > 0.005) AS customer_debtor_count,
      COUNT(*) FILTER (WHERE pb.type IN ('customer','both') AND pb.balance < -0.005) AS customer_creditor_count,
      ROUND(COALESCE(SUM(CASE WHEN pb.type IN ('customer','both') AND pb.balance > 0 THEN pb.balance ELSE 0 END), 0)::numeric, 2) AS customer_gross_receivable,
      ROUND(COALESCE(SUM(CASE WHEN pb.type IN ('customer','both') AND pb.balance < 0 THEN ABS(pb.balance) ELSE 0 END), 0)::numeric, 2) AS customer_credit_balances,
      ROUND(COALESCE(SUM(CASE WHEN pb.type IN ('customer','both') THEN pb.balance ELSE 0 END), 0)::numeric, 2) AS customer_net_receivable,
      ROUND(COALESCE(SUM(CASE WHEN pb.type IN ('supplier','both') AND pb.balance < 0 THEN ABS(pb.balance) ELSE 0 END), 0)::numeric, 2) AS supplier_gross_payable,
      ROUND(COALESCE(SUM(CASE WHEN pb.type IN ('supplier','both') AND pb.balance > 0 THEN pb.balance ELSE 0 END), 0)::numeric, 2) AS supplier_advances_debit
    FROM public.get_party_balances_by_company(p_company_id) pb
    JOIN public.parties pt ON pt.id = pb.party_id AND pt.deleted_at IS NULL
    WHERE (p_branch_id IS NULL OR pt.branch_id = p_branch_id OR pt.branch_id IS NULL)
  ),
  unbalanced AS (
    SELECT COUNT(*) AS cnt
    FROM (
      SELECT je.id
      FROM public.journal_entries je
      JOIN public.journal_entry_lines jl ON jl.journal_entry_id = je.id AND jl.deleted_at IS NULL
      WHERE je.company_id = p_company_id AND je.deleted_at IS NULL AND je.status = 'posted'
      GROUP BY je.id
      HAVING ABS(SUM(COALESCE(jl.debit_amount,0)) - SUM(COALESCE(jl.credit_amount,0))) > 0.01
    ) u
  ),
  active_yer_rate AS (
    SELECT rate_to_base, effective_date
    FROM public.exchange_rates
    WHERE company_id = p_company_id AND UPPER(currency_code) = 'YER' AND effective_date <= v_date
    ORDER BY effective_date DESC, created_at DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'as_of_date', v_date,
    'branch_id', p_branch_id,
    'active_yer_rate', (SELECT jsonb_build_object('rate_to_base', rate_to_base, 'yer_per_sar', CASE WHEN rate_to_base > 0 THEN ROUND((1.0 / rate_to_base)::numeric, 2) ELSE NULL END, 'effective_date', effective_date) FROM active_yer_rate),
    'trial_balance', (
      SELECT jsonb_build_object(
        'total_debit', total_debit,
        'total_credit', total_credit,
        'imbalance', imbalance,
        'unbalanced_journal_entries', (SELECT cnt FROM unbalanced),
        'assets', assets,
        'liabilities_gross_credit', liabilities_gross_credit,
        'liabilities_contra_debit', liabilities_contra_debit,
        'liabilities_net', liabilities_net,
        'equity_total', ROUND((equity_base + cumulative_earnings)::numeric, 2),
        'accounting_equation_diff', ROUND((assets - (liabilities_net + equity_base + cumulative_earnings))::numeric, 2)
      ) FROM tb
    ),
    'customers_vs_gl', (SELECT row_to_json(ps)::jsonb FROM party_subledger ps),
    'ytd_sales_vs_gl', (
      SELECT jsonb_build_object(
        'sale_count_ytd', i.sale_count_ytd,
        'net_sales_invoices_ytd', i.net_sales_ytd,
        'gl_revenue_ytd', g.gl_revenue_ytd,
        'revenue_variance', ROUND((g.gl_revenue_ytd - i.net_sales_ytd)::numeric, 2),
        'purchase_count_ytd', i.purchase_count_ytd,
        'net_purchases_invoices_ytd', i.net_purchases_ytd,
        'gl_expense_and_cogs_ytd', g.gl_expense_ytd
      )
      FROM ytd_invoices i CROSS JOIN ytd_gl g
    ),
    'vouchers', (SELECT row_to_json(v)::jsonb FROM vouchers v)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- 11) Performance composite indexes for daily reconciliation (get_daily_drawer_summary)
CREATE INDEX IF NOT EXISTS idx_invoices_reconcil_lookup
  ON public.invoices (company_id, branch_id, issue_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_reconcil_lookup
  ON public.payments (company_id, branch_id, payment_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_reconcil_lookup
  ON public.expenses (company_id, branch_id, expense_date)
  WHERE deleted_at IS NULL;
