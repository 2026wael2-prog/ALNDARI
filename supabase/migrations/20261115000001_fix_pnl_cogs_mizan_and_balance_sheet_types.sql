-- =====================================================================
-- Migration: 20261115000001_fix_pnl_cogs_mizan_and_balance_sheet_types.sql
-- Purpose:
--   1. Classify Mizan COGS / Purchases accounts (MZ-5%, 312%, MZ-312%,
--      and Arabic COGS/purchases names) as `is_cogs = true` in
--      report_profit_loss_detailed and exclude them from monthly operating
--      expenses in get_monthly_performance.
--   2. Use `a.type IN ('asset', 'liability', 'equity')` instead of numeric
--      code prefixes (`1%`, `2%`, `3%`) in report_balance_sheet and
--      report_balance_sheet_detailed so Mizan accounts (`MZ-1%`, `MZ-2%`,
--      `MZ-3%`) are included accurately and `3xx` expense accounts cannot
--      leak into equity.
-- =====================================================================

BEGIN;

-- 1) Update report_profit_loss_detailed with full COGS classification
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
 SET search_path TO 'public'
AS $function$
-- SIGN CONVENTION:
--   revenue: balance = credit - debit (positive = normal income)
--   expense: balance = debit - credit (positive = normal cost)
--   negative = reversal -- subtract it, do NOT add it
--   DO NOT apply ABS() to balance in application code
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  RETURN QUERY
  SELECT
      a.id,
      a.code,
      a.name_ar,
      a.type,
      COALESCE(SUM(jel.debit_amount), 0)  AS total_debit,
      COALESCE(SUM(jel.credit_amount), 0) AS total_credit,
      CASE
        WHEN a.type = 'revenue'
          THEN COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0)
        ELSE COALESCE(SUM(jel.debit_amount) - SUM(jel.credit_amount), 0)
      END AS balance,
      (
        a.type = 'expense' AND (
          a.code = '5100'
          OR a.code LIKE '51%'
          OR UPPER(a.code) LIKE 'MZ-5%'
          OR a.code LIKE '312%'
          OR UPPER(a.code) LIKE 'MZ-312%'
          OR COALESCE(a.name_ar, '') LIKE '%تكلفة المبيعات%'
          OR COALESCE(a.name_ar, '') LIKE '%تكلفة البضاعة%'
          OR COALESCE(a.name_ar, '') LIKE '%بضاعة مباعة%'
          OR (
            COALESCE(a.name_ar, '') LIKE '%مشتريات%'
            AND COALESCE(a.name_ar, '') NOT LIKE '%أصول%'
            AND COALESCE(a.name_ar, '') NOT LIKE '%قرطاسية%'
            AND COALESCE(a.name_ar, '') NOT LIKE '%مهمات%'
          )
        )
      ) AS is_cogs
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.deleted_at IS NULL
    AND a.type IN ('revenue', 'expense')
    AND je.company_id = p_company_id
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date BETWEEN p_from AND p_to
    AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id)
  GROUP BY a.id, a.code, a.name_ar, a.type
  HAVING COALESCE(SUM(jel.debit_amount), 0) <> 0
      OR COALESCE(SUM(jel.credit_amount), 0) <> 0
  ORDER BY a.code ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.report_profit_loss_detailed(uuid, date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_profit_loss_detailed(uuid, date, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_profit_loss_detailed(uuid, date, date, uuid) TO authenticated, service_role;

-- 2) Update report_balance_sheet to group by account type and compute net profit inline
CREATE OR REPLACE FUNCTION public.report_balance_sheet(
  p_company_id uuid,
  p_as_of_date date DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE(category text, amount numeric, type text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_date date := COALESCE(p_as_of_date, CURRENT_DATE);
  v_assets numeric := 0;
  v_liabilities numeric := 0;
  v_equity_base numeric := 0;
  v_net_profit numeric := 0;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  -- الأصول: مدين - دائن
  SELECT COALESCE(SUM(jel.debit_amount) - SUM(jel.credit_amount), 0)
    INTO v_assets
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.deleted_at IS NULL
    AND a.type = 'asset'
    AND je.company_id = p_company_id
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date <= v_date
    AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id);

  -- الالتزامات: دائن - مدين
  SELECT COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0)
    INTO v_liabilities
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.deleted_at IS NULL
    AND a.type = 'liability'
    AND je.company_id = p_company_id
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date <= v_date
    AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id);

  -- حقوق الملكية المُرحّلة: دائن - مدين
  SELECT COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0)
    INTO v_equity_base
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.deleted_at IS NULL
    AND a.type = 'equity'
    AND je.company_id = p_company_id
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date <= v_date
    AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id);

  -- صافي ربح/خسارة الفترة غير المُقفلة: الإيرادات (دائن - مدين) مطروحاً منها المصروفات (مدين - دائن)
  SELECT
    COALESCE(
      SUM(CASE WHEN a.type = 'revenue' THEN jel.credit_amount - jel.debit_amount ELSE 0 END)
      - SUM(CASE WHEN a.type = 'expense' THEN jel.debit_amount - jel.credit_amount ELSE 0 END),
      0
    )
    INTO v_net_profit
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.deleted_at IS NULL
    AND a.type IN ('revenue', 'expense')
    AND je.company_id = p_company_id
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date <= v_date
    AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id);

  category := 'الأصول';
  amount := v_assets;
  type := 'asset';
  RETURN NEXT;

  category := 'الالتزامات';
  amount := v_liabilities;
  type := 'liability';
  RETURN NEXT;

  category := 'حقوق الملكية';
  amount := v_equity_base + v_net_profit;
  type := 'equity';
  RETURN NEXT;

  category := 'صافي ربح/خسارة الفترة غير المُقفلة';
  amount := v_net_profit;
  type := 'retained_earnings';
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.report_balance_sheet(uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_balance_sheet(uuid, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_balance_sheet(uuid, date, uuid) TO authenticated, service_role;

-- 3) Update report_balance_sheet_detailed to filter by account type and emit synthetic 3999 row
DROP FUNCTION IF EXISTS public.report_balance_sheet_detailed(uuid, date, uuid);

CREATE OR REPLACE FUNCTION public.report_balance_sheet_detailed(
  p_company_id uuid,
  p_as_of_date date DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
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
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_date date := COALESCE(p_as_of_date, CURRENT_DATE);
  v_net_profit numeric := 0;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  RETURN QUERY
  WITH line_totals AS (
    SELECT
      l.account_id,
      SUM(l.debit_amount)  AS d1,
      SUM(l.credit_amount) AS c1
    FROM public.journal_entries j
    JOIN public.journal_entry_lines l
      ON l.journal_entry_id = j.id
     AND l.company_id = p_company_id
     AND l.deleted_at IS NULL
    WHERE j.company_id = p_company_id
      AND j.status = 'posted'
      AND j.deleted_at IS NULL
      AND j.entry_date <= v_date
      AND (p_branch_id IS NULL OR COALESCE(l.branch_id, j.branch_id) = p_branch_id)
    GROUP BY l.account_id
  )
  SELECT
    a.id,
    a.code,
    a.name_ar,
    a.type,
    COALESCE(lt.d1, 0),
    COALESCE(lt.c1, 0),
    CASE
      WHEN a.type IN ('liability', 'equity') THEN COALESCE(lt.c1, 0) - COALESCE(lt.d1, 0)
      ELSE COALESCE(lt.d1, 0) - COALESCE(lt.c1, 0)
    END
  FROM public.accounts a
  LEFT JOIN line_totals lt ON lt.account_id = a.id
  WHERE a.company_id = p_company_id
    AND a.deleted_at IS NULL
    AND a.type IN ('asset', 'liability', 'equity')
    AND (COALESCE(lt.d1, 0) <> 0 OR COALESCE(lt.c1, 0) <> 0)
  ORDER BY a.code;

  -- سطر صافي ربح/خسارة الفترة غير المُقفلة (كود 3999 وهمي غير موجود في الدليل)
  SELECT
    COALESCE(
      SUM(CASE WHEN a.type = 'revenue' THEN l.credit_amount - l.debit_amount ELSE 0 END)
      - SUM(CASE WHEN a.type = 'expense' THEN l.debit_amount - l.credit_amount ELSE 0 END),
      0
    )
    INTO v_net_profit
  FROM public.journal_entry_lines l
  JOIN public.journal_entries j ON j.id = l.journal_entry_id
  JOIN public.accounts a ON a.id = l.account_id
  WHERE a.company_id = p_company_id
    AND a.deleted_at IS NULL
    AND a.type IN ('revenue', 'expense')
    AND j.company_id = p_company_id
    AND j.status = 'posted'
    AND j.deleted_at IS NULL
    AND l.deleted_at IS NULL
    AND j.entry_date <= v_date
    AND (p_branch_id IS NULL OR COALESCE(l.branch_id, j.branch_id) = p_branch_id);

  IF v_net_profit <> 0 THEN
    account_id   := NULL;
    account_code := '3999';
    account_name := 'صافي ربح/خسارة الفترة غير المُقفلة';
    account_type := 'equity';
    total_debit  := CASE WHEN v_net_profit < 0 THEN -v_net_profit ELSE 0 END;
    total_credit := CASE WHEN v_net_profit > 0 THEN v_net_profit ELSE 0 END;
    balance      := v_net_profit;
    RETURN NEXT;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.report_balance_sheet_detailed(uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_balance_sheet_detailed(uuid, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_balance_sheet_detailed(uuid, date, uuid) TO authenticated, service_role;

-- 4) Update get_monthly_performance to also exclude Mizan/312% COGS codes
CREATE OR REPLACE FUNCTION public.get_monthly_performance(
  p_company_id uuid,
  p_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer,
  p_branch_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(month_index integer, month_name text, revenues numeric, expenses numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year  INT := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::integer);
  v_start DATE := make_date(v_year, 1, 1);
  v_end   DATE := make_date(v_year, 12, 31);
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  RETURN QUERY
  WITH month_series AS (
    SELECT
      m AS month_idx,
      to_char(make_date(v_year, m + 1, 1), 'TMMonth') AS month_nm
    FROM generate_series(0, 11) AS m
  ),
  journal_agg AS (
    SELECT
      EXTRACT(MONTH FROM je.entry_date)::INT - 1 AS month_idx,
      a.type                                      AS account_type,
      SUM(
        CASE a.type
          WHEN 'revenue' THEN (jel.credit_amount - jel.debit_amount)
          WHEN 'expense' THEN (jel.debit_amount - jel.credit_amount)
          ELSE 0
        END
      ) AS net_amount
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.accounts a ON a.id = jel.account_id
    WHERE je.company_id = p_company_id
      AND je.entry_date BETWEEN v_start AND v_end
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
      AND jel.deleted_at IS NULL
      AND a.deleted_at IS NULL
      AND a.type IN ('revenue', 'expense')
      AND a.code <> '5100'
      AND a.code NOT LIKE '51%'
      AND UPPER(a.code) NOT LIKE 'MZ-5%'
      AND a.code NOT LIKE '312%'
      AND UPPER(a.code) NOT LIKE 'MZ-312%'
      AND COALESCE(a.name_ar, '') NOT LIKE '%تكلفة المبيعات%'
      AND COALESCE(a.name_ar, '') NOT LIKE '%تكلفة البضاعة%'
      AND COALESCE(a.name_ar, '') NOT LIKE '%بضاعة مباعة%'
      AND NOT (
        COALESCE(a.name_ar, '') LIKE '%مشتريات%'
        AND COALESCE(a.name_ar, '') NOT LIKE '%أصول%'
        AND COALESCE(a.name_ar, '') NOT LIKE '%قرطاسية%'
        AND COALESCE(a.name_ar, '') NOT LIKE '%مهمات%'
      )
      AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id)
    GROUP BY EXTRACT(MONTH FROM je.entry_date), a.type
  )
  SELECT
    ms.month_idx,
    TRIM(ms.month_nm),
    COALESCE(SUM(CASE ja.account_type WHEN 'revenue' THEN ja.net_amount ELSE 0 END), 0)::NUMERIC AS revenues,
    COALESCE(SUM(CASE ja.account_type WHEN 'expense' THEN ja.net_amount ELSE 0 END), 0)::NUMERIC AS expenses
  FROM month_series ms
  LEFT JOIN journal_agg ja ON ja.month_idx = ms.month_idx
  GROUP BY ms.month_idx, ms.month_nm
  ORDER BY ms.month_idx;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_monthly_performance(uuid, integer, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_performance(uuid, integer, uuid) TO authenticated, service_role;

COMMIT;
