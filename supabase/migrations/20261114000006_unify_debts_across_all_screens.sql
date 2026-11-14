-- ============================================================
-- Migration: Unify AR & AP account filters across Dashboard, Debt Followup, and Analytics
-- Date: 2026-11-14
-- Issues fixed:
--   1. get_dashboard_summary: excluded MZ-121% and MZ-231% because code LIKE '121%'
--      does not match 'MZ-121%'. This missed 58,018 customer lines (10.66M SAR)
--      and 8,101 supplier lines (2.21M SAR) imported from Mizan!
--   2. get_debt_followup_dashboard: used left(a.code, 3) = '121' which missed MZ-121%
--   3. get_debt_analytics_summary: added fallback for admin/postgres users so it
--      doesn't return empty object when auth.uid() is null
-- ============================================================

-- 1. get_dashboard_summary update
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
    p_company_id uuid,
    p_branch_id uuid DEFAULT NULL::uuid,
    p_date_from date DEFAULT NULL::date,
    p_date_to date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    vc uuid;
    v_auth_branches uuid[];
    v_target_branch uuid;
    v_total_debts NUMERIC := 0;
    v_total_supplier_debts NUMERIC := 0;
    v_res jsonb;
BEGIN
    vc := public.verify_company_access(p_company_id);

    SELECT array_agg(b) INTO v_auth_branches
    FROM public.get_auth_branches(vc) b;

    IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
        IF public.is_super_admin() OR current_user IN ('postgres', 'supabase_admin') THEN
            SELECT array_agg(id) INTO v_auth_branches FROM public.branches WHERE company_id = vc;
        END IF;
    END IF;

    IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
        RETURN jsonb_build_object(
            'total_sales', 0, 'total_purchases', 0, 'total_expenses', 0,
            'receipt_bonds', 0, 'payment_bonds', 0, 'total_debts', 0,
            'total_supplier_debts', 0, 'invoice_count', 0
        );
    END IF;

    IF p_branch_id IS NOT NULL THEN
        IF NOT (p_branch_id = ANY(v_auth_branches)) AND NOT public.is_super_admin() AND current_user NOT IN ('postgres', 'supabase_admin') THEN
            RAISE EXCEPTION 'غير مصرح بالوصول إلى بيانات هذا الفرع' USING ERRCODE = '42501';
        END IF;
        v_target_branch := p_branch_id;
    END IF;

    -- 1. ذمم العملاء الموحدة من واقع الأستاذ العام (شاملة حساب المراقبة 1100 وحسابات العملاء MZ-121%)
    SELECT COALESCE(ROUND(SUM(
        public.fn_to_base_amount(
            jel.currency_code, 
            jel.debit_amount - jel.credit_amount, 
            COALESCE(jel.exchange_rate, 1)
        )
    ), 2), 0)
    INTO v_total_debts
    FROM public.journal_entry_lines jel
    JOIN public.accounts a ON a.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE a.company_id = vc
      AND a.deleted_at IS NULL
      AND (a.code LIKE '121%' OR a.code LIKE 'MZ-121%' OR a.code LIKE '1100%')
      AND je.deleted_at IS NULL
      AND je.status = 'posted'
      AND (
        (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
        OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
      );

    -- ذمم الموردين الموحدة (شاملة حساب المراقبة 2100 وحسابات الموردين MZ-231% و 221%)
    SELECT COALESCE(ROUND(SUM(
        public.fn_to_base_amount(
            jel.currency_code, 
            jel.credit_amount - jel.debit_amount, 
            COALESCE(jel.exchange_rate, 1)
        )
    ), 2), 0)
    INTO v_total_supplier_debts
    FROM public.journal_entry_lines jel
    JOIN public.accounts a ON a.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE a.company_id = vc
      AND a.deleted_at IS NULL
      AND (a.code LIKE '231%' OR a.code LIKE 'MZ-231%' OR a.code LIKE '221%' OR a.code LIKE 'MZ-221%' OR a.code LIKE '2100%' OR a.code LIKE '221201%')
      AND je.deleted_at IS NULL
      AND je.status = 'posted'
      AND (
        (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
        OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
      );

    -- 2. إحصائيات الفواتير والسندات والمصروفات خلال الفترة المحددة
    WITH inv_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'sale' AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          WHEN i.type IN ('sale_return', 'return_sale') AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            -1 * public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          ELSE 0
        END), 2), 0) AS total_sales,

        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'purchase' AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          WHEN i.type IN ('purchase_return', 'return_purchase') AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            -1 * public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          ELSE 0
        END), 2), 0) AS total_purchases,

        COUNT(*) FILTER (
          WHERE i.type = 'sale' AND i.status NOT IN ('draft', 'void')
            AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
            AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
        ) AS invoice_count
      FROM public.invoices i
      WHERE i.company_id = vc
        AND i.deleted_at IS NULL
        AND (
          (v_target_branch IS NOT NULL AND i.branch_id = v_target_branch)
          OR (v_target_branch IS NULL AND (i.branch_id = ANY(v_auth_branches) OR i.branch_id IS NULL))
        )
    ),
    pay_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE
          WHEN p.type = 'receipt'
               AND (p_date_from IS NULL OR p.payment_date >= p_date_from)
               AND (p_date_to IS NULL OR p.payment_date <= p_date_to) THEN
            public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)
          ELSE 0
        END), 2), 0) AS receipt_bonds,
        COALESCE(ROUND(SUM(CASE
          WHEN p.type IN ('disbursement', 'payment')
               AND (p_date_from IS NULL OR p.payment_date >= p_date_from)
               AND (p_date_to IS NULL OR p.payment_date <= p_date_to) THEN
            public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)
          ELSE 0
        END), 2), 0) AS payment_bonds
      FROM public.payments p
      WHERE p.company_id = vc AND p.status = 'posted' AND p.deleted_at IS NULL
        AND (
          (v_target_branch IS NOT NULL AND p.branch_id = v_target_branch)
          OR (v_target_branch IS NULL AND (p.branch_id = ANY(v_auth_branches) OR p.branch_id IS NULL))
        )
    ),
    exp_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE
          WHEN a.code LIKE 'MZ-3%' OR (a.type = 'expense' AND a.code NOT LIKE 'MZ-5%' AND a.code NOT LIKE '5%' AND a.code NOT LIKE '312%') THEN
            public.fn_to_base_amount(jel.currency_code, jel.debit_amount - jel.credit_amount, COALESCE(jel.exchange_rate, 1))
          ELSE 0
        END), 2), 0) AS total_expenses
      FROM public.journal_entry_lines jel
      JOIN public.accounts a ON a.id = jel.account_id
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      WHERE a.company_id = vc
        AND a.deleted_at IS NULL
        AND je.deleted_at IS NULL
        AND je.status = 'posted'
        AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
        AND (p_date_to IS NULL OR je.entry_date <= p_date_to)
        AND (
          (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
          OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
        )
    )
    SELECT jsonb_build_object(
      'total_sales', inv.total_sales,
      'total_purchases', inv.total_purchases,
      'total_expenses', exp.total_expenses,
      'receipt_bonds', pay.receipt_bonds,
      'payment_bonds', pay.payment_bonds,
      'total_debts', v_total_debts,
      'total_supplier_debts', v_total_supplier_debts,
      'invoice_count', inv.invoice_count
    ) INTO v_res
    FROM inv_summary inv
    CROSS JOIN pay_summary pay
    CROSS JOIN exp_summary exp;

    RETURN v_res;
