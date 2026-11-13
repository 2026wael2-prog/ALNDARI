-- ============================================================
-- Migration: 20261113000009_re_enable_all_triggers.sql
-- Purpose  : Re-enable ALL 56 disabled triggers (tgenabled='D')
-- Gate     : disabled_triggers → 0
-- Date     : 2026-11-13
-- ============================================================

-- invoice_items triggers
ALTER TABLE public.invoice_items ENABLE TRIGGER ensure_invoice_item_total;
ALTER TABLE public.invoice_items ENABLE TRIGGER set_updated_at;
ALTER TABLE public.invoice_items ENABLE TRIGGER trg_guard_posted_invoice_items_immutability;
ALTER TABLE public.invoice_items ENABLE TRIGGER trg_update_invoice_totals;

-- invoices triggers
ALTER TABLE public.invoices ENABLE TRIGGER auto_invoice_number;
ALTER TABLE public.invoices ENABLE TRIGGER on_invoice_change;
ALTER TABLE public.invoices ENABLE TRIGGER set_updated_at_invoices;
ALTER TABLE public.invoices ENABLE TRIGGER trg_auto_fiscal_year_invoice;
ALTER TABLE public.invoices ENABLE TRIGGER trg_auto_mark_invoice_paid;
ALTER TABLE public.invoices ENABLE TRIGGER trg_auto_post_invoice_journal;
ALTER TABLE public.invoices ENABLE TRIGGER trg_auto_sync_party_role_from_invoice;
ALTER TABLE public.invoices ENABLE TRIGGER trg_block_general_customer_credit;
ALTER TABLE public.invoices ENABLE TRIGGER trg_guard_invoice_day_lock;
ALTER TABLE public.invoices ENABLE TRIGGER trg_guard_posted_invoice_immutability;
ALTER TABLE public.invoices ENABLE TRIGGER trg_guard_text_control_chars;
ALTER TABLE public.invoices ENABLE TRIGGER trg_guard_text_lengths;
ALTER TABLE public.invoices ENABLE TRIGGER trg_invoice_soft_delete_propagation_trigger;
ALTER TABLE public.invoices ENABLE TRIGGER trg_prevent_credit_sale_general_customer;
ALTER TABLE public.invoices ENABLE TRIGGER trg_prevent_invoice_closed_fiscal;
ALTER TABLE public.invoices ENABLE TRIGGER trg_set_updated_by;
ALTER TABLE public.invoices ENABLE TRIGGER trg_sync_party_stats_invoice;
ALTER TABLE public.invoices ENABLE TRIGGER trg_validate_invoice_business_rules;

-- journal_entries triggers
ALTER TABLE public.journal_entries ENABLE TRIGGER trg_journal_entries_immutability;

-- journal_entry_lines triggers
ALTER TABLE public.journal_entry_lines ENABLE TRIGGER ensure_journal_balance;
ALTER TABLE public.journal_entry_lines ENABLE TRIGGER set_updated_at;
ALTER TABLE public.journal_entry_lines ENABLE TRIGGER trg_check_account_postable;
ALTER TABLE public.journal_entry_lines ENABLE TRIGGER trg_check_account_tenant;
ALTER TABLE public.journal_entry_lines ENABLE TRIGGER trg_check_entry_tenant;
ALTER TABLE public.journal_entry_lines ENABLE TRIGGER trg_check_journal_entry_line_tenant;
ALTER TABLE public.journal_entry_lines ENABLE TRIGGER trg_check_party_tenant;
ALTER TABLE public.journal_entry_lines ENABLE TRIGGER trg_journal_entry_lines_immutability;
ALTER TABLE public.journal_entry_lines ENABLE TRIGGER trg_prevent_company_id_change;

-- parties triggers
ALTER TABLE public.parties ENABLE TRIGGER on_party_change;
ALTER TABLE public.parties ENABLE TRIGGER set_updated_at_parties;
ALTER TABLE public.parties ENABLE TRIGGER trg_audit_parties;
ALTER TABLE public.parties ENABLE TRIGGER trg_auto_set_party_branch;
ALTER TABLE public.parties ENABLE TRIGGER trg_guard_text_control_chars;
ALTER TABLE public.parties ENABLE TRIGGER trg_guard_text_lengths;
ALTER TABLE public.parties ENABLE TRIGGER trg_prevent_company_id_change;
ALTER TABLE public.parties ENABLE TRIGGER trg_set_supplier_portal_token;
ALTER TABLE public.parties ENABLE TRIGGER trg_set_updated_by;
ALTER TABLE public.parties ENABLE TRIGGER trg_update_party_search_vector;

-- payments triggers
ALTER TABLE public.payments ENABLE TRIGGER auto_payment_number;
ALTER TABLE public.payments ENABLE TRIGGER on_payment_change;
ALTER TABLE public.payments ENABLE TRIGGER set_updated_at_payments;
ALTER TABLE public.payments ENABLE TRIGGER trg_audit_payments;
ALTER TABLE public.payments ENABLE TRIGGER trg_auto_post_payment_journal;
ALTER TABLE public.payments ENABLE TRIGGER trg_check_payment_account_tenant;
ALTER TABLE public.payments ENABLE TRIGGER trg_check_payment_party_tenant;
ALTER TABLE public.payments ENABLE TRIGGER trg_complete_promises_on_payment;
ALTER TABLE public.payments ENABLE TRIGGER trg_guard_currency_inversion_payments;
ALTER TABLE public.payments ENABLE TRIGGER trg_guard_payment_day_lock;
ALTER TABLE public.payments ENABLE TRIGGER trg_guard_text_control_chars;
ALTER TABLE public.payments ENABLE TRIGGER trg_guard_text_lengths;
ALTER TABLE public.payments ENABLE TRIGGER trg_prevent_company_id_change;
ALTER TABLE public.payments ENABLE TRIGGER trg_set_updated_by;

-- Verify: should return 0
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_trigger pt
  JOIN pg_class pc ON pc.oid = pt.tgrelid
  JOIN pg_namespace pn ON pn.oid = pc.relnamespace
  WHERE pn.nspname = 'public' AND pt.tgenabled = 'D';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'GATE_FAIL: % disabled triggers remain after re-enable migration', v_count;
  END IF;
  RAISE NOTICE 'GATE_PASS: disabled_triggers = 0';
END $$;

