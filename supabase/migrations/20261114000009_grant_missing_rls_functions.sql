-- ==============================================================================
-- Migration: 20261114000009_grant_missing_rls_functions.sql
-- Description:
-- Grant EXECUTE on get_user_supplier_id and is_valid_branch to authenticated & anon.
-- These functions are evaluated in RLS policies (e.g. prc_rfqs, prc_quotations,
-- and branch-isolated tables). Missing EXECUTE caused PostgREST to return 403 Forbidden.
-- ==============================================================================

GRANT EXECUTE ON FUNCTION public.get_user_supplier_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_supplier_id(uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.is_valid_branch(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_branch(uuid, uuid) TO anon;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
