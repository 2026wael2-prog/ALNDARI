-- Wave 22: Isolate legacy MZ-* Chart of Accounts entries to branches that actually use them
-- Branches without MZ-* journal postings (e.g., Ghamdan, Mohammed) will only display the clean
-- Standard Chart of Accounts in COA, General Ledger, Journal Entry forms, and Treasury pickers.

CREATE OR REPLACE FUNCTION public.fn_branch_uses_legacy_mz_accounts(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_branch_id uuid;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  v_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  -- Consolidated company view (all branches): allow all accounts
  IF v_branch_id IS NULL THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.journal_entries je
    JOIN public.journal_entry_lines l ON l.journal_entry_id = je.id AND l.deleted_at IS NULL
    JOIN public.accounts a ON a.id = l.account_id
    WHERE je.company_id = p_company_id
      AND je.branch_id = v_branch_id
      AND je.deleted_at IS NULL
      AND a.code LIKE 'MZ-%'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_branch_uses_legacy_mz_accounts(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_branch_uses_legacy_mz_accounts(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_branch_uses_legacy_mz_accounts(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_branch_uses_legacy_mz_accounts(uuid, uuid) TO service_role;
