-- ============================================================
-- Migration: 20261113000011_grant_rls_helper_functions.sql
-- Purpose  : Grant EXECUTE on RLS helper functions required by
--            table RLS policies (stock_transfer_requests, chat_channels, etc.)
-- ============================================================

GRANT EXECUTE ON FUNCTION public.fn_can_access_chat_channel(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_is_admin_or_manager() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_is_admin_or_manager(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_can_manage_debts() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_can_manage_debts(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.report_debts(uuid) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
