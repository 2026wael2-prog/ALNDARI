-- ============================================================================
-- Wave 45: Scientific Customer Credit Risk & AR Aging Analytics Engine
-- ============================================================================
-- Creates:
-- 1. Partial composite indexes on invoices, payments, and customer_activities
--    for fast sub-250ms per-currency credit analytics.
-- 2. RPC: get_customer_credit_analytics_v1(p_company_id, p_branch_id, p_currency, p_period_days)
--    - Strict currency isolation (SAR vs YER — never mixed).
--    - FIFO reverse-bucket AR Aging reconciled 100% with party_balances_by_currency.
--    - Standard KPIs: DSO, CEI %, IFRS 9 Simplified ECL Provision, Over-Limit
--      Exposure, Top-5 Concentration %, and per-customer credit metrics + promises.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_invoices_credit_aging
  ON public.invoices (company_id, currency_code, party_id, issue_date DESC, created_at DESC)
  WHERE deleted_at IS NULL AND status <> 'void' AND type = 'sale';

CREATE INDEX IF NOT EXISTS idx_payments_credit_last_receipt
  ON public.payments (company_id, party_id, currency_code, payment_date DESC)
  WHERE deleted_at IS NULL AND status <> 'void' AND type = 'receipt';

CREATE INDEX IF NOT EXISTS idx_customer_activities_credit_promise
  ON public.customer_activities (company_id, customer_id, status, scheduled_at)
  WHERE status IN ('pending', 'overdue');

