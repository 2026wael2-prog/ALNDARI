-- ============================================================
-- Migration: Fix Inventory Stock Valuation & Cash Liquidity & Drawer Summary
-- Date: 2026-11-14
-- Issues fixed:
--   1. get_stock_valuation: CRITICAL BUG (42803) - nested aggregate function calls
--      crashed the query on invocation. Rebuilt with proper CTE.
--      Also added total_products and total_stock aliases for frontend compatibility.
--   2. get_cash_liquidity: missed bank accounts (103%) and Mizan cash/bank accounts (MZ-13%, MZ-14%)
--      causing 10.26M SAR in cash liquidity to be hidden from the dashboard.
--   3. get_daily_drawer_summary: raw currency amounts without fn_to_base_amount
--      caused multi-currency drawer distortion (e.g. YER added raw into SAR drawer).
-- ============================================================

-- ============================================================
-- FIX 1: get_stock_valuation
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_stock_valuation(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result json;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  WITH warehouse_totals AS (
    SELECT
      w.id AS warehouse_id,
      w.name_ar AS warehouse_name,
      COALESCE(SUM(ps.quantity * p.cost_price), 0)::numeric AS value,
      COALESCE(SUM(ps.quantity), 0)::numeric AS qty
    FROM public.product_stock ps
    JOIN public.products p ON p.id = ps.product_id
    JOIN public.warehouses w ON w.id = ps.warehouse_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND w.deleted_at IS NULL
      AND ps.quantity > 0
    GROUP BY w.id, w.name_ar
  ),
  overall_totals AS (
    SELECT
      COALESCE(SUM(ps.quantity * p.cost_price), 0)::numeric AS total_val,
      COUNT(DISTINCT p.id)::bigint AS total_items_count,
      COALESCE(SUM(ps.quantity), 0)::numeric AS total_quantity
    FROM public.product_stock ps
    JOIN public.products p ON p.id = ps.product_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND ps.quantity > 0
  )
  SELECT json_build_object(
    'total_value',    ROUND(ot.total_val, 2),
    'total_items',    ot.total_items_count,
    'total_products', ot.total_items_count,
    'total_qty',      ROUND(ot.total_quantity, 2),
    'total_stock',    ROUND(ot.total_quantity, 2),
    'by_warehouse',   COALESCE((
      SELECT json_agg(json_build_object(
        'warehouse_id',   wt.warehouse_id,
        'warehouse_name', wt.warehouse_name,
        'value',          ROUND(wt.value, 2),
        'qty',            ROUND(wt.qty, 2)
      ))
      FROM warehouse_totals wt
    ), '[]'::json)
  )
  INTO v_result
  FROM overall_totals ot;

  RETURN COALESCE(v_result, '{}'::json);
END;
$$;

-- ============================================================
-- FIX 2: get_cash_liquidity
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_cash_liquidity(p_company_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_liquidity numeric;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    PERFORM public.fn_assert_company_access(p_company_id);
  END IF;

  SELECT COALESCE(ROUND(SUM(
    public.fn_to_base_amount(
      jel.currency_code,
      jel.debit_amount - jel.credit_amount,
      COALESCE(jel.exchange_rate, 1)
    )
  ), 2), 0)
  INTO v_liquidity
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE je.company_id = p_company_id
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND a.company_id = p_company_id
    AND a.deleted_at IS NULL
    AND (
      a.code LIKE '101%'       -- صناديق محلات النظاري
      OR a.code LIKE '102%'   -- صناديق إضافية
      OR a.code LIKE '103%'   -- البنوك والمصارف (الكريمي)
      OR a.code LIKE '111%'   -- النقدية وشبه النقدية
      OR a.code LIKE 'MZ-13%' -- أموال جاهزة وشبه جاهزة من الميزان (صناديق وبنوك)
      OR a.code LIKE 'MZ-14%' -- صناديق عملات أجنبية من الميزان
    );

  RETURN COALESCE(v_liquidity, 0);
END;
$$;

-- ============================================================
-- FIX 3: get_daily_drawer_summary
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_daily_drawer_summary(
    p_company_id uuid,
    p_date date,
    p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_opening_float numeric(19,4) := 0;
    v_total_sales numeric(19,4) := 0;
    v_cash_sales numeric(19,4) := 0;
    v_card_sales numeric(19,4) := 0;
    v_transfer_sales numeric(19,4) := 0;
    v_credit_sales numeric(19,4) := 0;
    v_returns_cash numeric(19,4) := 0;
    v_returns_card numeric(19,4) := 0;
    v_cash_receipts numeric(19,4) := 0;
    v_cash_disbursements numeric(19,4) := 0;
    v_card_receipts numeric(19,4) := 0;
    v_petty_expenses numeric(19,4) := 0;
    v_expected_cash numeric(19,4) := 0;
    v_expected_card numeric(19,4) := 0;
    v_employee_breakdown jsonb := '[]'::jsonb;
    v_existing_reconciliation jsonb := NULL;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NOT NULL THEN
        PERFORM public.verify_company_access(p_company_id);
    END IF;

    -- 1) جلب العهدة الافتتاحية
    SELECT float_retained_for_tomorrow INTO v_opening_float
    FROM public.daily_reconciliations
    WHERE company_id = p_company_id
      AND (branch_id = p_branch_id OR (branch_id IS NULL AND p_branch_id IS NULL))
      AND reconciliation_date < p_date
    ORDER BY reconciliation_date DESC, shift_number DESC
    LIMIT 1;

    v_opening_float := COALESCE(v_opening_float, 0);

    -- 2) تجميع مبيعات اليوم حسب طريقة الدفع موحدة بالعملة الأساسية (fn_to_base_amount)
    SELECT
        COALESCE(SUM(CASE WHEN type = 'sale' THEN public.fn_to_base_amount(currency_code, total_amount, exchange_rate) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'sale' AND payment_method = 'cash' THEN public.fn_to_base_amount(currency_code, total_amount, exchange_rate) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'sale' AND payment_method IN ('card', 'network', 'mada') THEN public.fn_to_base_amount(currency_code, total_amount, exchange_rate) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'sale' AND payment_method IN ('transfer', 'bank') THEN public.fn_to_base_amount(currency_code, total_amount, exchange_rate) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'sale' AND payment_method = 'credit' THEN public.fn_to_base_amount(currency_code, total_amount, exchange_rate) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type IN ('sale_return', 'return_sale') AND payment_method = 'cash' THEN public.fn_to_base_amount(currency_code, total_amount, exchange_rate) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type IN ('sale_return', 'return_sale') AND payment_method IN ('card', 'network', 'mada') THEN public.fn_to_base_amount(currency_code, total_amount, exchange_rate) ELSE 0 END), 0)
    INTO
        v_total_sales,
        v_cash_sales,
        v_card_sales,
        v_transfer_sales,
        v_credit_sales,
        v_returns_cash,
        v_returns_card
    FROM public.invoices
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND issue_date = p_date
      AND status NOT IN ('draft', 'cancelled', 'void')
      AND deleted_at IS NULL;

    -- 3) تجميع المقبوضات والمدفوعات من السندات موحدة بالعملة الأساسية
    SELECT
        COALESCE(SUM(CASE WHEN type = 'receipt' AND payment_method = 'cash' THEN public.fn_to_base_amount(currency_code, amount, exchange_rate) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type IN ('payment', 'disbursement') AND payment_method = 'cash' THEN public.fn_to_base_amount(currency_code, amount, exchange_rate) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'receipt' AND payment_method IN ('card', 'network', 'mada') THEN public.fn_to_base_amount(currency_code, amount, exchange_rate) ELSE 0 END), 0)
    INTO
        v_cash_receipts,
        v_cash_disbursements,
        v_card_receipts
    FROM public.payments
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND payment_date = p_date
      AND status NOT IN ('draft', 'void', 'cancelled')
      AND deleted_at IS NULL;

    -- 4) تجميع المصروفات النثرية موحدة بالعملة الأساسية
    SELECT COALESCE(SUM(public.fn_to_base_amount(currency_code, amount, exchange_rate)), 0)
    INTO v_petty_expenses
    FROM public.expenses
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND expense_date = p_date
      AND payment_method = 'cash'
      AND status NOT IN ('draft', 'void', 'cancelled')
      AND deleted_at IS NULL;

    -- 5) حساب الكاش والشبكة المتوقعة بالدرج
    v_expected_cash := v_opening_float + v_cash_sales - v_returns_cash + v_cash_receipts - v_cash_disbursements - v_petty_expenses;
    v_expected_card := v_card_sales - v_returns_card + v_card_receipts;

    -- 6) تجميع مبيعات كل موظف
    SELECT jsonb_agg(emp_row) INTO v_employee_breakdown
    FROM (
        SELECT
            inv.created_by AS user_id,
            COALESCE(prof.full_name, 'موظف') AS employee_name,
            COUNT(inv.id) AS invoice_count,
            COALESCE(SUM(public.fn_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate)), 0) AS total_sales,
            COALESCE(SUM(CASE WHEN inv.payment_method = 'cash' THEN public.fn_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0) AS cash_sales,
            COALESCE(SUM(CASE WHEN inv.payment_method IN ('card', 'network', 'mada') THEN public.fn_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0) AS card_sales,
            COALESCE(SUM(CASE WHEN inv.payment_method IN ('transfer', 'bank') THEN public.fn_to_base_amount(inv.currency_code, inv.total_amount, inv.exchange_rate) ELSE 0 END), 0) AS transfer_sales
        FROM public.invoices inv
        LEFT JOIN public.user_profiles prof ON prof.id = inv.created_by
        WHERE inv.company_id = p_company_id
          AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
          AND inv.issue_date = p_date
          AND inv.type = 'sale'
          AND inv.status NOT IN ('draft', 'cancelled', 'void')
          AND inv.deleted_at IS NULL
        GROUP BY inv.created_by, prof.full_name
        ORDER BY total_sales DESC
    ) emp_row;

    v_employee_breakdown := COALESCE(v_employee_breakdown, '[]'::jsonb);

    -- 7) جلب الإقفال الحالي إن وجد
    SELECT row_to_json(r)::jsonb INTO v_existing_reconciliation
    FROM public.daily_reconciliations r
    WHERE company_id = p_company_id
      AND (branch_id = p_branch_id OR (branch_id IS NULL AND p_branch_id IS NULL))
      AND reconciliation_date = p_date
    ORDER BY shift_number DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'date', p_date,
        'opening_float', ROUND(v_opening_float, 2),
        'total_sales', ROUND(v_total_sales, 2),
        'cash_sales', ROUND(v_cash_sales, 2),
        'card_sales', ROUND(v_card_sales, 2),
        'transfer_sales', ROUND(v_transfer_sales, 2),
        'credit_sales', ROUND(v_credit_sales, 2),
        'returns_cash', ROUND(v_returns_cash, 2),
        'returns_card', ROUND(v_returns_card, 2),
        'cash_receipts', ROUND(v_cash_receipts, 2),
        'cash_disbursements', ROUND(v_cash_disbursements, 2),
        'petty_expenses_cash', ROUND(v_petty_expenses, 2),
        'expected_cash_in_drawer', ROUND(v_expected_cash, 2),
        'expected_card_terminal', ROUND(v_expected_card, 2),
        'employee_breakdown', v_employee_breakdown,
        'existing_reconciliation', v_existing_reconciliation,
        'is_already_closed', (v_existing_reconciliation IS NOT NULL AND (v_existing_reconciliation->>'status') = 'closed')
    );
END;
$function$;

COMMENT ON FUNCTION public.get_stock_valuation(uuid) IS 'Fixed 2026-11-14: fixed 42803 nested aggregation bug, added total_products/total_stock aliases';
COMMENT ON FUNCTION public.get_cash_liquidity(uuid) IS 'Fixed 2026-11-14: included bank accounts (103%) and Mizan cash/bank accounts (MZ-13%, MZ-14%)';
COMMENT ON FUNCTION public.get_daily_drawer_summary(uuid,date,uuid) IS 'Fixed 2026-11-14: use fn_to_base_amount for currency conversion in drawer calculations';
