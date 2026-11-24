-- =============================================================================
-- Wave 29: Unified Operational Expenses & Rents Visibility
-- - Adds get_unified_expenses RPC combining expenses, operational journal lines
--   (including shop & warehouse rents MZ-121556 / MZ-1211209), and unposted
--   disbursement vouchers, with exact original currency handling and exclusion
--   of COGS (51*, MZ-5*, 312*, MZ-312*) and opening/closing balance entries.
-- - Adds get_unified_expense_stats RPC using canonical fn_to_base_amount.
-- - Updates get_expense_categories_summary & report_operational_expenses_detailed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_unified_expenses(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  id text,
  category_id uuid,
  category_name text,
  voucher_number text,
  description text,
  amount numeric,
  currency_code text,
  exchange_rate numeric,
  expense_date text,
  status text,
  payment_method text,
  created_at timestamptz,
  branch_id uuid,
  is_journal_sourced boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $func$
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  RETURN QUERY
  WITH all_records AS (
    -- 1) سجلات جدول expenses المباشرة
    SELECT
      e.id::text AS id,
      e.category_id,
      COALESCE(ec.name, 'غير مصنف') AS category_name,
      e.voucher_number,
      e.description,
      e.amount,
      UPPER(TRIM(COALESCE(e.currency_code, 'SAR'))) AS currency_code,
      COALESCE(e.exchange_rate, 1)::numeric AS exchange_rate,
      e.expense_date::text AS expense_date,
      e.status,
      COALESCE(e.payment_method, 'cash') AS payment_method,
      e.created_at,
      e.branch_id,
      false AS is_journal_sourced
    FROM public.expenses e
    LEFT JOIN public.expense_categories ec ON ec.id = e.category_id
    WHERE e.company_id = p_company_id
      AND e.deleted_at IS NULL
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to IS NULL OR e.expense_date <= p_date_to)

    UNION ALL

    -- 2) قيود اليومية التشغيلية (الإيجارات ومصاريف المحل واليومية) مع استبعاد الأرصدة الافتتاحية والإقفال وتكلفة المبيعات
    SELECT
      'jel_' || jel.id::text AS id,
      COALESCE(ec.id, a.id) AS category_id,
      COALESCE(ec.name, a.name_ar, 'مصروف تشغيلي') AS category_name,
      COALESCE(p.payment_number, 'JV-' || je.entry_number::text, '---') AS voucher_number,
      COALESCE(NULLIF(TRIM(jel.description), ''), NULLIF(TRIM(p.notes), ''), NULLIF(TRIM(je.description), ''), a.name_ar, 'مصروف تشغيلي') AS description,
      CASE
        WHEN UPPER(TRIM(COALESCE(jel.currency_code, 'SAR'))) <> 'SAR'
             AND COALESCE(jel.foreign_amount, 0) > 0
             AND COALESCE(jel.exchange_rate, 0) > 0
        THEN ROUND(jel.foreign_amount::numeric, 2)
        ELSE ROUND((jel.debit_amount - jel.credit_amount)::numeric, 4)
      END AS amount,
      CASE
        WHEN UPPER(TRIM(COALESCE(jel.currency_code, 'SAR'))) <> 'SAR'
             AND COALESCE(jel.foreign_amount, 0) > 0
             AND COALESCE(jel.exchange_rate, 0) > 0
        THEN UPPER(TRIM(jel.currency_code))
        ELSE 'SAR'
      END AS currency_code,
      CASE
        WHEN UPPER(TRIM(COALESCE(jel.currency_code, 'SAR'))) <> 'SAR'
             AND COALESCE(jel.foreign_amount, 0) > 0
             AND COALESCE(jel.exchange_rate, 0) > 0
        THEN jel.exchange_rate::numeric
        ELSE 1::numeric
      END AS exchange_rate,
      je.entry_date::text AS expense_date,
      'posted' AS status,
      COALESCE(p.payment_method, 'cash') AS payment_method,
      jel.created_at,
      COALESCE(jel.branch_id, je.branch_id) AS branch_id,
      true AS is_journal_sourced
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON jel.journal_entry_id = je.id
    JOIN public.accounts a ON jel.account_id = a.id
    LEFT JOIN public.payments p
      ON je.reference_id = p.id
     AND COALESCE(je.reference_type, '') IN ('voucher', 'payment')
     AND p.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT ec_inner.id, ec_inner.name
      FROM public.expense_categories ec_inner
      WHERE ec_inner.account_id = a.id
        AND ec_inner.company_id = je.company_id
        AND ec_inner.deleted_at IS NULL
      ORDER BY ec_inner.is_system DESC, ec_inner.created_at ASC
      LIMIT 1
    ) ec ON true
    WHERE je.company_id = p_company_id
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
      AND jel.deleted_at IS NULL
      AND COALESCE(je.reference_type, '') NOT IN ('expense', 'opening', 'closing', 'year_end_closing', 'fx_adjustment', 'recurring_rent_reversal')
      AND NOT EXISTS (
        SELECT 1 FROM public.journal_entries rev
        WHERE rev.reference_type = 'recurring_rent_reversal'
          AND rev.reference_id = je.id
          AND rev.status = 'posted'
          AND rev.deleted_at IS NULL
      )
      AND (a.type = 'expense' OR a.code = 'MZ-1211209')
      AND a.code NOT IN ('5100', 'MZ-5101', 'MZ-5102', 'MZ-5103', 'MZ-5105', 'MZ-5106', 'MZ-5107', 'MZ-5205')
      AND a.code NOT LIKE '51%'
      AND a.code NOT LIKE 'MZ-5%'
      AND a.code NOT LIKE '312%'
      AND a.code NOT LIKE 'MZ-312%'
      AND (jel.debit_amount - jel.credit_amount) > 0
      AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id)
      AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
      AND (p_date_to IS NULL OR je.entry_date <= p_date_to)

    UNION ALL

    -- 3) سندات الصرف في payments التي لا ترتبط بقيود يومية مدرجة
    SELECT
      'pay_' || p.id::text AS id,
      COALESCE(ec.id, a.id) AS category_id,
      COALESCE(ec.name, a.name_ar, 'سند صرف') AS category_name,
      p.payment_number AS voucher_number,
      COALESCE(NULLIF(TRIM(p.notes), ''), a.name_ar, 'سند صرف') AS description,
      p.amount::numeric AS amount,
      UPPER(TRIM(COALESCE(p.currency_code, 'SAR'))) AS currency_code,
      COALESCE(p.exchange_rate, 1)::numeric AS exchange_rate,
      p.payment_date::text AS expense_date,
      'paid' AS status,
      COALESCE(p.payment_method, 'cash') AS payment_method,
      p.created_at,
      p.branch_id,
      true AS is_journal_sourced
    FROM public.payments p
    JOIN public.accounts a ON p.counterparty_account_id = a.id
    LEFT JOIN LATERAL (
      SELECT ec_inner.id, ec_inner.name
      FROM public.expense_categories ec_inner
      WHERE ec_inner.account_id = a.id
        AND ec_inner.company_id = p.company_id
        AND ec_inner.deleted_at IS NULL
      ORDER BY ec_inner.is_system DESC, ec_inner.created_at ASC
      LIMIT 1
    ) ec ON true
    WHERE p.company_id = p_company_id
      AND p.type = 'disbursement'
      AND p.deleted_at IS NULL
      AND (a.type = 'expense' OR a.code = 'MZ-1211209')
      AND a.code NOT IN ('5100', 'MZ-5101', 'MZ-5102', 'MZ-5103', 'MZ-5105', 'MZ-5106', 'MZ-5107', 'MZ-5205')
      AND a.code NOT LIKE '51%'
      AND a.code NOT LIKE 'MZ-5%'
      AND a.code NOT LIKE '312%'
      AND a.code NOT LIKE 'MZ-312%'
      AND NOT EXISTS (
        SELECT 1 FROM public.journal_entries je
        WHERE je.reference_id = p.id AND je.status = 'posted' AND je.deleted_at IS NULL
      )
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
      AND (p_date_from IS NULL OR p.payment_date >= p_date_from)
      AND (p_date_to IS NULL OR p.payment_date <= p_date_to)
  )
  SELECT * FROM all_records
  ORDER BY all_records.expense_date DESC, all_records.created_at DESC;
