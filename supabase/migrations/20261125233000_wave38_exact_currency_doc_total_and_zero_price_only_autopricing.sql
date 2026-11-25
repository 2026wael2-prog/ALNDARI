-- ==============================================================================
-- Migration: 20261125233000_wave38_exact_currency_doc_total_and_zero_price_only_autopricing.sql
-- Purpose:
--   1. Return exact `total_document_amount` in `search_invoices_advanced` so
--      foreign-currency invoices (e.g. 6000 YER) display their exact original
--      document amount in Sales & Purchases logs instead of reconstructing from
--      rounded base SAR (which caused ±0.20 rounding drift like 6000.20).
--   2. Restrict automatic `products.sale_price` updates during sales ONLY to
--      products that have NO selling price yet (`COALESCE(sale_price, 0) <= 0`).
--      Products that already have a configured selling price remain unchanged
--      even when sold above or below their catalog price.
-- ==============================================================================

-- 1. Update `search_invoices_advanced` to return exact `total_document_amount`
DROP FUNCTION IF EXISTS public.search_invoices_advanced(
  UUID, TEXT, TEXT, DATE, DATE, TEXT, TEXT, UUID, INT, INT
);

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
  PERFORM verify_company_access(p_company_id);

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
      CASE
        WHEN COALESCE(i.currency_code, 'SAR') <> 'SAR' THEN
          COALESCE(
            NULLIF(i.total_document_amount, 0),
            (SELECT SUM(ii_sum.total) FROM public.invoice_items ii_sum WHERE ii_sum.invoice_id = i.id),
            i.total_amount
          )
        ELSE i.total_amount
      END AS total_document_amount,
      i.currency_code,
      i.exchange_rate,
      i.issue_date,
      i.party_id,
      prt.name AS party_name,
      prt.phone AS party_phone,
      i.notes,
      i.reference_invoice_id,
      (
        SELECT COUNT(*)::BIGINT
        FROM public.invoice_items cnt_items
        WHERE cnt_items.invoice_id = i.id
      ) AS item_count,
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
        OR public.normalize_arabic(i.invoice_number) LIKE '%' || v_norm_query || '%'
        OR (v_clean_query IS NOT NULL AND i.invoice_number ILIKE '%' || v_clean_query || '%')
        OR public.normalize_arabic(prt.name) LIKE '%' || v_norm_query || '%'
        OR (prt.phone IS NOT NULL AND prt.phone LIKE '%' || v_clean_query || '%')
        OR EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          LEFT JOIN public.products p ON p.id = ii.product_id
          WHERE ii.invoice_id = i.id
            AND (
              public.normalize_arabic(ii.description) LIKE '%' || v_norm_query || '%'
              OR (p.name_ar IS NOT NULL AND public.normalize_arabic(p.name_ar) LIKE '%' || v_norm_query || '%')
              OR (p.sku IS NOT NULL AND public.normalize_arabic(p.sku) LIKE '%' || v_norm_query || '%')
              OR (p.part_number IS NOT NULL AND public.normalize_arabic(p.part_number) LIKE '%' || v_norm_query || '%')
              OR (p.brand IS NOT NULL AND public.normalize_arabic(p.brand) LIKE '%' || v_norm_query || '%')
              OR (p.barcode IS NOT NULL AND public.normalize_arabic(p.barcode) LIKE '%' || v_norm_query || '%')
              OR (p.alternative_numbers IS NOT NULL AND public.normalize_arabic(p.alternative_numbers) LIKE '%' || v_norm_query || '%')
              OR (p.description IS NOT NULL AND public.normalize_arabic(p.description) LIKE '%' || v_norm_query || '%')
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
  )
  SELECT
    fi.id,
    fi.company_id,
    fi.invoice_number,
    fi.type,
    fi.status,
    fi.payment_method,
    fi.total_amount,
    fi.total_document_amount,
    fi.currency_code,
    fi.exchange_rate,
    fi.issue_date,
    fi.party_id,
    fi.party_name,
    fi.party_phone,
    fi.notes,
    fi.reference_invoice_id,
    fi.item_count,
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
  FROM filtered_invoices fi;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_invoices_advanced(
  UUID, TEXT, TEXT, DATE, DATE, TEXT, TEXT, UUID, INT, INT
) TO authenticated, service_role;

-- 2. Restrict auto-pricing in `commit_sales_invoice_v2` (both overloads) &
--    `fn_process_cross_branch_sale` so ONLY unpriced products (sale_price <= 0)
--    are updated automatically on sale; priced products keep their exact price.
DO $$
DECLARE
  v_rec RECORD;
  v_def TEXT;
  v_new_def TEXT;
BEGIN
  FOR v_rec IN
    SELECT oid, proname
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('commit_sales_invoice_v2', 'fn_process_cross_branch_sale')
  LOOP
    v_def := pg_get_functiondef(v_rec.oid);
    v_new_def := replace(
      replace(
        v_def,
        'AND COALESCE(sale_price, 0) IS DISTINCT FROM v_last_sale_price_base;',
        'AND COALESCE(sale_price, 0) <= 0;'
      ),
      'AND COALESCE(sale_price, 0) IS DISTINCT FROM ROUND(v_item.sale_price, 2);',
      'AND COALESCE(sale_price, 0) <= 0;'
    );

    IF v_new_def IS DISTINCT FROM v_def THEN
      EXECUTE v_new_def;
      RAISE NOTICE 'Updated auto-pricing guard (sale_price <= 0 only) in %', v_rec.proname;
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
