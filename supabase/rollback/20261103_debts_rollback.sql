-- ============================================================
-- ROLLBACK for 20261103000001 + 20261103000002
-- يُعيد تعريفات الدوال والسياسة كما كانت حيّة قبل التطبيق (مُولَّد آلياً
-- من pg_get_functiondef على قاعدة الإنتاج قبل التطبيق).
-- لا يُشغَّل تلقائياً: وضعه في supabase/rollback/ لا في supabase/migrations/.
-- التشغيل: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollback/20261103_debts_rollback.sql
-- ============================================================

BEGIN;

-- 1) حذف overload الأربع وسائط الذي أضافته الهجرة (لا يوجد في النسخة الحيّة السابقة)
DROP FUNCTION IF EXISTS public.fn_to_base_amount(text, numeric, numeric, text);

-- 2) إعادة تعريفات ما قبل الهجرة
-- ── get_debt_followup_dashboard(p_company_id uuid, p_due_soon_days integer, p_critical_days integer, p_reminder_window_days integer, p_branch_id uuid, p_limit integer) ──
CREATE OR REPLACE FUNCTION public.get_debt_followup_dashboard(p_company_id uuid, p_due_soon_days integer DEFAULT 7, p_critical_days integer DEFAULT 30, p_reminder_window_days integer DEFAULT 3, p_branch_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT NULL::integer)
 RETURNS TABLE(party_id uuid, party_name text, party_phone text, category text, credit_limit numeric, currency_code text, outstanding_balance numeric, overdue_amount numeric, oldest_due_date date, next_due_date date, days_overdue integer, classification text, reminder_status text, last_reminded_at timestamp with time zone, last_contact_date timestamp with time zone, has_broken_promise boolean, pending_promise_count bigint, pending_promise_amount numeric, pending_promise_date date, invoice_count bigint, opening_balance numeric, escalation_stage text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
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
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    -- عتبات خط التصعيد من الإعدادات (والافتراضي 30/60/90)
    SELECT c.stage_call_days, c.stage_visit_days, c.stage_legal_days
      INTO v_stage_call, v_stage_visit, v_stage_legal
      FROM public.debt_followup_config c
     WHERE c.company_id = p_company_id
     LIMIT 1;

    v_stage_call  := COALESCE(v_stage_call, 30);
    v_stage_visit := COALESCE(v_stage_visit, 60);
    v_stage_legal := COALESCE(v_stage_legal, 90);

    v_is_super := public.is_super_admin() OR current_user IN ('postgres', 'supabase_admin');

    SELECT ARRAY_AGG(b) INTO v_allowed_branches
    FROM public.get_auth_branches(p_company_id) AS b;

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
    WITH invoice_debts AS (
        SELECT
            i.party_id,
            i.currency_code,
            SUM(i.total_amount - COALESCE(i.paid_amount, 0)) AS outstanding,
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
        GROUP BY i.party_id, i.currency_code
    ),
    opening_balances AS (
        SELECT
            ob.party_id,
            ob.currency_code,
            SUM(CASE WHEN ob.direction = 'debit' THEN ob.amount ELSE -ob.amount END) AS opening_amount
        FROM public.party_opening_balances ob
        WHERE ob.company_id = p_company_id
          AND (p_branch_id IS NULL OR ob.branch_id = p_branch_id)
          AND (p_branch_id IS NOT NULL OR v_is_super OR v_has_all_branches OR ob.branch_id = ANY(v_target_branches))
        GROUP BY ob.party_id, ob.currency_code
    ),
    combined AS (
        SELECT
            COALESCE(id.party_id, ob.party_id) AS party_id,
            COALESCE(id.currency_code, ob.currency_code) AS currency_code,
            COALESCE(id.outstanding, 0) + COALESCE(ob.opening_amount, 0) AS outstanding_balance,
            COALESCE(id.overdue_amount, 0) AS overdue_amount,
            id.oldest_due_date,
            id.next_due_date,
            COALESCE(id.invoice_count, 0) AS invoice_count,
            COALESCE(ob.opening_amount, 0) AS opening_balance
        FROM invoice_debts id
        FULL OUTER JOIN opening_balances ob
            ON ob.party_id = id.party_id AND ob.currency_code = id.currency_code
        WHERE (COALESCE(id.outstanding, 0) + COALESCE(ob.opening_amount, 0)) > 0
    ),
    ranked_candidates AS (
        SELECT
            c.party_id,
            p.name::TEXT AS party_name,
            p.phone::TEXT AS party_phone,
            COALESCE(pc.name, 'عام')::TEXT AS category,
            p.credit_limit,
            c.currency_code::TEXT AS currency_code,
            c.outstanding_balance,
            c.overdue_amount,
            c.oldest_due_date,
            c.next_due_date,
            CASE WHEN c.oldest_due_date IS NOT NULL
                THEN (v_today - c.oldest_due_date) ELSE 0 END AS days_overdue,
            CASE
                WHEN c.oldest_due_date IS NOT NULL
                     AND (v_today - c.oldest_due_date) >= p_critical_days THEN 'critical'
                WHEN c.oldest_due_date IS NOT NULL AND c.oldest_due_date < v_today THEN 'overdue'
                WHEN c.next_due_date = v_today THEN 'due_today'
                WHEN c.next_due_date IS NOT NULL
                     AND c.next_due_date <= v_today + p_due_soon_days THEN 'due_soon'
                ELSE 'current'
            END AS classification,
            c.invoice_count,
            c.opening_balance
        FROM combined c
        JOIN public.parties p ON p.id = c.party_id AND p.deleted_at IS NULL
          AND (p_branch_id IS NULL OR p.branch_id = p_branch_id OR p.branch_id IS NULL)
        LEFT JOIN public.party_categories pc ON pc.id = p.category_id
        ORDER BY c.overdue_amount DESC NULLS LAST, days_overdue DESC NULLS LAST
        LIMIT p_limit
    )
    SELECT
        rc.party_id,
        rc.party_name,
        rc.party_phone,
        rc.category,
        rc.credit_limit,
        rc.currency_code,
        rc.outstanding_balance,
        rc.overdue_amount,
        rc.oldest_due_date,
        rc.next_due_date,
        rc.days_overdue,
        rc.classification,
        CASE
            WHEN lr.last_reminded_at IS NOT NULL
                 AND lr.last_reminded_at >= NOW() - make_interval(days => p_reminder_window_days)
                 THEN 'reminded'
            ELSE 'needs_reminder'
        END AS reminder_status,
        lr.last_reminded_at,
        lc.last_contact_date,
        COALESCE(ps.has_broken_promise, false) AS has_broken_promise,
        COALESCE(ps.pending_promise_count, 0) AS pending_promise_count,
        COALESCE(ps.pending_promise_amount, 0) AS pending_promise_amount,
        ps.pending_promise_date,
        rc.invoice_count,
        rc.opening_balance,
        -- خط التصعيد: الإجراء المقترح حسب أيام التأخير (مرحلة = عتبة أولى تجاوزها)
        CASE
            WHEN rc.days_overdue >= v_stage_legal THEN 'legal'
            WHEN rc.days_overdue >= v_stage_visit THEN 'visit'
            WHEN rc.days_overdue >= v_stage_call  THEN 'call'
            WHEN rc.days_overdue >  p_critical_days THEN 'reminder'
            ELSE 'monitor'
        END AS escalation_stage
    FROM ranked_candidates rc
    LEFT JOIN LATERAL (
        SELECT
            BOOL_OR(pp.status = 'broken') AS has_broken_promise,
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
        ORDER BY ml.created_at DESC
        LIMIT 1
    ) lr ON true
    LEFT JOIN LATERAL (
        SELECT ca.created_at AS last_contact_date
        FROM public.customer_activities ca
        WHERE ca.company_id = p_company_id AND ca.customer_id = rc.party_id
        ORDER BY ca.created_at DESC
        LIMIT 1
    ) lc ON true
    ORDER BY rc.overdue_amount DESC NULLS LAST, rc.days_overdue DESC NULLS LAST;
END;
$function$;


-- ── get_debt_party_overview(p_company_id uuid, p_party_id uuid) ──
CREATE OR REPLACE FUNCTION public.get_debt_party_overview(p_company_id uuid, p_party_id uuid)
 RETURNS TABLE(party_id uuid, party_name text, party_phone text, category text, credit_limit numeric, total_outstanding numeric, overdue_amount numeric, due_today_amount numeric, invoice_count bigint, opening_balance numeric, has_broken_promise boolean, pending_promise_count bigint, pending_promise_amount numeric, last_reminded_at timestamp with time zone, last_contact_date timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_allowed_branches uuid[];
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    SELECT ARRAY_AGG(b) INTO v_allowed_branches
    FROM public.get_auth_branches(p_company_id) AS b;

    IF v_allowed_branches IS NULL OR ARRAY_LENGTH(v_allowed_branches, 1) = 0 THEN
        RETURN;
    END IF;

    IF NOT public.is_super_admin() THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.parties p
            WHERE p.id = p_party_id AND p.company_id = p_company_id AND p.branch_id = ANY(v_allowed_branches)
        ) THEN
            RETURN;
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        p.id AS party_id,
        p.name::TEXT AS party_name,
        p.phone::TEXT AS party_phone,
        COALESCE(pc.name, 'عام')::TEXT AS category,
        p.credit_limit,
        COALESCE(SUM(CASE WHEN i.id IS NOT NULL
            THEN public.fn_to_base_amount(i.currency_code, i.total_amount - COALESCE(i.paid_amount, 0), i.exchange_rate) ELSE 0 END), 0)::NUMERIC
            + COALESCE((SELECT SUM(
                public.fn_to_base_amount(ob.currency_code, ob.amount,
                    (SELECT er.rate_to_base FROM public.exchange_rates er
                     WHERE er.company_id = p_company_id AND er.currency_code = ob.currency_code
                     ORDER BY er.effective_date DESC, er.created_at DESC LIMIT 1))
                * CASE WHEN ob.direction = 'debit' THEN 1 ELSE -1 END)
                FROM public.party_opening_balances ob
                WHERE ob.company_id = p_company_id AND ob.party_id = p_party_id
                  AND (public.is_super_admin() OR ob.branch_id = ANY(v_allowed_branches))
            ), 0)::NUMERIC
            AS total_outstanding,
        COALESCE(SUM(CASE WHEN i.due_date < v_today
            THEN public.fn_to_base_amount(i.currency_code, i.total_amount - COALESCE(i.paid_amount, 0), i.exchange_rate) ELSE 0 END), 0)::NUMERIC AS overdue_amount,
        COALESCE(SUM(CASE WHEN i.due_date = v_today
            THEN public.fn_to_base_amount(i.currency_code, i.total_amount - COALESCE(i.paid_amount, 0), i.exchange_rate) ELSE 0 END), 0)::NUMERIC AS due_today_amount,
        COUNT(i.id) AS invoice_count,
        COALESCE((SELECT SUM(
            public.fn_to_base_amount(ob.currency_code, ob.amount,
                (SELECT er.rate_to_base FROM public.exchange_rates er
                 WHERE er.company_id = p_company_id AND er.currency_code = ob.currency_code
                 ORDER BY er.effective_date DESC, er.created_at DESC LIMIT 1))
            * CASE WHEN ob.direction = 'debit' THEN 1 ELSE -1 END)
            FROM public.party_opening_balances ob
            WHERE ob.company_id = p_company_id AND ob.party_id = p_party_id
              AND (public.is_super_admin() OR ob.branch_id = ANY(v_allowed_branches))
        ), 0)::NUMERIC AS opening_balance,
        EXISTS (SELECT 1 FROM public.debt_payment_promises pp
            WHERE pp.company_id = p_company_id AND pp.party_id = p_party_id
              AND pp.status = 'broken') AS has_broken_promise,
        COALESCE((SELECT COUNT(*) FROM public.debt_payment_promises pp
            WHERE pp.company_id = p_company_id AND pp.party_id = p_party_id
              AND pp.status = 'pending'), 0)::BIGINT AS pending_promise_count,
        COALESCE((SELECT SUM(public.fn_to_base_amount(pp.currency_code, pp.amount,
            (SELECT er.rate_to_base FROM public.exchange_rates er
             WHERE er.company_id = p_company_id AND er.currency_code = pp.currency_code
             ORDER BY er.effective_date DESC, er.created_at DESC LIMIT 1))) FROM public.debt_payment_promises pp
            WHERE pp.company_id = p_company_id AND pp.party_id = p_party_id
              AND pp.status = 'pending'), 0)::NUMERIC AS pending_promise_amount,
        (SELECT ml.created_at FROM public.debt_message_log ml
            WHERE ml.company_id = p_company_id AND ml.party_id = p_party_id
              AND ml.status = 'sent'
            ORDER BY ml.created_at DESC LIMIT 1) AS last_reminded_at,
        (SELECT ca.created_at FROM public.customer_activities ca
            WHERE ca.company_id = p_company_id AND ca.customer_id = p_party_id
            ORDER BY ca.created_at DESC LIMIT 1) AS last_contact_date
    FROM public.parties p
    LEFT JOIN public.party_categories pc ON pc.id = p.category_id
    LEFT JOIN public.invoices i
        ON i.party_id = p.id AND i.company_id = p_company_id
        AND i.type = 'sale' AND i.status IN ('posted', 'confirmed', 'partially_paid') AND i.deleted_at IS NULL
        AND (public.is_super_admin() OR i.branch_id = ANY(v_allowed_branches))
    WHERE p.id = p_party_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
      AND (public.is_super_admin() OR p.branch_id = ANY(v_allowed_branches))
    GROUP BY p.id, p.name, p.phone, pc.name, p.credit_limit;
END;
$function$;


-- ── get_debt_analytics_summary(p_company_id uuid, p_branch_id uuid) ──
CREATE OR REPLACE FUNCTION public.get_debt_analytics_summary(p_company_id uuid, p_branch_id uuid DEFAULT NULL::uuid)
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
BEGIN
    IF auth.uid() IS NOT NULL THEN
        PERFORM public.fn_assert_company_access(p_company_id);
    END IF;

    -- نوافذ المحرك من إعدادات الشركة المحفوظة (والافتراضي 7/30/3)
    SELECT c.due_soon_days, c.critical_days, c.reminder_window_days
      INTO v_due_soon, v_critical, v_rem_window
      FROM public.debt_followup_config c
     WHERE c.company_id = p_company_id
     LIMIT 1;

    v_due_soon   := COALESCE(v_due_soon, 7);
    v_critical   := COALESCE(v_critical, 30);
    v_rem_window := COALESCE(v_rem_window, 3);

    SELECT ARRAY_AGG(b) INTO v_allowed_branches
    FROM public.get_auth_branches(p_company_id) AS b;

    IF v_allowed_branches IS NULL OR ARRAY_LENGTH(v_allowed_branches, 1) = 0 THEN
        RETURN '{}'::JSON;
    END IF;

    IF p_branch_id IS NOT NULL THEN
        IF NOT (p_branch_id = ANY(v_allowed_branches)) AND NOT public.is_super_admin() THEN
            RETURN '{}'::JSON;
        END IF;
        v_target_branches := ARRAY[p_branch_id];
    ELSE
        v_target_branches := v_allowed_branches;
    END IF;

    WITH dashboard_data AS (
        SELECT * FROM public.get_debt_followup_dashboard(
            p_company_id, v_due_soon, v_critical, v_rem_window, p_branch_id)
    ),
    rates AS (
        SELECT DISTINCT ON (currency_code)
            currency_code,
            rate_to_base
        FROM public.exchange_rates
        WHERE company_id = p_company_id
        ORDER BY currency_code, effective_date DESC, created_at DESC
    ),
    converted_debtors AS (
        SELECT
            d.*,
            public.fn_to_base_amount(d.currency_code, d.outstanding_balance, r.rate_to_base) AS converted_balance,
            public.fn_to_base_amount(d.currency_code, d.overdue_amount, r.rate_to_base) AS converted_overdue
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
        -- شرائح التقادم: تكديس حسب أقدم استحقاق للطرف (days_overdue من اللوحة)
        'aging',
            (SELECT json_build_array(
                json_build_object(
                    'key', 'b0_30',
                    'value', COALESCE(SUM(converted_balance) FILTER (WHERE COALESCE(days_overdue, 0) <= 30), 0)::NUMERIC,
                    'count', COUNT(DISTINCT party_id) FILTER (WHERE COALESCE(days_overdue, 0) <= 30)),
                json_build_object(
                    'key', 'b31_60',
                    'value', COALESCE(SUM(converted_balance) FILTER (WHERE days_overdue > 30 AND days_overdue <= 60), 0)::NUMERIC,
                    'count', COUNT(DISTINCT party_id) FILTER (WHERE days_overdue > 30 AND days_overdue <= 60)),
                json_build_object(
                    'key', 'b61_90',
                    'value', COALESCE(SUM(converted_balance) FILTER (WHERE days_overdue > 60 AND days_overdue <= 90), 0)::NUMERIC,
                    'count', COUNT(DISTINCT party_id) FILTER (WHERE days_overdue > 60 AND days_overdue <= 90)),
                json_build_object(
                    'key', 'b90_plus',
                    'value', COALESCE(SUM(converted_balance) FILTER (WHERE days_overdue > 90), 0)::NUMERIC,
                    'count', COUNT(DISTINCT party_id) FILTER (WHERE days_overdue > 90))
             ) FROM converted_debtors),
        'opening_balances_total',
            COALESCE((SELECT SUM(
                    public.fn_to_base_amount(ob.currency_code, ob.amount, r.rate_to_base)
                    * CASE WHEN ob.direction = 'debit' THEN 1 ELSE -1 END
                )
                FROM public.party_opening_balances ob
                LEFT JOIN rates r ON r.currency_code = ob.currency_code
                WHERE ob.company_id = p_company_id
                  AND (public.is_super_admin() OR ob.branch_id IS NULL OR ob.branch_id = ANY(v_target_branches))
            ), 0)::NUMERIC,
        'pending_promises',
            COALESCE((SELECT COUNT(*) FROM public.debt_payment_promises pp
                WHERE pp.company_id = p_company_id AND pp.status = 'pending'
                  AND pp.party_id IN (SELECT id FROM public.parties WHERE branch_id = ANY(v_target_branches))
            ), 0),
        'pending_promises_amount',
            COALESCE((SELECT SUM(public.fn_to_base_amount(pp.currency_code, pp.amount, r.rate_to_base))
                FROM public.debt_payment_promises pp
                LEFT JOIN rates r ON r.currency_code = pp.currency_code
                WHERE pp.company_id = p_company_id AND pp.status = 'pending'
                  AND pp.party_id IN (SELECT id FROM public.parties WHERE branch_id = ANY(v_target_branches))
            ), 0)::NUMERIC,
        'broken_promises',
            COALESCE((SELECT COUNT(*) FROM public.debt_payment_promises pp
                WHERE pp.company_id = p_company_id AND pp.status = 'broken'
                  AND pp.party_id IN (SELECT id FROM public.parties WHERE branch_id = ANY(v_target_branches))
            ), 0),
        'broken_promises_amount',
            COALESCE((SELECT SUM(public.fn_to_base_amount(pp.currency_code, pp.amount, r.rate_to_base))
                FROM public.debt_payment_promises pp
                LEFT JOIN rates r ON r.currency_code = pp.currency_code
                WHERE pp.company_id = p_company_id AND pp.status = 'broken'
                  AND pp.party_id IN (SELECT id FROM public.parties WHERE branch_id = ANY(v_target_branches))
            ), 0)::NUMERIC,
        'sent_messages',
            COALESCE((SELECT COUNT(*) FROM public.debt_message_log ml
                WHERE ml.company_id = p_company_id AND ml.status = 'sent'
                  AND ml.party_id IN (SELECT id FROM public.parties WHERE branch_id = ANY(v_target_branches))
            ), 0),
        'failed_messages',
            COALESCE((SELECT COUNT(*) FROM public.debt_message_log ml
                WHERE ml.company_id = p_company_id AND ml.status = 'failed'
                  AND ml.party_id IN (SELECT id FROM public.parties WHERE branch_id = ANY(v_target_branches))
            ), 0),
        'failed_messages_24h',
            COALESCE((SELECT COUNT(*) FROM public.debt_message_log ml
                WHERE ml.company_id = p_company_id AND ml.status = 'failed'
                  AND ml.created_at >= NOW() - INTERVAL '24 hours'
                  AND ml.party_id IN (SELECT id FROM public.parties WHERE branch_id = ANY(v_target_branches))
            ), 0),
        'total_debtors',
            COALESCE((SELECT COUNT(DISTINCT party_id)::INT FROM dashboard_data WHERE outstanding_balance > 0), 0),
        'needs_reminder',
            COALESCE((SELECT COUNT(DISTINCT party_id)::INT FROM dashboard_data WHERE reminder_status = 'needs_reminder'), 0),
        'by_currency',
            (SELECT json_agg(json_build_object(
                'currency', ca.currency_code,
                'balance', ca.balance,
                'count', ca.cnt))
             FROM currency_agg ca)
    ) INTO v_result;
    RETURN v_result;
END;
$function$;


-- ── fn_to_base_amount(p_currency_code text, p_amount numeric, p_exchange_rate numeric) ──
CREATE OR REPLACE FUNCTION public.fn_to_base_amount(p_currency_code text, p_amount numeric, p_exchange_rate numeric DEFAULT 1)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_amount IS NULL OR p_amount = 0 THEN 0::numeric
    WHEN UPPER(TRIM(COALESCE(p_currency_code, 'SAR'))) = 'SAR' THEN ROUND(p_amount, 4)
    WHEN COALESCE(p_exchange_rate, 1) <= 0 THEN ROUND(p_amount, 4)
    WHEN COALESCE(p_exchange_rate, 1) < 1 THEN ROUND(p_amount * p_exchange_rate, 4)
    WHEN UPPER(TRIM(p_currency_code)) = 'YER' THEN ROUND(p_amount / p_exchange_rate, 4)
    ELSE ROUND(p_amount * p_exchange_rate, 4)
  END;
$function$;


-- ── record_debt_reminder(p_company_id uuid, p_party_id uuid, p_message_text text, p_channel character varying, p_template_id uuid, p_recipient character varying, p_related_entity_type character varying, p_related_entity_id uuid, p_idempotency_key text) ──
CREATE OR REPLACE FUNCTION public.record_debt_reminder(p_company_id uuid, p_party_id uuid, p_message_text text, p_channel character varying DEFAULT 'whatsapp'::character varying, p_template_id uuid DEFAULT NULL::uuid, p_recipient character varying DEFAULT NULL::character varying, p_related_entity_type character varying DEFAULT NULL::character varying, p_related_entity_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS TABLE(message_log_id uuid, activity_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_msg_id  UUID;
    v_act_id  UUID;
    v_existing UUID;
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    -- إعادة محاولة/نقر مزدوج: أعد الرسالة المسجلة بدل إنشاء سجل جديد
    IF p_idempotency_key IS NOT NULL THEN
        SELECT ml.id INTO v_existing
        FROM public.debt_message_log ml
        WHERE ml.company_id = p_company_id
          AND ml.idempotency_key = p_idempotency_key
        LIMIT 1;

        IF v_existing IS NOT NULL THEN
            RETURN QUERY SELECT v_existing, NULL::UUID;
            RETURN;
        END IF;
    END IF;

    -- حارس المستأجر: يجب أن ينتمي الطرف لنفس الشركة
    IF NOT EXISTS (
        SELECT 1 FROM public.parties p
        WHERE p.id = p_party_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'INVALID_PARTY';
    END IF;

    -- ملكية القالب: لا يجوز استخدام قالب شركة أخرى
    IF p_template_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.debt_message_templates t
        WHERE t.id = p_template_id AND t.company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'INVALID_TEMPLATE';
    END IF;

    INSERT INTO public.debt_message_log (
        company_id, party_id, channel, template_id, message_text,
        status, recipient, related_entity_type, related_entity_id,
        created_by, sent_at, idempotency_key
    ) VALUES (
        p_company_id, p_party_id, p_channel, p_template_id, p_message_text,
        'sent', p_recipient, p_related_entity_type, p_related_entity_id,
        auth.uid(), NOW(), p_idempotency_key
    )
    RETURNING id INTO v_msg_id;

    INSERT INTO public.customer_activities (
        company_id, customer_id, activity_type, subject, description,
        status, priority, scheduled_at, completed_at, created_by
    ) VALUES (
        p_company_id, p_party_id, 'follow_up', 'تذكير دين', p_message_text,
        'completed', 'medium', NOW(), NOW(), auth.uid()
    )
    RETURNING id INTO v_act_id;

    RETURN QUERY SELECT v_msg_id, v_act_id;
END;
$function$;


-- ── سياسة debt_insert_msg_log كما كانت قبل التشديد ──
DROP POLICY IF EXISTS debt_insert_msg_log ON public.debt_message_log;
CREATE POLICY debt_insert_msg_log ON public.debt_message_log
  FOR INSERT WITH CHECK (company_id IN (SELECT get_auth_companies()));

-- 3) صلاحيات التنفيذ (كما في النسخة الحيّة)
REVOKE EXECUTE ON FUNCTION public.get_debt_followup_dashboard(uuid, integer, integer, integer, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_debt_followup_dashboard(uuid, integer, integer, integer, uuid, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_debt_party_overview(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_debt_party_overview(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_debt_analytics_summary(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_debt_analytics_summary(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_debt_reminder(uuid, uuid, text, character varying, uuid, character varying, character varying, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_debt_reminder(uuid, uuid, text, character varying, uuid, character varying, character varying, uuid, text) TO authenticated;

COMMIT;
