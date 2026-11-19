-- Phase 3.1 Batch 2c (Staging P1): Fix sales_chart date_from in get_dashboard_bundle (avoid 1900-01-01 46k-day series)
-- Target: Staging (adrgddwoksskzoryshgv)

CREATE OR REPLACE FUNCTION public.get_dashboard_bundle(
  p_company_id uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT CURRENT_DATE,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_from date := COALESCE(p_date_from, '1900-01-01'::date);
  v_chart_from date := CASE WHEN p_date_from IS NULL OR p_date_from <= '1900-01-01'::date THEN NULL ELSE p_date_from END;
  v_to date := COALESCE(p_date_to, CURRENT_DATE);
  v_summary jsonb;
  v_pl jsonb;
  v_debt jsonb;
  v_low_stock jsonb;
  v_recent_invoices jsonb;
  v_recent_expenses jsonb;
  v_sales_chart jsonb;
  v_top_data jsonb;
  v_top_selling jsonb;
  v_categories jsonb;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  v_summary := public.get_dashboard_summary(p_company_id, p_branch_id, p_date_from, v_to);

  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_pl
  FROM public.report_profit_loss(p_company_id, v_from, v_to, p_branch_id) r;

  SELECT COALESCE(jsonb_agg(d), '[]'::jsonb) INTO v_debt
  FROM public.get_debt_followup_dashboard(p_company_id, 7, 30, 3, p_branch_id, 50) d;

  SELECT COALESCE(jsonb_agg(l), '[]'::jsonb) INTO v_low_stock
  FROM public.get_low_stock_products(p_company_id, p_branch_id) l;

  SELECT COALESCE(jsonb_agg(ri), '[]'::jsonb) INTO v_recent_invoices
  FROM (
    SELECT i.id, i.invoice_number, i.type, i.issue_date, i.created_at,
           i.total_amount, i.currency_code, i.party_id,
           CASE WHEN pt.id IS NOT NULL THEN jsonb_build_object('name', pt.name) ELSE NULL END AS parties
    FROM public.invoices i
    LEFT JOIN public.parties pt ON pt.id = i.party_id
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.type IN ('sale', 'purchase', 'sale_return', 'purchase_return')
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    ORDER BY i.issue_date DESC, i.created_at DESC
    LIMIT 10
  ) ri;

  SELECT COALESCE(jsonb_agg(re), '[]'::jsonb) INTO v_recent_expenses
  FROM (
    SELECT e.id, e.amount, e.category_id, e.expense_date, e.description,
           CASE WHEN ec.id IS NOT NULL THEN jsonb_build_object('name', ec.name) ELSE NULL END AS expense_categories
    FROM public.expenses e
    LEFT JOIN public.expense_categories ec ON ec.company_id = e.company_id AND ec.id = e.category_id
    WHERE e.company_id = p_company_id
      AND e.deleted_at IS NULL
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
    ORDER BY e.expense_date DESC, e.created_at DESC
    LIMIT 10
  ) re;

  SELECT COALESCE(jsonb_agg(sc), '[]'::jsonb) INTO v_sales_chart
  FROM public.get_sales_chart_data(p_company_id, p_branch_id, v_chart_from, v_to) sc;

  SELECT to_jsonb(tp) INTO v_top_data
  FROM public.get_top_products_and_customers(p_company_id, p_branch_id, 10, p_date_from, v_to, 'revenue') tp
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(ts), '[]'::jsonb) INTO v_top_selling
  FROM public.get_top_selling_products(p_company_id, 10, 365, p_branch_id) ts;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name)), '[]'::jsonb) INTO v_categories
  FROM public.product_categories pc
  WHERE pc.company_id = p_company_id;

  RETURN jsonb_build_object(
    'summary', COALESCE(v_summary, '{}'::jsonb),
    'profit_loss', v_pl,
    'debt_followup', v_debt,
    'low_stock', v_low_stock,
    'recent_invoices', v_recent_invoices,
    'recent_expenses', v_recent_expenses,
    'sales_chart', v_sales_chart,
    'top_data', COALESCE(v_top_data, jsonb_build_object('top_products', '[]'::jsonb, 'top_customers', '[]'::jsonb)),
    'top_selling', v_top_selling,
    'product_categories', v_categories
  );
END;
$function$;
