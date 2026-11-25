-- ============================================================
-- Migration: Live Supabase Security & Performance Hardening
--   1) Revoke anon/PUBLIC execute on 9 SECURITY DEFINER functions
--   2) Pin search_path on normalize_arabic, test_func, test_dyn &
--      revoke execute on leftover test_func / test_dyn stubs
--   3) Restrict internal cron_* maintenance functions to service_role
--   4) Fix auth_rls_initplan on public.phase3_cleanup_backups
--   5) Add covering indexes for 7 unindexed FKs on recurring_rent_*
-- Date: 2026-11-25
-- ============================================================

-- 1) Revoke EXECUTE from anon & PUBLIC on all 9 exposed SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.fn_get_product_categories_with_stats(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_product_categories_with_stats(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_sync_invoice_return_status(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_sync_invoice_return_status(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_trg_auto_categorize_product() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_trg_auto_categorize_product() TO service_role;

REVOKE EXECUTE ON FUNCTION public.trg_sync_original_invoice_on_return() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.trg_sync_original_invoice_on_return() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_expense_stats(uuid, uuid, date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_expense_stats(uuid, uuid, date, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_owner_reconciliation_report(uuid, uuid, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_owner_reconciliation_report(uuid, uuid, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_unified_expense_stats(uuid, uuid, date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_unified_expense_stats(uuid, uuid, date, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_unified_expenses(uuid, uuid, date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_unified_expenses(uuid, uuid, date, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_due_monthly_rents(date, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.post_due_monthly_rents(date, boolean) TO authenticated, service_role;

-- 2) Lock search_path on normalize_arabic, test_func, test_dyn & revoke public/authenticated access to test stubs
ALTER FUNCTION public.normalize_arabic(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.test_func() SET search_path = public, pg_temp;
ALTER FUNCTION public.test_dyn() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.test_func() FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.test_dyn() FROM anon, PUBLIC, authenticated;

-- 3) Restrict internal cron_* maintenance functions to service_role only
REVOKE EXECUTE ON FUNCTION public.cron_aggregate_csp_reports() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.cron_aggregate_csp_reports() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cron_auto_block_honeypot_attackers() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.cron_auto_block_honeypot_attackers() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cron_break_overdue_promises() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.cron_break_overdue_promises() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cron_cleanup_rate_limits() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.cron_cleanup_rate_limits() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cron_dispatch_debt_reminders() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.cron_dispatch_debt_reminders() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cron_enqueue_debt_reminders() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.cron_enqueue_debt_reminders() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cron_purge_csp_reports() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.cron_purge_csp_reports() TO service_role;

-- 4) Fix auth_rls_initplan on public.phase3_cleanup_backups (cache auth.uid() via subselect)
ALTER POLICY phase3_cleanup_backups_owner_read
  ON public.phase3_cleanup_backups
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

-- 5) Add covering indexes for the 7 unindexed foreign keys on recurring_rent_*
CREATE INDEX IF NOT EXISTS idx_recurring_rent_runs_branch_id
  ON public.recurring_rent_runs (branch_id);
CREATE INDEX IF NOT EXISTS idx_recurring_rent_runs_journal_entry_id
  ON public.recurring_rent_runs (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_recurring_rent_schedules_branch_id
  ON public.recurring_rent_schedules (branch_id);
CREATE INDEX IF NOT EXISTS idx_recurring_rent_schedules_created_by
  ON public.recurring_rent_schedules (created_by);
CREATE INDEX IF NOT EXISTS idx_recurring_rent_schedules_credit_account_id
  ON public.recurring_rent_schedules (credit_account_id);
CREATE INDEX IF NOT EXISTS idx_recurring_rent_schedules_debit_account_id
  ON public.recurring_rent_schedules (debit_account_id);
CREATE INDEX IF NOT EXISTS idx_recurring_rent_schedules_party_id
  ON public.recurring_rent_schedules (party_id);
