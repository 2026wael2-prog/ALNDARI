-- =============================================================================
-- Wave 31: Fix get_account_ledger multi-year carry-forward opening duplication
--          and YER foreign_balance calculation for SAR-only FX adjustment lines.
-- - Excludes synthetic annual carry-forward snapshots
--   (reference_type = 'opening' AND description LIKE '%ترحيل إقفال%')
--   whose underlying 2020-2025 movements are already present in journal_entry_lines,
--   while preserving true first-year opening balances (e.g. Ghimdan branch).
-- - Ensures SAR-only FX revaluation lines (currency_code IS NULL) do not distort
--   foreign_balance for YER accounts (e.g. MZ-1211209).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_account_ledger(
  p_company_id uuid,
  p_account_id uuid,
  p_from date DEFAULT NULL::date,
  p_to date DEFAULT NULL::date,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_account_type text;
  v_currency_code text;
  v_base_currency text;
  v_is_debit_nature boolean;
  v_opening_balance numeric := 0;
  v_opening_foreign numeric := 0;
  v_foreign_balance numeric := 0;
  v_entries json;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  SELECT a.type, a.currency_code, c.base_currency
  INTO v_account_type, v_currency_code, v_base_currency
  FROM public.accounts a
  JOIN public.companies c ON c.id = a.company_id
  WHERE a.id = p_account_id AND a.company_id = p_company_id;

  IF v_account_type IS NULL THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;

  v_is_debit_nature := v_account_type IN ('asset', 'expense');

  IF p_from IS NOT NULL THEN
    WITH RECURSIVE account_tree AS (
      SELECT id FROM public.accounts WHERE id = p_account_id
      UNION ALL
      SELECT a.id FROM public.accounts a INNER JOIN account_tree at ON a.parent_id = at.id
    )
    SELECT
      COALESCE(SUM(
        CASE WHEN v_is_debit_nature
          THEN (COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0))
          ELSE (COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0))
        END
      ), 0),
      COALESCE(SUM(
        CASE
          WHEN v_currency_code = v_base_currency OR v_currency_code IS NULL THEN
            CASE WHEN v_is_debit_nature
              THEN (COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0))
              ELSE (COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0))
            END
          WHEN jel.currency_code IS NULL OR UPPER(TRIM(jel.currency_code)) <> UPPER(TRIM(v_currency_code)) THEN
            0
          WHEN COALESCE(jel.foreign_amount, 0) > 0 THEN
            CASE WHEN jel.debit_amount >= jel.credit_amount THEN jel.foreign_amount ELSE -jel.foreign_amount END
          ELSE
            (COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) *
            (CASE WHEN COALESCE(jel.exchange_rate, 0) > 1 THEN jel.exchange_rate
                  WHEN COALESCE(jel.exchange_rate, 0) > 0 THEN ROUND(1.0 / jel.exchange_rate, 6)
                  ELSE 410 END)
        END
      ), 0)
    INTO v_opening_balance, v_opening_foreign
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id IN (SELECT id FROM account_tree)
      AND je.company_id = p_company_id
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
      AND jel.deleted_at IS NULL
      AND NOT (je.reference_type = 'opening' AND COALESCE(je.description, '') LIKE '%ترحيل إقفال%')
      AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id)
      AND je.entry_date < p_from;
  END IF;

  WITH RECURSIVE account_tree AS (
    SELECT id FROM public.accounts WHERE id = p_account_id
    UNION ALL
    SELECT a.id FROM public.accounts a INNER JOIN account_tree at ON a.parent_id = at.id
  )
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.entry_date, t.entry_number), '[]'::json)
  INTO v_entries
  FROM (
    SELECT
      je.id AS journal_id,
      je.entry_date,
      je.entry_number,
      je.branch_id,
      je.reference_type,
      je.reference_id,
      COALESCE(jel.description, je.description, '') AS description,
      COALESCE(jel.debit_amount, 0) AS debit_amount,
      COALESCE(jel.credit_amount, 0) AS credit_amount,
      COALESCE(jel.currency_code, 'SAR') AS currency_code,
      COALESCE(jel.exchange_rate, 1) AS exchange_rate,
      COALESCE(jel.foreign_amount, 0) AS foreign_amount,
      jel.party_id,
      p.name AS party_name,
      v_opening_balance + SUM(
        CASE WHEN v_is_debit_nature
          THEN (COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0))
          ELSE (COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0))
        END
      ) OVER (ORDER BY je.entry_date, je.entry_number, jel.id ROWS UNBOUNDED PRECEDING) AS balance,
      v_opening_foreign + SUM(
        CASE
          WHEN v_currency_code = v_base_currency OR v_currency_code IS NULL THEN
            CASE WHEN v_is_debit_nature
              THEN (COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0))
              ELSE (COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0))
            END
          WHEN jel.currency_code IS NULL OR UPPER(TRIM(jel.currency_code)) <> UPPER(TRIM(v_currency_code)) THEN
            0
          WHEN COALESCE(jel.foreign_amount, 0) > 0 THEN
            CASE WHEN jel.debit_amount >= jel.credit_amount THEN jel.foreign_amount ELSE -jel.foreign_amount END
          ELSE
            (COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) *
            (CASE WHEN COALESCE(jel.exchange_rate, 0) > 1 THEN jel.exchange_rate
                  WHEN COALESCE(jel.exchange_rate, 0) > 0 THEN ROUND(1.0 / jel.exchange_rate, 6)
                  ELSE 410 END)
        END
      ) OVER (ORDER BY je.entry_date, je.entry_number, jel.id ROWS UNBOUNDED PRECEDING) AS foreign_balance
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    LEFT JOIN public.parties p ON p.id = jel.party_id
    WHERE jel.account_id IN (SELECT id FROM account_tree)
      AND je.company_id = p_company_id
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
      AND jel.deleted_at IS NULL
      AND NOT (je.reference_type = 'opening' AND COALESCE(je.description, '') LIKE '%ترحيل إقفال%')
      AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id)
      AND (p_from IS NULL OR je.entry_date >= p_from)
      AND (p_to IS NULL OR je.entry_date <= p_to)
  ) t;

  WITH RECURSIVE account_tree AS (
    SELECT id FROM public.accounts WHERE id = p_account_id
    UNION ALL
    SELECT a.id FROM public.accounts a INNER JOIN account_tree at ON a.parent_id = at.id
  )
  SELECT COALESCE(SUM(
    CASE
      WHEN v_currency_code = v_base_currency OR v_currency_code IS NULL THEN
        CASE WHEN v_is_debit_nature
          THEN (COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0))
          ELSE (COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0))
        END
      WHEN jel.currency_code IS NULL OR UPPER(TRIM(jel.currency_code)) <> UPPER(TRIM(v_currency_code)) THEN
        0
      WHEN COALESCE(jel.foreign_amount, 0) > 0 THEN
        CASE WHEN jel.debit_amount >= jel.credit_amount THEN jel.foreign_amount ELSE -jel.foreign_amount END
      ELSE
        (COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) *
        (CASE WHEN COALESCE(jel.exchange_rate, 0) > 1 THEN jel.exchange_rate
              WHEN COALESCE(jel.exchange_rate, 0) > 0 THEN ROUND(1.0 / jel.exchange_rate, 6)
              ELSE 410 END)
    END
  ), 0)
  INTO v_foreign_balance
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.account_id IN (SELECT id FROM account_tree)
    AND je.company_id = p_company_id
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND NOT (je.reference_type = 'opening' AND COALESCE(je.description, '') LIKE '%ترحيل إقفال%')
    AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id)
    AND (p_to IS NULL OR je.entry_date <= p_to);

  RETURN json_build_object(
    'openingBalance', v_opening_balance,
    'openingForeignBalance', v_opening_foreign,
    'foreignBalance', v_foreign_balance,
    'currencyCode', v_currency_code,
    'baseCurrency', v_base_currency,
    'entries', v_entries,
    'accountType', v_account_type
  );
END;
$function$;