END;
$function$;

-- 2. get_debt_followup_dashboard update
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
    v_is_super boolean;
    v_has_all_branches boolean := false;
    v_stage_call integer;
    v_stage_visit integer;
    v_stage_legal integer;
    v_effective_limit integer;
BEGIN
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

    v_is_super := public.is_super_admin() OR current_user IN ('postgres', 'supabase_admin');

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
           AND jel.account_id IN (SELECT id FROM ar_accounts)
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

-- 3. get_debt_analytics_summary update
CREATE OR REPLACE FUNCTION public.get_debt_analytics_summary(
    p_company_id uuid,
    p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_result JSON;
    v_allowed_branches uuid[];
    v_target_branches uuid[];
    v_due_soon integer;
    v_critical integer;
    v_rem_window integer;
    v_base_currency text;
    v_is_super boolean;
BEGIN
    v_is_super := public.is_super_admin() OR current_user IN ('postgres', 'supabase_admin');

    IF auth.uid() IS NOT NULL THEN
        PERFORM public.fn_assert_company_access(p_company_id);
    END IF;

    SELECT c.due_soon_days, c.critical_days, c.reminder_window_days
      INTO v_due_soon, v_critical, v_rem_window
      FROM public.debt_followup_config c
     WHERE c.company_id = p_company_id
     LIMIT 1;

    v_due_soon   := COALESCE(v_due_soon, 7);
    v_critical   := COALESCE(v_critical, 30);
    v_rem_window := COALESCE(v_rem_window, 3);

    SELECT c.base_currency::TEXT INTO v_base_currency
      FROM public.companies c
     WHERE c.id = p_company_id;
    v_base_currency := COALESCE(v_base_currency, 'SAR');

    SELECT ARRAY_AGG(b) INTO v_allowed_branches
    FROM public.get_auth_branches(p_company_id) AS b;

    IF v_allowed_branches IS NULL OR ARRAY_LENGTH(v_allowed_branches, 1) = 0 THEN
        IF v_is_super THEN
            SELECT ARRAY_AGG(id) INTO v_allowed_branches FROM public.branches WHERE company_id = p_company_id;
        ELSE
            RETURN '{}'::JSON;
        END IF;
    END IF;

    IF p_branch_id IS NOT NULL THEN
        IF NOT (p_branch_id = ANY(v_allowed_branches)) AND NOT v_is_super THEN
            RETURN '{}'::JSON;
        END IF;
        v_target_branches := ARRAY[p_branch_id];
    ELSE
        v_target_branches := v_allowed_branches;
    END IF;

    WITH dashboard_data AS (
        SELECT * FROM public.get_debt_followup_dashboard(
            p_company_id, v_due_soon, v_critical, v_rem_window, p_branch_id, 100000)
    ),
    rates AS (
        SELECT DISTINCT ON (currency_code)
            currency_code,
            rate_to_base
        FROM public.exchange_rates
        WHERE company_id = p_company_id
          AND effective_date <= CURRENT_DATE
        ORDER BY currency_code, effective_date DESC, created_at DESC
    ),
    converted_debtors AS (
        SELECT
            d.*,
            public.fn_to_base_amount(d.currency_code, d.outstanding_balance, r.rate_to_base, v_base_currency) AS converted_balance,
            public.fn_to_base_amount(d.currency_code, d.overdue_amount, r.rate_to_base, v_base_currency) AS converted_overdue
        FROM dashboard_data d
        LEFT JOIN rates r ON r.currency_code = d.currency_code
    ),
    currency_agg AS (
        SELECT
            currency_code,
            SUM(outstanding_balance) AS balance,
            COUNT(DISTINCT party_id) AS cnt
        FROM dashboard_data
        WHERE outstanding_balance > 0
        GROUP BY currency_code
    )
    SELECT json_build_object(
        'total_receivables',
            COALESCE((SELECT SUM(converted_balance) FROM converted_debtors WHERE outstanding_balance > 0), 0)::NUMERIC,
        'overdue_receivables',
            COALESCE((SELECT SUM(converted_overdue) FROM converted_debtors WHERE overdue_amount > 0), 0)::NUMERIC,
        'due_today',
            COALESCE((SELECT SUM(converted_balance) FROM converted_debtors WHERE classification = 'due_today'), 0)::NUMERIC,
        'aging',
            (SELECT json_build_array(
                json_build_object(
                    'key', 'b0_30',
                    'value', (COALESCE(SUM(GREATEST(converted_balance - converted_overdue, 0)), 0) + COALESCE(SUM(converted_overdue) FILTER (WHERE COALESCE(days_overdue, 0) <= 30), 0))::NUMERIC,
                    'count', COUNT(DISTINCT party_id) FILTER (WHERE COALESCE(days_overdue, 0) <= 30)),
                json_build_object(
                    'key', 'b31_60',
                    'value', COALESCE(SUM(converted_overdue) FILTER (WHERE days_overdue > 30 AND days_overdue <= 60), 0)::NUMERIC,
                    'count', COUNT(DISTINCT party_id) FILTER (WHERE days_overdue > 30 AND days_overdue <= 60)),
                json_build_object(
                    'key', 'b61_90',
                    'value', COALESCE(SUM(converted_overdue) FILTER (WHERE days_overdue > 60 AND days_overdue <= 90), 0)::NUMERIC,
                    'count', COUNT(DISTINCT party_id) FILTER (WHERE days_overdue > 60 AND days_overdue <= 90)),
                json_build_object(
                    'key', 'b90_plus',
                    'value', COALESCE(SUM(converted_overdue) FILTER (WHERE days_overdue > 90), 0)::NUMERIC,
                    'count', COUNT(DISTINCT party_id) FILTER (WHERE days_overdue > 90))
            ) FROM converted_debtors WHERE outstanding_balance > 0),
        'by_currency',
            COALESCE((SELECT json_agg(json_build_object(
                'currency_code', currency_code,
                'balance', balance,
                'count', cnt
            )) FROM currency_agg), '[]'::JSON),
        'total_debtors',
            (SELECT COUNT(DISTINCT party_id) FROM dashboard_data WHERE outstanding_balance > 0),
        'critical_debtors',
            (SELECT COUNT(DISTINCT party_id) FROM dashboard_data WHERE classification = 'critical'),
        'broken_promises_count',
            (SELECT COUNT(DISTINCT party_id) FROM dashboard_data WHERE has_broken_promise = true)
    ) INTO v_result;

    RETURN COALESCE(v_result, '{}'::JSON);
END;
$function$;

COMMENT ON FUNCTION public.get_dashboard_summary(uuid,uuid,date,date) IS 'Unified 2026-11-14: included MZ-121% and MZ-231% Mizan detailed accounts';
COMMENT ON FUNCTION public.get_debt_followup_dashboard(uuid,integer,integer,integer,uuid,integer) IS 'Unified 2026-11-14: included MZ-121% accounts in AR scope';
COMMENT ON FUNCTION public.get_debt_analytics_summary(uuid,uuid) IS 'Unified 2026-11-14: added admin fallback for allowed branches';
