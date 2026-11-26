-- ============================================================================
-- Wave 44: Eliminate 37s+ Statement Timeout & Postgres OOM in search_invoices_advanced
-- ============================================================================
-- Root cause proven in live Postgres logs (2026-11-26 18:24:19 - 18:26:59 UTC):
-- - Typing "قف" / "قفش" / "قفشة راف" fired concurrent search_invoices_advanced RPCs.
-- - Each call scanned 74,836 invoices x 228,693 invoice_items x 44,747 products
--   calling PL/pgSQL normalize_arabic() ~10 times per item (~2.3M regex calls),
--   taking 37.8s per query, hitting statement_timeout (57014), and crashing Postgres
--   (520/521/522/503 PGRST002 + CORS errors in Chrome).
--
-- Fix:
-- 1. Add GIN trigram indexes on invoices(invoice_number) and parties(normalize_arabic(name)).
-- 2. Rewrite search_invoices_advanced to use indexed inverted candidate-ID union:
--    - Uses existing idx_products_normalized_trgm (products.normalized_search_text)
--      + idx_invoice_items_bi_product_invoice (product_id, invoice_id)
--    - Matches multi-word queries across ALL tokens (AND) using normalized_search_text
--    - Caps broad short-query product matches to prevent combinatorial blowup
--    - Eliminates correlated EXISTS full scans and repeated normalize_arabic() calls.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_invoices_number_trgm
  ON public.invoices USING gin (invoice_number gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_parties_name_norm_trgm
  ON public.parties USING gin (public.normalize_arabic(name) gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.search_invoices_advanced(
  p_company_id uuid,
  p_type text DEFAULT NULL::text,
  p_query text DEFAULT NULL::text,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_status text DEFAULT NULL::text,
  p_payment_method text DEFAULT NULL::text,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  company_id uuid,
  invoice_number text,
  type text,
  status text,
  payment_method text,
  total_amount numeric,
  total_document_amount numeric,
  currency_code text,
  exchange_rate numeric,
  issue_date date,
  party_id uuid,
  party_name text,
  party_phone text,
  notes text,
  reference_invoice_id uuid,
  item_count bigint,
  matched_items jsonb,
  total_matching_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_clean_query TEXT;
  v_norm_query  TEXT;
  v_tokens      TEXT[];
  v_types       TEXT[];
  v_safe_limit  INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 5000);
  v_safe_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  PERFORM public.verify_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  IF p_type IS NOT NULL THEN
    IF p_type = 'purchase' THEN
      v_types := ARRAY['purchase', 'purchase_return'];
    ELSE
      v_types := string_to_array(p_type, ',');
    END IF;
  END IF;

  v_clean_query := NULLIF(TRIM(p_query), '');
  IF v_clean_query IS NOT NULL THEN
    v_norm_query := NULLIF(TRIM(public.normalize_arabic(v_clean_query)), '');
    IF v_norm_query IS NOT NULL THEN
      v_tokens := array_remove(regexp_split_to_array(v_norm_query, E'\\s+'), '');
    END IF;
  END IF;

  -- Fast path: no search text -> direct indexed list scan
  IF v_norm_query IS NULL THEN
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
        AND (v_types IS NULL OR i.type = ANY(v_types))
        AND (p_status IS NULL OR i.status = p_status)
        AND (p_payment_method IS NULL OR i.payment_method = p_payment_method)
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
        AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
      ORDER BY i.issue_date DESC, i.id DESC
      LIMIT v_safe_limit
      OFFSET v_safe_offset
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
              'is_direct_match', false
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
    LEFT JOIN item_agg ia ON ia.invoice_id = fi.id
    ORDER BY fi.issue_date DESC, fi.id DESC;
    RETURN;
  END IF;

  -- Search path: indexed inverted lookup (invoice_number + parties + products via GIN trigram)
  RETURN QUERY
  WITH matching_parties AS (
    SELECT prt.id
    FROM public.parties prt
    WHERE prt.company_id = p_company_id
      AND prt.deleted_at IS NULL
      AND (
        public.normalize_arabic(prt.name) LIKE '%' || v_norm_query || '%'
        OR (prt.phone IS NOT NULL AND prt.phone LIKE '%' || v_clean_query || '%')
      )
    LIMIT 300
  ),
  matching_products AS (
    SELECT p.id
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND p.normalized_search_text LIKE '%' || v_tokens[1] || '%'
      AND (COALESCE(array_length(v_tokens, 1), 1) < 2 OR p.normalized_search_text LIKE '%' || v_tokens[2] || '%')
      AND (COALESCE(array_length(v_tokens, 1), 1) < 3 OR p.normalized_search_text LIKE '%' || v_tokens[3] || '%')
      AND (
        COALESCE(array_length(v_tokens, 1), 1) <= 3
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(v_tokens) AS tok
          WHERE p.normalized_search_text NOT LIKE '%' || tok || '%'
        )
      )
    LIMIT 500
  ),
  candidate_invoice_ids AS (
    -- 1. Match by invoice number (GIN trigram index)
    SELECT i.id
    FROM public.invoices i
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.status <> 'void'
      AND (i.invoice_number ILIKE '%' || v_clean_query || '%')
    UNION
    -- 2. Match by party name / phone (indexed on invoices.party_id)
    SELECT i.id
    FROM public.invoices i
    JOIN matching_parties mp ON mp.id = i.party_id
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.status <> 'void'
    UNION
    -- 3. Match by product (GIN trigram on products.normalized_search_text -> idx_invoice_items_bi_product_invoice)
    SELECT ii.invoice_id AS id
    FROM matching_products mpr
    JOIN public.invoice_items ii ON ii.product_id = mpr.id
    UNION
    -- 4. Fallback for ad-hoc items with NULL product_id (partial index idx_invoice_items_null_product)
    SELECT ii.invoice_id AS id
    FROM public.invoice_items ii
    WHERE ii.company_id = p_company_id
      AND ii.product_id IS NULL
      AND ii.description IS NOT NULL
      AND public.normalize_arabic(ii.description) LIKE '%' || v_norm_query || '%'
  ),
  filtered_invoices AS (
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
    FROM candidate_invoice_ids c
    JOIN public.invoices i ON i.id = c.id
    LEFT JOIN public.parties prt ON prt.id = i.party_id
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.status <> 'void'
      AND (v_types IS NULL OR i.type = ANY(v_types))
      AND (p_status IS NULL OR i.status = p_status)
      AND (p_payment_method IS NULL OR i.payment_method = p_payment_method)
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
      AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
      AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
    ORDER BY i.issue_date DESC, i.id DESC
    LIMIT v_safe_limit
    OFFSET v_safe_offset
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
              (mp.id IS NOT NULL AND mp.id IN (SELECT mp_sub.id FROM matching_products mp_sub))
              OR (mii.description IS NOT NULL AND public.normalize_arabic(mii.description) LIKE '%' || v_norm_query || '%')
            )
          )
        )
        FROM (
          SELECT ii.*
          FROM public.invoice_items ii
          WHERE ii.invoice_id = fi.id
          ORDER BY (ii.product_id IN (SELECT mp_sub.id FROM matching_products mp_sub)) DESC, ii.id ASC
          LIMIT 5
        ) mii
        LEFT JOIN public.products mp ON mp.id = mii.product_id
      ),
      '[]'::jsonb
    ) AS matched_items,
    fi.total_matching_count
  FROM filtered_invoices fi
  LEFT JOIN item_agg ia ON ia.invoice_id = fi.id
  ORDER BY fi.issue_date DESC, fi.id DESC;
END;
$function$;

NOTIFY pgrst, 'reload schema';
