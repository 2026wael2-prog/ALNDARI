-- Wave 22: Strict Branch Isolation for Cashboxes & Exchange Companies in Chart of Accounts
CREATE OR REPLACE FUNCTION public.fn_get_other_branch_treasury_account_ids(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(account_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_branch_id uuid;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  v_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  IF v_branch_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT t.account_id
  FROM (
    SELECT c.account_id
    FROM public.cashboxes c
    WHERE c.company_id = p_company_id
      AND c.account_id IS NOT NULL
      AND c.branch_id IS NOT NULL
      AND c.branch_id <> v_branch_id
    UNION
    SELECT e.account_id
    FROM public.exchange_companies e
    WHERE e.company_id = p_company_id
      AND e.account_id IS NOT NULL
      AND e.branch_id IS NOT NULL
      AND e.branch_id <> v_branch_id
  ) t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.cashboxes c2
    WHERE c2.company_id = p_company_id
      AND c2.account_id = t.account_id
      AND c2.branch_id = v_branch_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.exchange_companies e2
    WHERE e2.company_id = p_company_id
      AND e2.account_id = t.account_id
      AND e2.branch_id = v_branch_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_get_other_branch_treasury_account_ids(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_get_other_branch_treasury_account_ids(uuid, uuid) TO authenticated;
