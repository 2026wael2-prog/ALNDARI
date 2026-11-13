-- Fix: Include unallocated receipt/payment/discount bonds and exclude cash invoices
-- from total_debts and total_supplier_debts in get_dashboard_summary, while
-- consistently normalizing foreign currencies via fn_to_base_amount.

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
    v_opening_cust_debts NUMERIC := 0;
    v_opening_supp_debts NUMERIC := 0;
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

    -- 1. Opening balances (customers & suppliers)
    WITH latest_rates AS (
      SELECT DISTINCT ON (currency_code) currency_code, rate_to_base
      FROM public.exchange_rates
      WHERE company_id = vc
      ORDER BY currency_code, effective_date DESC, created_at DESC
    )
    SELECT
      COALESCE(SUM(CASE WHEN p.type = 'customer' THEN
        public.fn_to_base_amount(ob.currency_code, ob.amount, lr.rate_to_base) * CASE WHEN ob.direction = 'debit' THEN 1 ELSE -1 END
      ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN p.type = 'supplier' THEN
        public.fn_to_base_amount(ob.currency_code, ob.amount, lr.rate_to_base) * CASE WHEN ob.direction = 'credit' THEN 1 ELSE -1 END
      ELSE 0 END), 0)
    INTO v_opening_cust_debts, v_opening_supp_debts
    FROM public.party_opening_balances ob
    JOIN public.parties p ON p.id = ob.party_id AND p.deleted_at IS NULL AND p.type IN ('customer', 'supplier')
    LEFT JOIN latest_rates lr ON lr.currency_code = (ob.currency_code)::text
    WHERE ob.company_id = vc
      AND (
        (v_target_branch IS NOT NULL AND (ob.branch_id = v_target_branch OR p.branch_id = v_target_branch))
        OR (v_target_branch IS NULL AND (ob.branch_id = ANY(v_auth_branches) OR ob.branch_id IS NULL))
      );

    -- 2. Invoices, Payments (period & unallocated cumulative), Expenses
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

        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'sale' AND i.status IN ('posted','confirmed','partially_paid')
               AND COALESCE(i.payment_method, 'credit') <> 'cash'
               AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0 THEN
            public.fn_to_base_amount(i.currency_code, i.total_amount - COALESCE(i.paid_amount, 0), i.exchange_rate)
          WHEN i.type IN ('sale_return', 'return_sale') AND i.status IN ('posted','confirmed','partially_paid')
               AND COALESCE(i.payment_method, 'credit') <> 'cash' THEN
            -1 * public.fn_to_base_amount(i.currency_code, GREATEST(0, i.total_amount - COALESCE(i.paid_amount, 0)), i.exchange_rate)
          ELSE 0
        END), 2), 0) AS total_debts,

        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'purchase' AND i.status IN ('posted','confirmed','partially_paid')
               AND COALESCE(i.payment_method, 'credit') <> 'cash'
               AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0 THEN
            public.fn_to_base_amount(i.currency_code, i.total_amount - COALESCE(i.paid_amount, 0), i.exchange_rate)
          WHEN i.type IN ('purchase_return', 'return_purchase') AND i.status IN ('posted','confirmed','partially_paid')
               AND COALESCE(i.payment_method, 'credit') <> 'cash' THEN
            -1 * public.fn_to_base_amount(i.currency_code, GREATEST(0, i.total_amount - COALESCE(i.paid_amount, 0)), i.exchange_rate)
          ELSE 0
        END), 2), 0) AS total_supplier_debts,

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
    alloc_summary AS (
      SELECT pa.payment_id, SUM(pa.amount) AS allocated_amount
      FROM public.payment_allocations pa
      WHERE pa.company_id = vc
      GROUP BY pa.payment_id
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
        END), 2), 0) AS payment_bonds,
        COALESCE(ROUND(SUM(CASE
          WHEN p.type = 'receipt' AND pt.type IN ('customer', 'both') THEN
            public.fn_to_base_amount(p.currency_code, GREATEST(0, p.amount - COALESCE(a.allocated_amount, 0)), p.exchange_rate)
          ELSE 0
        END), 2), 0) AS unalloc_cust_receipts,
        COALESCE(ROUND(SUM(CASE
          WHEN p.type IN ('disbursement', 'payment') AND pt.type IN ('supplier', 'both') THEN
            public.fn_to_base_amount(p.currency_code, GREATEST(0, p.amount - COALESCE(a.allocated_amount, 0)), p.exchange_rate)
          ELSE 0
        END), 2), 0) AS unalloc_supp_payments
      FROM public.payments p
      LEFT JOIN public.parties pt ON pt.id = p.party_id AND pt.deleted_at IS NULL
      LEFT JOIN alloc_summary a ON a.payment_id = p.id
      WHERE p.company_id = vc AND p.status = 'posted' AND p.deleted_at IS NULL
        AND (
          (v_target_branch IS NOT NULL AND p.branch_id = v_target_branch)
          OR (v_target_branch IS NULL AND (p.branch_id = ANY(v_auth_branches) OR p.branch_id IS NULL))
        )
    ),
    exp_summary AS (
      SELECT
        COALESCE(ROUND(SUM(
          public.fn_to_base_amount(e.currency_code, e.amount, e.exchange_rate)
        ), 2), 0) AS total_expenses
      FROM public.expenses e
      WHERE e.company_id = vc AND e.status IN ('posted','paid') AND e.deleted_at IS NULL
        AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
        AND (p_date_to IS NULL OR e.expense_date <= p_date_to)
        AND (
          (v_target_branch IS NOT NULL AND e.branch_id = v_target_branch)
          OR (v_target_branch IS NULL AND (e.branch_id = ANY(v_auth_branches) OR e.branch_id IS NULL))
        )
    )
    SELECT jsonb_build_object(
      'total_sales', inv.total_sales,
      'total_purchases', inv.total_purchases,
      'total_expenses', exp.total_expenses,
      'receipt_bonds', pay.receipt_bonds,
      'payment_bonds', pay.payment_bonds,
      'total_debts', ROUND(inv.total_debts + v_opening_cust_debts - pay.unalloc_cust_receipts, 2),
      'total_supplier_debts', ROUND(inv.total_supplier_debts + v_opening_supp_debts - pay.unalloc_supp_payments, 2),
      'invoice_count', inv.invoice_count
    ) INTO v_res
    FROM inv_summary inv
    CROSS JOIN pay_summary pay
    CROSS JOIN exp_summary exp;

    RETURN v_res;
END;
$function$;

