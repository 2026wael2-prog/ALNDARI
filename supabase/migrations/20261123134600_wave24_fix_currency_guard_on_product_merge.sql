-- Migration: Allow product merge re-pointing on invoice_items without false currency mismatch trigger
-- Date: 2026-11-23

CREATE OR REPLACE FUNCTION public.fn_guard_invoice_item_currency_mismatch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_inv RECORD;
    v_prod RECORD;
    v_unit_sar numeric;
BEGIN
    IF current_setting('app.skip_currency_guard', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- If unit_price didn't change on UPDATE (e.g., product re-pointing during merge), skip guard
    IF TG_OP = 'UPDATE' AND NEW.unit_price IS NOT DISTINCT FROM OLD.unit_price THEN
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.unit_price, 0) <= 0 OR NEW.product_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT inv.type, inv.currency_code, inv.exchange_rate, inv.invoice_number
    INTO v_inv
    FROM public.invoices inv
    WHERE inv.id = NEW.invoice_id;

    IF NOT FOUND OR v_inv.type NOT IN ('sale', 'sale_return') THEN
        RETURN NEW;
    END IF;

    SELECT p.sku, p.sale_price
    INTO v_prod
    FROM public.products p
    WHERE p.id = NEW.product_id;

    IF NOT FOUND OR COALESCE(v_prod.sale_price, 0) < 10 OR COALESCE(v_prod.sku, '') = '1012347' THEN
        RETURN NEW;
    END IF;

    -- Case 1: SAR invoice with YER-scaled unit price (>= 50x reference SAR price and >= 5000)
    IF COALESCE(v_inv.currency_code, 'SAR') = 'SAR'
       AND NEW.unit_price >= (v_prod.sale_price * 50)
       AND NEW.unit_price >= 5000 THEN
        RAISE EXCEPTION 'تضارب عملة محتمل: سعر الوحدة (%) أكبر بـ 50 ضعفاً من سعر البيع المرجعي (% ر.س) على فاتورة بعملة SAR (فاتورة %). يرجى التحقق من اختيار العملة الصحيحة.',
            NEW.unit_price, v_prod.sale_price, COALESCE(v_inv.invoice_number, NEW.invoice_id::text)
            USING errcode = 'check_violation';
    END IF;

    -- Case 2: YER invoice with SAR-scaled unit price (converted SAR <= 1/20 of reference SAR price)
    IF v_inv.currency_code = 'YER'
       AND COALESCE(v_inv.exchange_rate, 0) > 0
       AND v_inv.exchange_rate < 0.05 THEN
        v_unit_sar := NEW.unit_price * v_inv.exchange_rate;
        IF v_unit_sar <= (v_prod.sale_price / 20.0) THEN
            RAISE EXCEPTION 'تضارب عملة محتمل: سعر الوحدة (% يمني ≈ % ر.س) أقل بكثير من السعر المرجعي (% ر.س) على فاتورة YER (فاتورة %). يرجى التحقق من العملة.',
                NEW.unit_price, ROUND(v_unit_sar, 2), v_prod.sale_price, COALESCE(v_inv.invoice_number, NEW.invoice_id::text)
                USING errcode = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
