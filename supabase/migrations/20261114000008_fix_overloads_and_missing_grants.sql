-- ==============================================================================
-- Migration: 20261114000008_fix_overloads_and_missing_grants.sql
-- Description:
-- 1. Add overloaded public.report_debts(p_company_id uuid, p_branch_id uuid)
--    so frontend callers passing p_branch_id receive 200 OK instead of PostgREST 404.
-- 2. Grant EXECUTE on public.generate_invoice_number to authenticated role so users
--    can generate sequential invoice numbers instead of falling back to sequence warning.
-- ==============================================================================

-- 1. report_debts with p_branch_id overload
CREATE OR REPLACE FUNCTION public.report_debts(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_receivables numeric := 0;
  v_payables    numeric := 0;
  v_debts       json;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  WITH active_debts AS (
    SELECT
      p.id,
      p.name,
      p.type,
      pb.balance AS remaining_amount
    FROM public.parties p
    JOIN public.party_balances pb
      ON pb.party_id = p.id AND pb.company_id = p_company_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id OR p.branch_id IS NULL)
      AND ABS(pb.balance) > 0.01
    ORDER BY pb.balance DESC
  )
  SELECT
    COALESCE(SUM(remaining_amount)      FILTER (WHERE remaining_amount > 0 AND type IN ('customer','both')), 0),
    COALESCE(SUM(ABS(remaining_amount)) FILTER (WHERE remaining_amount < 0 AND type IN ('supplier','both')), 0),
    COALESCE(json_agg(row_to_json(ad)), '[]'::json)
  INTO v_receivables, v_payables, v_debts
  FROM active_debts ad;

  RETURN json_build_object(
    'summary', json_build_object(
      'receivables', ROUND(v_receivables, 2),
      'payables',    ROUND(v_payables,    2)
    ),
    'debts', v_debts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_debts(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_debts(uuid, uuid) TO anon;

-- 2. Grant EXECUTE on generate_invoice_number to authenticated users
GRANT EXECUTE ON FUNCTION public.generate_invoice_number(uuid, text, uuid) TO authenticated;
