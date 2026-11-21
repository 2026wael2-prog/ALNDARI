-- ============================================================================
-- Wave 17: Harden Branch Authorization Helper Functions Against Anon Execution
-- ----------------------------------------------------------------------------
-- Fixes security advisor lint: anon_security_definer_function_executable
-- Revokes public/anon execution on SECURITY DEFINER branch authorization helpers,
-- restricting execution strictly to authenticated users and service_role.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_assert_branch_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_assert_branch_access(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_auth_all_branch_companies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_auth_all_branch_companies() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_auth_allowed_branches() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_auth_allowed_branches() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_has_all_branch_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_has_all_branch_access(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_is_branch_scoped_row_allowed(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_is_branch_scoped_row_allowed(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_resolve_authorized_branch(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_authorized_branch(uuid, uuid) TO authenticated;
