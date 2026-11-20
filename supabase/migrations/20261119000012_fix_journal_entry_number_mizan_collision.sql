-- ============================================================================
-- Migration: 20261119000012_fix_journal_entry_number_mizan_collision
-- Purpose  : Isolate ERP auto-generated journal entry numbers (< 10,000,000)
--            from external Al-Mizan sync (10,000,000..19,999,999) and manual
--            opening/adjustment ranges (>= 20,000,000), while preserving the
--            strict unique constraint on explicit entry_number values so
--            external sync scripts never double-post duplicate journal entries.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_journal_entry_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.entry_number IS NULL THEN
    -- Serialize automatic entry_number allocation per company inside the transaction
    PERFORM pg_advisory_xact_lock(hashtext('journal_entry_number:' || NEW.company_id::text));

    -- Allocate ERP-generated entry numbers in the primary < 10,000,000 range
    -- so they never jump above 20,000,000+ opening entries or collide with
    -- external Al-Mizan (10,000,000..19,999,999) explicit entry numbers.
    SELECT COALESCE(MAX(entry_number), 0) + 1
    INTO NEW.entry_number
    FROM public.journal_entries
    WHERE company_id = NEW.company_id
      AND entry_number < 10000000;
  END IF;

  -- When an explicit NEW.entry_number is provided (e.g. external Al-Mizan sync),
  -- we intentionally keep it unchanged so journal_entries_unique_number_per_company
  -- enforces strict idempotency and prevents double-posting.
  RETURN NEW;
END;
$function$;