END;
$func$;

CREATE OR REPLACE FUNCTION public.get_unified_expense_stats(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  vc uuid;
  v_branch_id uuid;
  v_stats jsonb;
BEGIN
  vc := public.verify_company_access(p_company_id);
  v_branch_id := public.fn_resolve_authorized_branch(vc, p_branch_id);

  WITH unified AS (
    SELECT * FROM public.get_unified_expenses(vc, v_branch_id, p_date_from, p_date_to)
    WHERE status <> 'void'
  ),
  converted AS (
    SELECT
      u.*,
      ROUND(public.fn_to_base_amount(u.currency_code, u.amount, u.exchange_rate), 2) AS base_amount
    FROM unified u
  )
  SELECT jsonb_build_object(
    'totalExpenses', COALESCE(SUM(base_amount), 0),
    'paidExpenses', COALESCE(SUM(CASE WHEN status IN ('paid', 'posted') THEN base_amount ELSE 0 END), 0),
    'pendingExpenses', COALESCE(SUM(CASE WHEN status = 'draft' THEN base_amount ELSE 0 END), 0),
    'categoriesCount', COUNT(DISTINCT category_id),
    'totalExpensesYER', COALESCE(SUM(CASE WHEN currency_code = 'YER' THEN amount ELSE 0 END), 0),
    'totalExpensesSAR', COALESCE(SUM(CASE WHEN currency_code = 'SAR' THEN amount ELSE 0 END), 0)
  ) INTO v_stats
  FROM converted;

  RETURN COALESCE(v_stats, jsonb_build_object(
    'totalExpenses', 0, 'paidExpenses', 0, 'pendingExpenses', 0,
    'categoriesCount', 0, 'totalExpensesYER', 0, 'totalExpensesSAR', 0
  ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_expense_categories_summary(
  p_company_id uuid,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE(category_name text, total_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_branch_id uuid;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  v_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  RETURN QUERY
  WITH unified AS (
    SELECT * FROM public.get_unified_expenses(p_company_id, v_branch_id, p_date_from, p_date_to)
    WHERE status <> 'void'
  )
  SELECT
    u.category_name,
    ROUND(SUM(public.fn_to_base_amount(u.currency_code, u.amount, u.exchange_rate))::numeric, 2) AS total_amount
  FROM unified u
  GROUP BY u.category_name
  ORDER BY total_amount DESC
  LIMIT 15;
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_operational_expenses_detailed(
  p_company_id uuid,
  p_from date,
  p_to date,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  account_id uuid,
  account_code text,
  account_name text,
  total_debit numeric,
  total_credit numeric,
  net_expense numeric,
  line_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);
  RETURN QUERY
  SELECT a.id, a.code, a.name_ar, COALESCE(SUM(jel.debit_amount), 0), COALESCE(SUM(jel.credit_amount), 0),
    COALESCE(SUM(jel.debit_amount) - SUM(jel.credit_amount), 0) AS net_expense, COUNT(jel.id)
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND (a.type = 'expense' OR a.code = 'MZ-1211209')
    AND a.code <> '5100'
    AND a.code NOT LIKE '51%'
    AND a.code NOT LIKE 'MZ-5%'
    AND a.code NOT LIKE '312%'
    AND a.code NOT LIKE 'MZ-312%'
    AND COALESCE(je.reference_type, '') NOT IN ('opening', 'closing', 'year_end_closing')
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date BETWEEN p_from AND p_to
    AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id)
  GROUP BY a.id, a.code, a.name_ar
  HAVING COALESCE(SUM(jel.debit_amount), 0) <> 0 OR COALESCE(SUM(jel.credit_amount), 0) <> 0
  ORDER BY net_expense DESC NULLS LAST;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_unified_expenses(uuid, uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_unified_expense_stats(uuid, uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_expense_categories_summary(uuid, date, date, uuid) TO authenticated, service_role;
