-- ============================================================
-- Migration: Exclude opening-balance migration entries from
--            get_monthly_performance so January does not dwarf
--            Feb-Dec monthly operating revenues & expenses.
-- Date: 2026-11-25
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_monthly_performance(
  p_company_id uuid,
  p_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(month_index integer, month_name text, revenues numeric, expenses numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_start DATE := make_date(COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::integer), 1, 1);
    v_end   DATE := make_date(COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::integer), 12, 31);
BEGIN
    p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);
    PERFORM public.fn_assert_company_access(p_company_id);

    RETURN QUERY
    WITH journal_agg AS (
        SELECT
            (EXTRACT(MONTH FROM je.entry_date))::INT - 1 AS month_idx,
            a.type AS account_type,
            SUM(
                CASE a.type
                    WHEN 'revenue' THEN (jel.credit_amount - jel.debit_amount)
                    WHEN 'expense' THEN (jel.debit_amount  - jel.credit_amount)
                    ELSE 0
                END
            ) AS net_amount
        FROM public.journal_entries je
        JOIN public.journal_entry_lines jel
            ON jel.journal_entry_id = je.id
           AND jel.company_id = p_company_id
           AND jel.deleted_at IS NULL
        JOIN public.accounts a
            ON a.id = jel.account_id
           AND a.company_id = p_company_id
           AND a.type IN ('revenue', 'expense')
           AND a.deleted_at IS NULL
        WHERE je.company_id = p_company_id
          AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
          AND je.status = 'posted'
          AND je.entry_date BETWEEN v_start AND v_end
          AND je.deleted_at IS NULL
          AND COALESCE(je.reference_type, '') NOT IN ('opening', 'opening_balance', 'opening_close', 'opening_parties')
        GROUP BY (EXTRACT(MONTH FROM je.entry_date))::INT - 1, a.type
    ),
    months AS (
        SELECT
            s.i AS month_idx,
            TRIM(to_char(make_date(COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::integer), s.i + 1, 1), 'Month')) AS month_nm
        FROM generate_series(0, 11) s(i)
    )
    SELECT
        m.month_idx AS month_index,
        m.month_nm AS month_name,
        GREATEST(0, COALESCE(SUM(CASE ja.account_type WHEN 'revenue' THEN ja.net_amount ELSE 0 END), 0))::NUMERIC AS revenues,
        GREATEST(0, COALESCE(SUM(CASE ja.account_type WHEN 'expense' THEN ja.net_amount ELSE 0 END), 0))::NUMERIC AS expenses
    FROM months m
    LEFT JOIN journal_agg ja ON ja.month_idx = m.month_idx
    GROUP BY m.month_idx, m.month_nm
    ORDER BY m.month_idx;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_monthly_performance(uuid, integer, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_performance(uuid, integer, uuid) TO authenticated, service_role;
