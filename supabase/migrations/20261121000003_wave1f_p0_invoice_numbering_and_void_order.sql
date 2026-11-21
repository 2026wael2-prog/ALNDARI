-- ============================================================================
-- Migration: 20261121000003_wave1f_p0_invoice_numbering_and_void_order.sql
-- Wave 1F/1G (P0): Collision-proof generate_invoice_number + void_bond/void_invoice allocation order
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_invoice_number(
  p_company_id uuid,
  p_type text,
  p_branch_id uuid DEFAULT NULL::uuid
)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prefix      text;
  v_date_str    text := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
  v_count       bigint;
  v_branch_code text := '';
  v_candidate   text;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  v_prefix := CASE p_type
    WHEN 'sale' THEN 'INV'
    WHEN 'purchase' THEN 'PUR'
    WHEN 'sale_return' THEN 'RET'
    WHEN 'purchase_return' THEN 'RPR'
    ELSE 'DOC'
  END;

  IF p_branch_id IS NOT NULL THEN
    SELECT code INTO v_branch_code
    FROM public.branches
    WHERE id = p_branch_id AND company_id = p_company_id;

    IF v_branch_code IS NULL OR v_branch_code = '' THEN
      SELECT CASE WHEN is_main THEN 'WN' ELSE 'B' || UPPER(SUBSTRING(id::text, 1, 4)) END
      INTO v_branch_code
      FROM public.branches
      WHERE id = p_branch_id;
    END IF;

    IF v_branch_code IS NOT NULL AND v_branch_code <> '' THEN
      v_prefix := v_prefix || '-' || v_branch_code;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('invoice_number:' || p_company_id::text || ':' || COALESCE(p_type, 'DOC')));

  SELECT COALESCE(MAX(
           CASE WHEN invoice_number ~ '\d+$'
                THEN (regexp_match(invoice_number, '\d+$'))[1]::bigint END
         ), 0) + 1
  INTO v_count
  FROM public.invoices
  WHERE company_id = p_company_id
    AND type = p_type
    AND invoice_number LIKE v_prefix || '-' || v_date_str || '-%';

  v_candidate := v_prefix || '-' || v_date_str || '-' || LPAD(v_count::text, 4, '0');

  WHILE EXISTS (
    SELECT 1 FROM public.invoices
    WHERE company_id = p_company_id
      AND type = p_type
      AND invoice_number = v_candidate
  ) LOOP
    v_count := v_count + 1;
    v_candidate := v_prefix || '-' || v_date_str || '-' || LPAD(v_count::text, 4, '0');
  END LOOP;

  RETURN v_candidate;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_fill_invoice_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := public.generate_invoice_number(NEW.company_id, NEW.type, NEW.branch_id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.generate_invoice_number(uuid, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.generate_invoice_number(uuid, text, uuid) TO authenticated, service_role;
