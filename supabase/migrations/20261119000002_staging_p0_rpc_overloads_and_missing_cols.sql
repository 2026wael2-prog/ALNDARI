-- Phase 2 Batch 3 (Staging P0): Missing Production-parity columns & ambiguous RPC overload cleanup
-- Target: Staging (adrgddwoksskzoryshgv)

-- 1. Add missing columns required by get_debt_followup_dashboard and Sales UI
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS is_collectible boolean NOT NULL DEFAULT true;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS subtotal_document_amount numeric,
  ADD COLUMN IF NOT EXISTS total_document_amount numeric;

-- 2. Eliminate ambiguous PostgREST overload on search_inventory_paginated (HTTP 300)
-- Keep canonical 8-arg signature (p_branch_id DEFAULT NULL, p_is_core DEFAULT NULL)
DROP FUNCTION IF EXISTS public.search_inventory_paginated(uuid, text, integer, integer, text, text, uuid);

-- 3. Eliminate ambiguous PostgREST overloads on commit_sales_invoice_v2
-- Keep canonical 12-arg signature (trailing 8 args all have DEFAULT values)
DROP FUNCTION IF EXISTS public.commit_sales_invoice_v2(uuid, date, date, jsonb, text, text, text, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.commit_sales_invoice_v2(uuid, date, date, jsonb, text, text, text, numeric, text, uuid, uuid);
