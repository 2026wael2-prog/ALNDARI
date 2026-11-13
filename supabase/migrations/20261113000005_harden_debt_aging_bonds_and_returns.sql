-- ==============================================================================
-- Migration: 20261113000005_harden_debt_aging_bonds_and_returns.sql
-- Description:
--   Harden public.report_debt_aging(p_company_id) to comply with AGENTS.md Rule 3:
--   1. Exclude cash invoices (payment_method = 'cash') and paid/draft/void/internal (-INT) invoices.
--   2. Convert all foreign currency amounts to base currency via fn_to_base_amount.
--   3. Deduct unpaid credit sales returns (sale_return / return_sale where payment_method <> 'cash')
--      and unallocated customer receipt bonds (payments.type = 'receipt' for customer/both parties)
--      from aging buckets oldest-first (days_90_plus -> days_61_90 -> days_31_60 -> days_0_30).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.report_debt_aging(p_company_id uuid)
RETURNS TABLE(
  customer_name text,
  total numeric,
  days_0_30 numeric,
  days_31_60 numeric,
  days_61_90 numeric,
  days_90_plus numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  RETURN QUERY
  WITH gross_aging AS (
    SELECT
      i.party_id,
      COALESCE(pr.name, 'غير محدد') AS c_name,
      COALESCE(SUM(
        public.fn_to_base_amount(
          i.currency_code,
          GREATEST(0, i.total_amount - COALESCE(i.paid_amount, 0)),
          i.exchange_rate
        )
      ) FILTER (WHERE COALESCE(i.due_date, i.issue_date) >= CURRENT_DATE - INTERVAL '30 days'), 0) AS b0_30,
      COALESCE(SUM(
        public.fn_to_base_amount(
          i.currency_code,
          GREATEST(0, i.total_amount - COALESCE(i.paid_amount, 0)),
          i.exchange_rate
        )
      ) FILTER (WHERE COALESCE(i.due_date, i.issue_date) BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '31 days'), 0) AS b31_60,
      COALESCE(SUM(
        public.fn_to_base_amount(
          i.currency_code,
          GREATEST(0, i.total_amount - COALESCE(i.paid_amount, 0)),
          i.exchange_rate
        )
      ) FILTER (WHERE COALESCE(i.due_date, i.issue_date) BETWEEN CURRENT_DATE - INTERVAL '90 days' AND CURRENT_DATE - INTERVAL '61 days'), 0) AS b61_90,
      COALESCE(SUM(
        public.fn_to_base_amount(
          i.currency_code,
          GREATEST(0, i.total_amount - COALESCE(i.paid_amount, 0)),
          i.exchange_rate
        )
      ) FILTER (WHERE COALESCE(i.due_date, i.issue_date) < CURRENT_DATE - INTERVAL '90 days'), 0) AS b90_plus
    FROM public.invoices i
    LEFT JOIN public.parties pr ON pr.id = i.party_id AND pr.deleted_at IS NULL
    WHERE i.company_id = p_company_id
      AND i.type = 'sale'
      AND COALESCE(i.payment_method, 'credit') <> 'cash'
      AND i.status IN ('posted', 'confirmed', 'partially_paid')
      AND i.deleted_at IS NULL
      AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
      AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0.01
    GROUP BY i.party_id, COALESCE(pr.name, 'غير محدد')
  ),
  return_credits AS (
    SELECT
      i.party_id,
      COALESCE(SUM(
        public.fn_to_base_amount(
          i.currency_code,
          GREATEST(0, i.total_amount - COALESCE(i.paid_amount, 0)),
          i.exchange_rate
        )
      ), 0) AS credit_amt
    FROM public.invoices i
    WHERE i.company_id = p_company_id
      AND i.type IN ('sale_return', 'return_sale')
      AND COALESCE(i.payment_method, 'credit') <> 'cash'
      AND i.status IN ('posted', 'confirmed', 'partially_paid')
      AND i.deleted_at IS NULL
      AND COALESCE(i.invoice_number, '') NOT ILIKE '%-INT'
      AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0.01
    GROUP BY i.party_id
  ),
  alloc_by_payment AS (
    SELECT pa.payment_id, COALESCE(SUM(pa.amount), 0) AS alloc_amt
    FROM public.payment_allocations pa
    WHERE pa.company_id = p_company_id
    GROUP BY pa.payment_id
  ),
  bond_credits AS (
    SELECT
      p.party_id,
      COALESCE(SUM(
        public.fn_to_base_amount(
          p.currency_code,
          GREATEST(0, p.amount - COALESCE(a.alloc_amt, 0)),
          p.exchange_rate
        )
      ), 0) AS credit_amt
    FROM public.payments p
    JOIN public.parties pt ON pt.id = p.party_id AND pt.deleted_at IS NULL AND pt.type IN ('customer', 'both')
    LEFT JOIN alloc_by_payment a ON a.payment_id = p.id
    WHERE p.company_id = p_company_id
      AND p.type = 'receipt'
      AND p.status = 'posted'
      AND p.deleted_at IS NULL
      AND (p.amount - COALESCE(a.alloc_amt, 0)) > 0.01
    GROUP BY p.party_id
  ),
  net_calc AS (
    SELECT
      g.c_name,
      g.b0_30,
      g.b31_60,
      g.b61_90,
      g.b90_plus,
      COALESCE(rc.credit_amt, 0) + COALESCE(bc.credit_amt, 0) AS total_credits
    FROM gross_aging g
    LEFT JOIN return_credits rc ON rc.party_id = g.party_id
    LEFT JOIN bond_credits bc ON bc.party_id = g.party_id
  ),
  applied AS (
    -- Deduct credits oldest-first: b90_plus -> b61_90 -> b31_60 -> b0_30
    SELECT
      c_name,
      GREATEST(0, b90_plus - total_credits) AS net_90_plus,
      GREATEST(0, b61_90 - GREATEST(0, total_credits - b90_plus)) AS net_61_90,
      GREATEST(0, b31_60 - GREATEST(0, total_credits - b90_plus - b61_90)) AS net_31_60,
      GREATEST(0, b0_30  - GREATEST(0, total_credits - b90_plus - b61_90 - b31_60)) AS net_0_30
    FROM net_calc
  )
  SELECT
    a.c_name AS customer_name,
    ROUND(a.net_0_30 + a.net_31_60 + a.net_61_90 + a.net_90_plus, 2) AS total,
    ROUND(a.net_0_30, 2) AS days_0_30,
    ROUND(a.net_31_60, 2) AS days_31_60,
    ROUND(a.net_61_90, 2) AS days_61_90,
    ROUND(a.net_90_plus, 2) AS days_90_plus
  FROM applied a
  WHERE (a.net_0_30 + a.net_31_60 + a.net_61_90 + a.net_90_plus) > 0.01
  ORDER BY total DESC, customer_name ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.report_debt_aging(uuid) TO authenticated;

