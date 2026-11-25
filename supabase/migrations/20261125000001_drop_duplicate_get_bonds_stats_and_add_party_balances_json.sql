-- ============================================================
-- Migration: Lock duplicate 2-arg get_bonds_stats overload +
--            Add single-call get_party_balances_by_company_json RPC
-- Date: 2026-11-25
-- ============================================================

-- 1) Revoke EXECUTE on the redundant 2-argument overload of get_bonds_stats
--    so PostgREST never exposes an ambiguous HTTP 300 signature to clients.
REVOKE EXECUTE ON FUNCTION public.get_bonds_stats(uuid, uuid) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_bonds_stats(uuid, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_bonds_stats(uuid, uuid, text) TO authenticated, service_role;

-- 2) Single-call JSONB wrapper for get_party_balances_by_company to bypass
--    PostgREST's 1,000-row cap and avoid 3x sequential GL scans on 1,800+ parties.
CREATE OR REPLACE FUNCTION public.get_party_balances_by_company_json(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'party_id', r.party_id,
        'balance',  r.balance,
        'type',     r.type
      )
      ORDER BY r.party_id
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.get_party_balances_by_company(p_company_id) r;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_party_balances_by_company_json(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_party_balances_by_company_json(uuid) TO authenticated, service_role;
