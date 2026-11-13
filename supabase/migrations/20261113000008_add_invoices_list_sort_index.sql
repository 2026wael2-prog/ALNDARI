-- =============================================================================
-- Migration: 20261113000008_add_invoices_list_sort_index.sql
-- Purpose: Eliminate full/partial sort of 70k+ invoices rows on sales/purchase
--          list queries ordered by (issue_date DESC, created_at DESC, id DESC).
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_invoices_company_type_list_sort
  ON public.invoices (company_id, type, issue_date DESC, created_at DESC NULLS LAST, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_company_branch_type_list_sort
  ON public.invoices (company_id, branch_id, type, issue_date DESC, created_at DESC NULLS LAST, id DESC)
  WHERE deleted_at IS NULL;

