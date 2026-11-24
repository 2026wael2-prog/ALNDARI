-- Wave 35: Phase 3 Approved Data Cleanup (Items 3.1, 3.2, 3.3) — Wael Branch
-- Owner-approved after Dry-Run on 2026-11-24.
-- 100% Soft-Delete & Double-Entry Only (zero posted ledger mutations, full pre-change JSON backup).

CREATE TABLE IF NOT EXISTS public.phase3_cleanup_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_tag text NOT NULL,
  item_code text NOT NULL,
  entity_table text NOT NULL,
  entity_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on backup table (owner/admin read-only)
ALTER TABLE public.phase3_cleanup_backups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'phase3_cleanup_backups' AND policyname = 'phase3_cleanup_backups_owner_read'
  ) THEN
    CREATE POLICY phase3_cleanup_backups_owner_read ON public.phase3_cleanup_backups
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.user_company_roles ucr
          WHERE ucr.user_id = auth.uid() AND ucr.role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;
