-- P2 Performance Upgrade: Targeted Covering & Trigram Indexes + Fast RPCs
-- Applied on Production (dagfjncoullstrhbjssr)

CREATE INDEX IF NOT EXISTS idx_products_alternative_numbers_trgm
  ON public.products USING gin (alternative_numbers gin_trgm_ops)
  WHERE deleted_at IS NULL AND alternative_numbers IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_brand_trgm
  ON public.products USING gin (brand gin_trgm_ops)
  WHERE deleted_at IS NULL AND brand IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parties_company_type_name
  ON public.parties (company_id, type, name, id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_parties_company_branch_type_name
  ON public.parties (company_id, branch_id, type, name, id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_je_company_reftype_posted_date
  ON public.journal_entries (company_id, reference_type, entry_date)
  INCLUDE (id, branch_id, reference_id)
  WHERE deleted_at IS NULL AND status = 'posted';

CREATE INDEX IF NOT EXISTS idx_jel_comp_acct_party_cur_cov
  ON public.journal_entry_lines (company_id, account_id, party_id, currency_code)
  INCLUDE (journal_entry_id, debit_amount, credit_amount, foreign_amount)
  WHERE deleted_at IS NULL AND party_id IS NOT NULL AND currency_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_sales_stats_cov
  ON public.invoices (company_id, type, status, issue_date)
  INCLUDE (branch_id, payment_method, currency_code, exchange_rate, total_amount, paid_amount, discount_amount)
  WHERE deleted_at IS NULL AND type IN ('sale', 'sale_return', 'return_sale');

CREATE OR REPLACE FUNCTION public.get_party_currencies_by_company_json(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  WITH target_accounts AS (
    SELECT a.id
    FROM public.accounts a
    WHERE a.company_id = p_company_id
      AND a.deleted_at IS NULL
      AND (
        a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%'
        OR a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%'
      )
  ),
  combined AS (
    SELECT
      jel.party_id,
      jel.currency_code::text AS cur_code,
      SUM(
        CASE
          WHEN jel.currency_code IS NOT NULL AND UPPER(TRIM(BOTH FROM jel.currency_code)) <> 'SAR'
            THEN COALESCE(NULLIF(jel.foreign_amount, 0), ABS(jel.debit_amount - jel.credit_amount))
                 * CASE WHEN jel.debit_amount >= jel.credit_amount THEN 1 ELSE -1 END
          ELSE jel.debit_amount - jel.credit_amount
        END
      )::numeric(14,2) AS cur_balance,
      COUNT(*)::integer AS tx_count,
      MAX(je.entry_date) AS last_date
    FROM public.journal_entry_lines jel
    JOIN target_accounts ta ON ta.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.company_id = p_company_id
      AND je.company_id = p_company_id
      AND jel.deleted_at IS NULL
      AND jel.party_id IS NOT NULL
      AND jel.currency_code IS NOT NULL
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
    GROUP BY jel.party_id, jel.currency_code

    UNION ALL

    SELECT
      ob.party_id,
      ob.currency_code::text AS cur_code,
      SUM(
        CASE WHEN ob.direction = 'debit' THEN ob.amount ELSE -ob.amount END
      )::numeric(14,2) AS cur_balance,
      0::integer AS tx_count,
      NULL::date AS last_date
    FROM public.party_opening_balances ob
    WHERE ob.company_id = p_company_id
    GROUP BY ob.party_id, ob.currency_code
  ),
  aggregated AS (
    SELECT
      c.party_id,
      c.cur_code AS currency_code,
      SUM(c.cur_balance)::numeric AS balance,
      SUM(c.tx_count)::integer AS transaction_count,
      MAX(c.last_date) AS last_activity_date
    FROM combined c
    GROUP BY c.party_id, c.cur_code
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'party_id', a.party_id,
      'currency_code', a.currency_code,
      'balance', a.balance,
      'transaction_count', a.transaction_count,
      'last_activity_date', a.last_activity_date
    )
  ), '[]'::jsonb)
  INTO v_result
  FROM aggregated a;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_party_currencies_by_company_json(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_party_currencies_by_company_json(uuid) TO authenticated;
