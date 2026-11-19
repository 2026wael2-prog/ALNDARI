-- Phase 2 Batch 5 (Staging P1): Trigger optimization, pg_trgm search indexes, FK indexes, and snapshot CTE optimization
-- Target: Staging (adrgddwoksskzoryshgv)

-- 1. Optimize guard_text_lengths() by replacing information_schema.columns with pg_attribute (TG_RELID)
CREATE OR REPLACE FUNCTION public.guard_text_lengths()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rec record;
  v_val text;
BEGIN
  FOR v_rec IN
    SELECT l.column_name, l.max_length
    FROM public._text_length_limits l
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = TG_RELID
     AND a.attname = l.column_name
     AND NOT a.attisdropped
     AND a.attnum > 0
    WHERE l.table_name = TG_TABLE_NAME
  LOOP
    EXECUTE format('SELECT ($1).%I::text', v_rec.column_name)
      INTO v_val
      USING NEW;

    IF v_val IS NOT NULL AND length(v_val) > v_rec.max_length THEN
      RAISE EXCEPTION '% exceeds maximum length of % characters',
        v_rec.column_name, v_rec.max_length
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- 2. GIN pg_trgm indexes on products for ILIKE '%...%' searches (name_ar, sku, part_number)
CREATE INDEX IF NOT EXISTS idx_products_name_ar_trgm
  ON public.products USING gin (name_ar gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_sku_trgm
  ON public.products USING gin (sku gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_part_number_trgm
  ON public.products USING gin (part_number gin_trgm_ops)
  WHERE deleted_at IS NULL AND part_number IS NOT NULL;

-- 3. Targeted FK indexes on hot & intelligence tables
CREATE INDEX IF NOT EXISTS idx_inv_intel_recs_run_id
  ON public.inv_intelligence_recommendations (run_id);

CREATE INDEX IF NOT EXISTS idx_inv_intel_recs_product_id
  ON public.inv_intelligence_recommendations (product_id);

CREATE INDEX IF NOT EXISTS idx_inv_demand_forecasts_run_prod
  ON public.inv_demand_forecasts (run_id, product_id);

CREATE INDEX IF NOT EXISTS idx_inv_daily_avail_prod_wh
  ON public.inv_daily_availability_snapshots (product_id, warehouse_id);

CREATE INDEX IF NOT EXISTS idx_invoices_reference_invoice_id
  ON public.invoices (reference_invoice_id)
  WHERE reference_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prc_purchase_invoices_supplier_id
  ON public.prc_purchase_invoices (supplier_id);
