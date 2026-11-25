-- =============================================================================
-- Wave 39: Fix HTTP 400 in `update_sales_invoice_v2` when converting SAR -> YER
-- Date: 2026-11-25
-- Root Cause:
--   1. In `update_sales_invoice_v2`, Step 12 inserted the new YER `invoice_items`
--      (e.g. unit_price = 6000) BEFORE Step 13 updated `invoices.currency_code`
--      from 'SAR' to 'YER'. The `invoice_items` currency-guard trigger saw
--      `invoices.currency_code = 'SAR'` with `NEW.unit_price >= sale_price * 50`
--      and raised an exception (HTTP 400)!
--   2. If `p_payment_account_id` still pointed to a cashbox in the old currency
--      (e.g. SAR cashbox after switching invoice to YER), posting YER lines to
--      the SAR cashbox failed currency validation.
-- Fix:
--   Update `invoices.currency_code` and `exchange_rate` BEFORE inserting new
--   `invoice_items`, and auto-fallback `v_acc_funding` to the default cash
--   account of `v_currency` if `p_payment_account_id` has a mismatched currency.
-- =============================================================================

DO $$
DECLARE
  v_oid oid;
  v_def text;
  v_new_def text;
BEGIN
  SELECT oid INTO v_oid
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname = 'update_sales_invoice_v2'
  LIMIT 1;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'update_sales_invoice_v2 not found';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  v_new_def := replace(
    v_def,
    '-- 12. Insert new invoice items & deduct stock via sales transactions',
    E'-- 11b. Sync invoice currency_code & exchange_rate BEFORE inserting new items so currency-guard trigger sees the NEW currency\n  IF v_currency <> v_old_currency OR COALESCE(v_invoice.exchange_rate, 1) IS DISTINCT FROM v_eff_rate THEN\n    UPDATE public.invoices\n    SET currency_code = v_currency,\n        exchange_rate = v_eff_rate,\n        updated_at    = now()\n    WHERE id = p_invoice_id;\n  END IF;\n\n  -- 12. Insert new invoice items & deduct stock via sales transactions'
  );

  v_new_def := replace(
    v_new_def,
    'WHERE id = v_acc_funding AND allow_posting = true AND is_active = true AND deleted_at IS NULL',
    'WHERE id = v_acc_funding AND allow_posting = true AND is_active = true AND deleted_at IS NULL AND (currency_code IS NULL OR UPPER(TRIM(currency_code)) = v_currency)'
  );

  IF v_new_def IS DISTINCT FROM v_def THEN
    EXECUTE v_new_def;
    RAISE NOTICE 'Patched update_sales_invoice_v2 for SAR <-> YER currency conversion';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
