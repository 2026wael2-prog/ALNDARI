-- ============================================================================
-- Migration: 20261122000001_wave19_deduplicate_mizan_auto_post_journals.sql
-- Wave 19: Remediate duplicate Mizan-imported journal entries for app-created
--          credit sales invoices (e.g. INV-B1-20261121-0001 / 0002 / 0004)
--          where an external sync re-imported the auto-posted journal entry
--          with reference_type = 'other' and reference_id IS NULL, doubling
--          the customer balance.
-- ============================================================================

DO $$
DECLARE
  v_dup_ids uuid[];
BEGIN
  SELECT ARRAY_AGG(je.id)
  INTO v_dup_ids
  FROM public.journal_entries je
  WHERE je.reference_type = 'other'
    AND je.reference_id IS NULL
    AND je.deleted_at IS NULL
    AND je.description LIKE 'INV-% - ترحيل تلقائي - فاتورة مبيعات INV-%'
    AND EXISTS (
      SELECT 1
      FROM public.journal_entries orig
      WHERE orig.company_id = je.company_id
        AND orig.reference_type = 'sales_invoice'
        AND orig.deleted_at IS NULL
        AND je.description LIKE '%' || orig.description
    );

  IF v_dup_ids IS NOT NULL AND array_length(v_dup_ids, 1) > 0 THEN
    PERFORM set_config('app.reposting_doc', 'true', true);
    PERFORM set_config('app.rpc_authorized', 'true', true);

    UPDATE public.journal_entry_lines
    SET deleted_at = now(), updated_at = now()
    WHERE journal_entry_id = ANY(v_dup_ids)
      AND deleted_at IS NULL;

    UPDATE public.journal_entries
    SET deleted_at = now(), updated_at = now()
    WHERE id = ANY(v_dup_ids)
      AND deleted_at IS NULL;
  END IF;
END $$;
