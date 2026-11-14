-- 20261114000001_unify_dashboard_debts_and_expenses_with_gl.sql
-- توحيد حساب الذمم في لوحة التحكم مع الأستاذ العام ومنع ظهور الأرقام السالبة الناتجة عن بيانات الميزان

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

    -- 1. الذمم الموحدة من واقع الأستاذ العام (Single Source of Truth)
    -- ذمم العملاء (حسابات 121% و 1100%): رصيد مدين
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
      AND (a.code LIKE '121%' OR a.code LIKE '1100%')
      AND je.deleted_at IS NULL
      AND je.status = 'posted'
      AND (
        (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
        OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
      );

    -- ذمم الموردين (حسابات 231% و 221% و 2100%): رصيد دائن
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
      AND (a.code LIKE '231%' OR a.code LIKE '221%' OR a.code LIKE '2100%')
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