CREATE OR REPLACE FUNCTION public.get_customer_credit_analytics_v1(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_currency text DEFAULT 'SAR'::text,
  p_period_days integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency text := UPPER(COALESCE(NULLIF(TRIM(p_currency), ''), 'SAR'));
  v_other_currency text := CASE WHEN UPPER(COALESCE(NULLIF(TRIM(p_currency), ''), 'SAR')) = 'SAR' THEN 'YER' ELSE 'SAR' END;
  v_period_days integer := GREATEST(7, LEAST(COALESCE(p_period_days, 90), 730));
  v_period_start date := CURRENT_DATE - GREATEST(7, LEAST(COALESCE(p_period_days, 90), 730));
  v_year_start date := CURRENT_DATE - 365;
  v_result jsonb;
BEGIN
  -- Tenant isolation guard for authenticated callers
  IF auth.uid() IS NOT NULL
     AND NOT public.is_super_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.user_company_roles ucr
       WHERE ucr.user_id = auth.uid()
         AND ucr.company_id = p_company_id
     ) THEN
    RAISE EXCEPTION 'Unauthorized access to company credit analytics' USING ERRCODE = '42501';
  END IF;

  WITH base_parties AS (
    SELECT
      p.id AS party_id,
      p.name,
      p.phone,
      COALESCE(p.status, 'active') AS status,
      p.type AS party_type,
      pc.name AS category_name,
      COALESCE(p.credit_limit, 0)::numeric AS credit_limit,
      COALESCE(NULLIF(p.payment_terms_days, 0), 30)::integer AS payment_terms_days,
      COALESCE(p.customer_since, p.created_at::date) AS customer_since
    FROM public.parties p
    LEFT JOIN public.party_categories pc ON pc.id = p.category_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND p.type IN ('customer', 'both')
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id OR p.branch_id IS NULL)
  ),
  curr_balances AS (
    SELECT
      pb.party_id,
      SUM(CASE WHEN UPPER(COALESCE(pb.currency_code, 'SAR')) = v_currency THEN COALESCE(pb.balance, 0) ELSE 0 END)::numeric AS balance,
      SUM(CASE WHEN UPPER(COALESCE(pb.currency_code, 'SAR')) = v_other_currency THEN COALESCE(pb.balance, 0) ELSE 0 END)::numeric AS other_balance
    FROM public.party_balances_by_currency pb
    WHERE pb.company_id = p_company_id
    GROUP BY pb.party_id
  ),
  party_ledger AS (
    SELECT
      bp.*,
      ROUND(COALESCE(cb.balance, 0), 2) AS balance,
      ROUND(COALESCE(cb.other_balance, 0), 2) AS other_balance
    FROM base_parties bp
    LEFT JOIN curr_balances cb ON cb.party_id = bp.party_id
  ),
  -- Non-void sale invoices in the selected currency for FIFO aging & 12-month velocity
  curr_invoices AS (
    SELECT
      i.id,
      i.party_id,
      i.type,
      i.payment_method,
      i.issue_date,
      COALESCE(
        i.due_date,
        (i.issue_date + make_interval(days => pl.payment_terms_days))::date
      ) AS effective_due_date,
      COALESCE(NULLIF(i.total_document_amount, 0), i.total_amount, 0)::numeric AS doc_amount,
      i.created_at,
      pl.balance AS party_balance
    FROM public.invoices i
    JOIN party_ledger pl ON pl.party_id = i.party_id
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.status NOT IN ('void', 'draft')
      AND i.type IN ('sale', 'return_sale')
      AND UPPER(COALESCE(i.currency_code, 'SAR')) = v_currency
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id OR i.branch_id IS NULL)
  ),
  -- FIFO reverse allocation of each debtor's true ledger balance across newest sale invoices
  fifo_ranked AS (
    SELECT
      ci.party_id,
      ci.issue_date,
      ci.effective_due_date,
      ci.doc_amount,
      ci.party_balance,
      SUM(ci.doc_amount) OVER (
        PARTITION BY ci.party_id
        ORDER BY ci.issue_date DESC, ci.created_at DESC, ci.id DESC
      ) AS cum_doc
    FROM curr_invoices ci
    WHERE ci.type = 'sale'
      AND ci.party_balance > 0.01
      AND ci.doc_amount > 0
  ),
  fifo_slices AS (
    SELECT
      fr.party_id,
      fr.issue_date,
      GREATEST(0, (CURRENT_DATE - fr.effective_due_date))::integer AS days_overdue,
      GREATEST(0, LEAST(fr.doc_amount, fr.party_balance - (fr.cum_doc - fr.doc_amount)))::numeric AS slice_amt
    FROM fifo_ranked fr
    WHERE (fr.cum_doc - fr.doc_amount) < fr.party_balance
  ),
  aging_by_party AS (
    SELECT
      fs.party_id,
      ROUND(SUM(CASE WHEN fs.days_overdue = 0 THEN fs.slice_amt ELSE 0 END), 2) AS b_current,
      ROUND(SUM(CASE WHEN fs.days_overdue BETWEEN 1 AND 30 THEN fs.slice_amt ELSE 0 END), 2) AS b_1_30,
      ROUND(SUM(CASE WHEN fs.days_overdue BETWEEN 31 AND 60 THEN fs.slice_amt ELSE 0 END), 2) AS b_31_60,
      ROUND(SUM(CASE WHEN fs.days_overdue BETWEEN 61 AND 90 THEN fs.slice_amt ELSE 0 END), 2) AS b_61_90,
      ROUND(SUM(CASE WHEN fs.days_overdue > 90 THEN fs.slice_amt ELSE 0 END), 2) AS b_90_plus,
      ROUND(SUM(fs.slice_amt), 2) AS allocated_total,
      MIN(fs.issue_date) AS oldest_unpaid_date,
      MAX(fs.days_overdue) AS max_days_overdue
    FROM fifo_slices fs
    WHERE fs.slice_amt > 0.005
    GROUP BY fs.party_id
  ),
  sales_stats_by_party AS (
    SELECT
      ci.party_id,
      ROUND(SUM(CASE WHEN ci.type = 'sale' AND ci.issue_date >= v_year_start THEN ci.doc_amount ELSE 0 END), 2) AS sales_12m,
      ROUND(SUM(CASE WHEN ci.type = 'sale' AND ci.payment_method = 'credit' AND ci.issue_date >= v_year_start THEN ci.doc_amount ELSE 0 END), 2) AS credit_sales_12m,
      ROUND(SUM(CASE WHEN ci.type = 'return_sale' AND ci.issue_date >= v_year_start THEN ci.doc_amount ELSE 0 END), 2) AS returns_12m,
      COUNT(*) FILTER (WHERE ci.type = 'sale' AND ci.issue_date >= v_year_start)::integer AS invoices_count_12m,
      MAX(ci.issue_date) FILTER (WHERE ci.type = 'sale') AS last_invoice_date,
      ROUND(SUM(CASE WHEN ci.type = 'sale' AND ci.issue_date >= v_period_start THEN ci.doc_amount ELSE 0 END), 2) AS period_total_sales,
      ROUND(SUM(CASE WHEN ci.type = 'sale' AND ci.payment_method = 'credit' AND ci.issue_date >= v_period_start THEN ci.doc_amount ELSE 0 END), 2) AS period_credit_sales
    FROM curr_invoices ci
    GROUP BY ci.party_id
  ),
  receipts_by_party AS (
    SELECT
      pm.party_id,
      ROUND(SUM(CASE WHEN pm.payment_date >= v_year_start THEN COALESCE(pm.amount, 0) ELSE 0 END), 2) AS collections_12m,
      ROUND(SUM(CASE WHEN pm.payment_date >= v_period_start THEN COALESCE(pm.amount, 0) ELSE 0 END), 2) AS period_collections,
      MAX(pm.payment_date) AS last_payment_date,
      (ARRAY_AGG(COALESCE(pm.amount, 0) ORDER BY pm.payment_date DESC, pm.created_at DESC))[1]::numeric AS last_payment_amount
    FROM public.payments pm
    JOIN party_ledger pl ON pl.party_id = pm.party_id
    WHERE pm.company_id = p_company_id
      AND pm.deleted_at IS NULL
      AND pm.status NOT IN ('void', 'draft')
      AND pm.type = 'receipt'
      AND UPPER(COALESCE(pm.currency_code, 'SAR')) = v_currency
      AND (p_branch_id IS NULL OR pm.branch_id = p_branch_id OR pm.branch_id IS NULL)
    GROUP BY pm.party_id
  ),
  promises_by_party AS (
    SELECT DISTINCT ON (ca.customer_id)
      ca.customer_id AS party_id,
      ca.scheduled_at::date AS next_promise_date,
      ca.subject AS next_promise_subject,
      ca.status AS next_promise_status
    FROM public.customer_activities ca
    WHERE ca.company_id = p_company_id
      AND ca.status IN ('pending', 'overdue')
    ORDER BY ca.customer_id, ca.scheduled_at ASC NULLS LAST
  ),
  enriched_customers AS (
    SELECT
      pl.party_id,
      pl.name,
      pl.phone,
      pl.status,
      pl.party_type,
      pl.category_name,
      pl.credit_limit,
      pl.payment_terms_days,
      pl.customer_since,
      pl.balance,
      pl.other_balance AS other_currency_balance,
      v_other_currency AS other_currency_code,
      -- Reconciled aging: any residual balance above matched sale invoices (e.g., opening balance) lands in 90+
      COALESCE(ag.b_current, 0)::numeric AS aging_current,
      COALESCE(ag.b_1_30, 0)::numeric AS aging_1_30,
      COALESCE(ag.b_31_60, 0)::numeric AS aging_31_60,
      COALESCE(ag.b_61_90, 0)::numeric AS aging_61_90,
      ROUND(
        COALESCE(ag.b_90_plus, 0) +
        CASE
          WHEN pl.balance > 0.01 THEN GREATEST(0, pl.balance - COALESCE(ag.allocated_total, 0))
          ELSE 0
        END,
        2
      ) AS aging_90_plus,
      ag.oldest_unpaid_date,
      CASE
        WHEN pl.balance <= 0.01 THEN 0
        WHEN (pl.balance - COALESCE(ag.allocated_total, 0)) > 0.01 THEN GREATEST(COALESCE(ag.max_days_overdue, 0), 91)
        ELSE COALESCE(ag.max_days_overdue, 0)
      END::integer AS max_days_overdue,
      COALESCE(ss.sales_12m, 0)::numeric AS sales_12m,
      COALESCE(ss.credit_sales_12m, 0)::numeric AS credit_sales_12m,
      COALESCE(ss.returns_12m, 0)::numeric AS returns_12m,
      COALESCE(ss.invoices_count_12m, 0)::integer AS invoices_count_12m,
      ss.last_invoice_date,
      COALESCE(ss.period_total_sales, 0)::numeric AS period_total_sales,
      COALESCE(ss.period_credit_sales, 0)::numeric AS period_credit_sales,
      COALESCE(rp.collections_12m, 0)::numeric AS collections_12m,
      COALESCE(rp.period_collections, 0)::numeric AS period_collections,
      rp.last_payment_date,
      COALESCE(rp.last_payment_amount, 0)::numeric AS last_payment_amount,
      CASE
        WHEN rp.last_payment_date IS NOT NULL THEN GREATEST(0, (CURRENT_DATE - rp.last_payment_date)::integer)
        ELSE NULL
      END AS days_since_last_payment,
      pr.next_promise_date,
      pr.next_promise_subject,
      pr.next_promise_status
    FROM party_ledger pl
    LEFT JOIN aging_by_party ag ON ag.party_id = pl.party_id
    LEFT JOIN sales_stats_by_party ss ON ss.party_id = pl.party_id
    LEFT JOIN receipts_by_party rp ON rp.party_id = pl.party_id
    LEFT JOIN promises_by_party pr ON pr.party_id = pl.party_id
  ),
  top5_debt AS (
    SELECT COALESCE(SUM(ec.balance), 0)::numeric AS top5_sum
    FROM (
      SELECT balance
      FROM enriched_customers
      WHERE balance > 0.01
      ORDER BY balance DESC
      LIMIT 5
    ) ec
  ),
  portfolio_agg AS (
    SELECT
      COUNT(*)::integer AS total_customers,
      COUNT(*) FILTER (WHERE balance > 0.01)::integer AS debtors_count,
      COUNT(*) FILTER (WHERE balance < -0.01)::integer AS creditors_count,
      COUNT(*) FILTER (WHERE ABS(balance) <= 0.01)::integer AS settled_count,
      ROUND(COALESCE(SUM(CASE WHEN balance > 0.01 THEN balance ELSE 0 END), 0), 2) AS total_receivable,
      ROUND(COALESCE(SUM(CASE WHEN balance < -0.01 THEN ABS(balance) ELSE 0 END), 0), 2) AS total_credit_balance,
      ROUND(COALESCE(SUM(aging_current), 0), 2) AS sum_current,
      ROUND(COALESCE(SUM(aging_1_30), 0), 2) AS sum_1_30,
      ROUND(COALESCE(SUM(aging_31_60), 0), 2) AS sum_31_60,
      ROUND(COALESCE(SUM(aging_61_90), 0), 2) AS sum_61_90,
      ROUND(COALESCE(SUM(aging_90_plus), 0), 2) AS sum_90_plus,
      COUNT(*) FILTER (WHERE aging_current > 0.01)::integer AS count_current,
      COUNT(*) FILTER (WHERE aging_1_30 > 0.01)::integer AS count_1_30,
      COUNT(*) FILTER (WHERE aging_31_60 > 0.01)::integer AS count_31_60,
      COUNT(*) FILTER (WHERE aging_61_90 > 0.01)::integer AS count_61_90,
      COUNT(*) FILTER (WHERE aging_90_plus > 0.01)::integer AS count_90_plus,
      ROUND(COALESCE(SUM(period_total_sales), 0), 2) AS period_total_sales,
      ROUND(COALESCE(SUM(period_credit_sales), 0), 2) AS period_credit_sales,
      ROUND(COALESCE(SUM(period_collections), 0), 2) AS period_collections,
      COUNT(*) FILTER (WHERE credit_limit > 0 AND balance > credit_limit)::integer AS over_limit_count,
      ROUND(COALESCE(SUM(CASE WHEN credit_limit > 0 AND balance > credit_limit THEN (balance - credit_limit) ELSE 0 END), 0), 2) AS over_limit_amount
    FROM enriched_customers
  )
  SELECT jsonb_build_object(
    'currency', v_currency,
    'other_currency', v_other_currency,
    'period_days', v_period_days,
    'generated_at', NOW(),
    'summary', (
      SELECT jsonb_build_object(
        'total_customers', pa.total_customers,
        'debtors_count', pa.debtors_count,
        'creditors_count', pa.creditors_count,
        'settled_count', pa.settled_count,
        'total_receivable', pa.total_receivable,
        'total_credit_balance', pa.total_credit_balance,
        'total_overdue', ROUND(pa.sum_1_30 + pa.sum_31_60 + pa.sum_61_90 + pa.sum_90_plus, 2),
        'overdue_percent', CASE
          WHEN pa.total_receivable > 0.01
            THEN ROUND(((pa.sum_1_30 + pa.sum_31_60 + pa.sum_61_90 + pa.sum_90_plus) / pa.total_receivable) * 100, 1)
          ELSE 0
        END,
        'period_total_sales', pa.period_total_sales,
        'period_credit_sales', pa.period_credit_sales,
        'period_collections', pa.period_collections,
        'dso_days', CASE
          WHEN pa.period_credit_sales > 0.01
            THEN ROUND((pa.total_receivable / pa.period_credit_sales) * v_period_days, 1)
          WHEN pa.period_total_sales > 0.01
            THEN ROUND((pa.total_receivable / pa.period_total_sales) * v_period_days, 1)
          ELSE 0
        END,
        'cei_percent', CASE
          WHEN (pa.period_collections + (pa.sum_1_30 + pa.sum_31_60 + pa.sum_61_90 + pa.sum_90_plus)) > 0.01
            THEN ROUND(
              LEAST(
                100,
                (pa.period_collections / (pa.period_collections + (pa.sum_1_30 + pa.sum_31_60 + pa.sum_61_90 + pa.sum_90_plus))) * 100
              ),
              1
            )
          ELSE 100
        END,
        'over_limit_count', pa.over_limit_count,
        'over_limit_amount', pa.over_limit_amount,
        'concentration_top5_percent', CASE
          WHEN pa.total_receivable > 0.01
            THEN ROUND((t5.top5_sum / pa.total_receivable) * 100, 1)
          ELSE 0
        END,
        'ecl_provision', ROUND(
          pa.sum_current * 0.005 +
          pa.sum_1_30 * 0.02 +
          pa.sum_31_60 * 0.08 +
          pa.sum_61_90 * 0.25 +
          pa.sum_90_plus * 0.60,
          2
        ),
        'aging', jsonb_build_object(
          'current', pa.sum_current,
          'd1_30', pa.sum_1_30,
          'd31_60', pa.sum_31_60,
          'd61_90', pa.sum_61_90,
          'd90_plus', pa.sum_90_plus,
          'count_current', pa.count_current,
          'count_1_30', pa.count_1_30,
          'count_31_60', pa.count_31_60,
          'count_61_90', pa.count_61_90,
          'count_90_plus', pa.count_90_plus
        )
      )
      FROM portfolio_agg pa
      CROSS JOIN top5_debt t5
    ),
    'customers', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'party_id', ec.party_id,
          'name', ec.name,
          'phone', ec.phone,
          'status', ec.status,
          'party_type', ec.party_type,
          'category_name', ec.category_name,
          'credit_limit', ec.credit_limit,
          'payment_terms_days', ec.payment_terms_days,
          'customer_since', ec.customer_since,
          'balance', ec.balance,
          'other_currency_balance', ec.other_currency_balance,
          'other_currency_code', ec.other_currency_code,
          'aging_current', ec.aging_current,
          'aging_1_30', ec.aging_1_30,
          'aging_31_60', ec.aging_31_60,
          'aging_61_90', ec.aging_61_90,
          'aging_90_plus', ec.aging_90_plus,
          'overdue_amount', ROUND(ec.aging_1_30 + ec.aging_31_60 + ec.aging_61_90 + ec.aging_90_plus, 2),
          'oldest_unpaid_date', ec.oldest_unpaid_date,
          'max_days_overdue', ec.max_days_overdue,
          'sales_12m', ec.sales_12m,
          'credit_sales_12m', ec.credit_sales_12m,
          'returns_12m', ec.returns_12m,
          'invoices_count_12m', ec.invoices_count_12m,
          'last_invoice_date', ec.last_invoice_date,
          'collections_12m', ec.collections_12m,
          'last_payment_date', ec.last_payment_date,
          'last_payment_amount', ec.last_payment_amount,
          'days_since_last_payment', ec.days_since_last_payment,
          'next_promise_date', ec.next_promise_date,
          'next_promise_subject', ec.next_promise_subject,
          'next_promise_status', ec.next_promise_status
        )
        ORDER BY
          CASE WHEN ec.balance > 0.01 THEN 0 ELSE 1 END ASC,
          (ec.aging_90_plus * 3 + ec.aging_61_90 * 2 + ec.aging_31_60 * 1.5 + ec.balance) DESC,
          ec.sales_12m DESC,
          ec.name ASC
      )
      FROM enriched_customers ec
      WHERE ABS(ec.balance) > 0.01
         OR ec.sales_12m > 0.01
         OR ec.credit_limit > 0
         OR ec.next_promise_date IS NOT NULL
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_credit_analytics_v1(uuid, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_credit_analytics_v1(uuid, uuid, text, integer) TO authenticated;
