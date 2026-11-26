-- =============================================================================
-- Migration: 20261126173000_wave42_db_indexes_dedup_precision_and_search_optimization.sql
-- Wave 42 (Audit Phase 4 — P2 Database Performance, Precision & Index Hygiene):
--   [DB-10] Add missing high-traffic partial composite indexes on
--           `journal_entry_lines(company_id, branch_id, account_id)` and
--           `payments(company_id, reference_type, reference_id)`.
--   [DB-11] Drop 10 verified exact-duplicate / redundant non-unique indexes
--           to reduce write amplification & WAL overhead on core tables.
--   [DB-12] Widen `journal_entry_lines.exchange_rate` from numeric(10,6) to
--           numeric(19,6) and `foreign_amount` to numeric(19,4) to prevent
--           numeric overflow (22003) at high exchange rates (>= 10,000).
--   [DB-13] Optimize `search_invoices_advanced` to compute correlated
--           `item_count` and fallback `total_document_amount` ONLY on the
--           post-pagination slice instead of across all matching rows.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. [DB-10] Missing High-Traffic Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_jel_company_branch_account_active
  ON public.journal_entry_lines (company_id, branch_id, account_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_company_ref_active
  ON public.payments (company_id, reference_type, reference_id)
  WHERE deleted_at IS NULL AND reference_id IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 2. [DB-11] Drop Verified Exact-Duplicate / Redundant Non-Unique Indexes
--    (Preserves ALL primary keys, unique constraints, and canonical indexes)
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_fk_invoices_company_account;
DROP INDEX IF EXISTS public.idx_fk_invoices_company_reference;
DROP INDEX IF EXISTS public.idx_fk_payments_counterparty_account_id;
DROP INDEX IF EXISTS public.idx_fk_payments_currency_code;
DROP INDEX IF EXISTS public.idx_jel_account_id;
DROP INDEX IF EXISTS public.idx_jel_journal_entry_id;
DROP INDEX IF EXISTS public.idx_jel_deleted_at;
DROP INDEX IF EXISTS public.idx_fk_invoice_items_company_product;
DROP INDEX IF EXISTS public.idx_fk_parties_category_id;
DROP INDEX IF EXISTS public.idx_fk_products_category_id;


-- -----------------------------------------------------------------------------
-- 3. [DB-12] Widen `journal_entry_lines` FX precision safely (idempotent)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_rate_prec integer;
  v_famt_prec integer;
BEGIN
  SELECT numeric_precision INTO v_rate_prec
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'journal_entry_lines'
    AND column_name = 'exchange_rate';

  IF v_rate_prec IS NOT NULL AND v_rate_prec < 19 THEN
    ALTER TABLE public.journal_entry_lines
      ALTER COLUMN exchange_rate TYPE numeric(19,6);
  END IF;

  SELECT numeric_precision INTO v_famt_prec
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'journal_entry_lines'
    AND column_name = 'foreign_amount';

  IF v_famt_prec IS NOT NULL AND v_famt_prec < 19 THEN
    ALTER TABLE public.journal_entry_lines
      ALTER COLUMN foreign_amount TYPE numeric(19,4);
  END IF;
END;
$$;


-- -----------------------------------------------------------------------------
-- 4. [DB-13] Optimize `search_invoices_advanced` (post-pagination aggregates)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_invoices_advanced(
  p_company_id UUID,
  p_type TEXT DEFAULT NULL,
  p_query TEXT DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 500,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  company_id UUID,
  invoice_number TEXT,
  type TEXT,
  status TEXT,
  payment_method TEXT,
  total_amount NUMERIC,
  total_document_amount NUMERIC,
  currency_code TEXT,
  exchange_rate NUMERIC,
  issue_date DATE,
  party_id UUID,
  party_name TEXT,
  party_phone TEXT,
  notes TEXT,
  reference_invoice_id UUID,
  item_count BIGINT,
  matched_items JSONB,
  total_matching_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_query TEXT;
  v_norm_query TEXT;
  v_tokens TEXT[];
  v_first_token TEXT;
BEGIN
  PERFORM public.verify_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  v_clean_query := NULLIF(TRIM(p_query), '');
  IF v_clean_query IS NOT NULL THEN
    v_norm_query := public.normalize_arabic(v_clean_query);
    v_tokens := regexp_split_to_array(v_norm_query, E'\\s+');
    v_first_token := v_tokens[1];
  END IF;

  RETURN QUERY
  WITH filtered_invoices AS (
    SELECT
      i.id,
      i.company_id,
      i.invoice_number,
      i.type,
      i.status,
      i.payment_method,
      i.total_amount,
      i.total_document_amount AS raw_doc_total,
      i.currency_code,
      i.exchange_rate,
      i.issue_date,
      i.party_id,
      prt.name AS party_name,
      prt.phone AS party_phone,
      i.notes,
      i.reference_invoice_id,
      COUNT(*) OVER()::BIGINT AS total_matching_count
    FROM public.invoices i
    LEFT JOIN public.parties prt ON prt.id = i.party_id
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.status <> 'void'
      AND (
        p_type IS NULL
        OR (p_type = 'purchase' AND i.type IN ('purchase', 'purchase_return'))
        OR i.type = ANY(string_to_array(p_type, ','))
      )
      AND (p_status IS NULL OR i.status = p_status)
      AND (p_payment_method IS NULL OR i.payment_method = p_payment_method)
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
      AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
      AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
      AND (
        v_norm_query IS NULL
        OR (v_clean_query IS NOT NULL AND i.invoice_number ILIKE '%' || v_clean_query || '%')
        OR public.normalize_arabic(i.invoice_number) LIKE '%' || v_norm_query || '%'
        OR public.normalize_arabic(prt.name) LIKE '%' || v_norm_query || '%'
        OR (prt.phone IS NOT NULL AND prt.phone LIKE '%' || v_clean_query || '%')
        OR EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          LEFT JOIN public.products p ON p.id = ii.product_id
          WHERE ii.invoice_id = i.id
            AND (
              (p.global_search_text IS NOT NULL AND p.global_search_text ILIKE '%' || v_clean_query || '%')
              OR public.normalize_arabic(ii.description) LIKE '%' || v_norm_query || '%'
              OR (p.name_ar IS NOT NULL AND public.normalize_arabic(p.name_ar) LIKE '%' || v_norm_query || '%')
              OR (p.part_number IS NOT NULL AND public.normalize_arabic(p.part_number) LIKE '%' || v_norm_query || '%')
              OR (p.sku IS NOT NULL AND public.normalize_arabic(p.sku) LIKE '%' || v_norm_query || '%')
              OR (p.brand IS NOT NULL AND public.normalize_arabic(p.brand) LIKE '%' || v_norm_query || '%')
              OR (p.barcode IS NOT NULL AND public.normalize_arabic(p.barcode) LIKE '%' || v_norm_query || '%')
              OR (p.alternative_numbers IS NOT NULL AND public.normalize_arabic(p.alternative_numbers) LIKE '%' || v_norm_query || '%')
              OR (
                array_length(v_tokens, 1) > 1 AND (
                  public.normalize_arabic(ii.description) LIKE '%' || v_first_token || '%'
                  OR (p.name_ar IS NOT NULL AND public.normalize_arabic(p.name_ar) LIKE '%' || v_first_token || '%')
                  OR (p.part_number IS NOT NULL AND public.normalize_arabic(p.part_number) LIKE '%' || v_first_token || '%')
                )
              )
            )
        )
      )
    ORDER BY i.issue_date DESC, i.id DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 5000)
    OFFSET GREATEST(p_offset, 0)
  ),
  item_agg AS (
    SELECT
      ii.invoice_id,
      COUNT(*)::BIGINT AS item_count,
      SUM(ii.total) AS items_doc_sum
    FROM public.invoice_items ii
    WHERE ii.invoice_id IN (SELECT fi.id FROM filtered_invoices fi)
    GROUP BY ii.invoice_id
  )
  SELECT
    fi.id,
    fi.company_id,
    fi.invoice_number,
    fi.type,
    fi.status,
    fi.payment_method,
    fi.total_amount,
    CASE
      WHEN COALESCE(fi.currency_code, 'SAR') <> 'SAR' THEN
        COALESCE(NULLIF(fi.raw_doc_total, 0), ia.items_doc_sum, fi.total_amount)
      ELSE fi.total_amount
    END AS total_document_amount,
    fi.currency_code,
    fi.exchange_rate,
    fi.issue_date,
    fi.party_id,
    fi.party_name,
    fi.party_phone,
    fi.notes,
    fi.reference_invoice_id,
    COALESCE(ia.item_count, 0::BIGINT) AS item_count,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', mii.id,
            'product_id', mii.product_id,
            'product_name', COALESCE(mp.name_ar, mii.description, 'صنف غير محدد'),
            'sku', mp.sku,
            'part_number', mp.part_number,
            'brand', mp.brand,
            'quantity', mii.quantity,
            'unit_price', mii.unit_price,
            'total', mii.total,
            'is_direct_match', (
              v_norm_query IS NOT NULL AND (
                public.normalize_arabic(mii.description) LIKE '%' || v_norm_query || '%'
                OR (mp.name_ar IS NOT NULL AND public.normalize_arabic(mp.name_ar) LIKE '%' || v_norm_query || '%')
                OR (mp.sku IS NOT NULL AND public.normalize_arabic(mp.sku) LIKE '%' || v_norm_query || '%')
                OR (mp.part_number IS NOT NULL AND public.normalize_arabic(mp.part_number) LIKE '%' || v_norm_query || '%')
                OR (mp.brand IS NOT NULL AND public.normalize_arabic(mp.brand) LIKE '%' || v_norm_query || '%')
                OR (mp.barcode IS NOT NULL AND public.normalize_arabic(mp.barcode) LIKE '%' || v_norm_query || '%')
                OR (mp.alternative_numbers IS NOT NULL AND public.normalize_arabic(mp.alternative_numbers) LIKE '%' || v_norm_query || '%')
                OR (
                  array_length(v_tokens, 1) > 1 AND (
                    public.normalize_arabic(mii.description) LIKE '%' || v_first_token || '%'
                    OR (mp.name_ar IS NOT NULL AND public.normalize_arabic(mp.name_ar) LIKE '%' || v_first_token || '%')
                    OR (mp.part_number IS NOT NULL AND public.normalize_arabic(mp.part_number) LIKE '%' || v_first_token || '%')
                  )
                )
              )
            )
          )
        )
        FROM (
          SELECT ii.*
          FROM public.invoice_items ii
          WHERE ii.invoice_id = fi.id
          LIMIT 5
        ) mii
        LEFT JOIN public.products mp ON mp.id = mii.product_id
      ),
      '[]'::jsonb
    ) AS matched_items,
    fi.total_matching_count
  FROM filtered_invoices fi
  LEFT JOIN item_agg ia ON ia.invoice_id = fi.id;
END;
$$;

REVOKE ALL ON FUNCTION public.search_invoices_advanced(
  UUID, TEXT, TEXT, DATE, DATE, TEXT, TEXT, UUID, INT, INT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.search_invoices_advanced(
  UUID, TEXT, TEXT, DATE, DATE, TEXT, TEXT, UUID, INT, INT
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
