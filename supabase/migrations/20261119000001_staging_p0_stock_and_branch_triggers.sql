-- Phase 2 Batch 1 & 2 (Staging P0): Fix product_stock ON CONFLICT key & branch warehouse provisioning
-- Target: Staging (adrgddwoksskzoryshgv)

-- 1. Fix fn_update_weighted_avg_cost() to scope lock & ON CONFLICT by (company_id, product_id, warehouse_id)
CREATE OR REPLACE FUNCTION public.fn_update_weighted_avg_cost()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_qty numeric;
  v_old_avg numeric;
  v_new_avg numeric;
  v_company_id uuid;
BEGIN
  IF new.transaction_type = 'purchase' AND new.quantity > 0 THEN
    v_company_id := COALESCE(new.company_id, (SELECT company_id FROM public.products WHERE id = new.product_id));

    SELECT quantity, weighted_avg_cost INTO v_old_qty, v_old_avg
    FROM public.product_stock
    WHERE company_id = v_company_id
      AND product_id = new.product_id
      AND warehouse_id = new.warehouse_id
    FOR UPDATE;

    IF v_old_qty IS NULL THEN
      v_old_qty := 0;
      v_old_avg := 0;
    END IF;

    IF v_old_qty <= 0 OR (v_old_qty + new.quantity) <= 0 THEN
      v_new_avg := new.unit_cost;
    ELSE
      v_new_avg := round(
        (v_old_qty * coalesce(v_old_avg, 0) + new.quantity * new.unit_cost)
        / (v_old_qty + new.quantity), 4);
    END IF;

    -- UPSERT ensures weighted_avg_cost is preserved even on first purchase before update_product_stock_trigger runs
    INSERT INTO public.product_stock (
      product_id, warehouse_id, quantity, weighted_avg_cost, company_id, updated_by
    ) VALUES (
      new.product_id, new.warehouse_id, 0, v_new_avg, v_company_id, new.created_by
    )
    ON CONFLICT (company_id, product_id, warehouse_id) DO UPDATE
    SET weighted_avg_cost = EXCLUDED.weighted_avg_cost,
        updated_at = now();

    UPDATE public.products
    SET cost_price = v_new_avg,
        purchase_price = new.unit_cost
    WHERE id = new.product_id
      AND company_id = v_company_id;
  END IF;

  RETURN new;
END;
$function$;

-- 2. Fix trg_update_product_stock() to use ON CONFLICT (company_id, product_id, warehouse_id)
CREATE OR REPLACE FUNCTION public.trg_update_product_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qty_change   numeric;
  v_company_id   uuid;
BEGIN
  -- NO BYPASS. ALL TRANSACTIONS MUST TRIGGER STOCK UPDATE TO MAINTAIN SOURCE OF TRUTH.
  SELECT COALESCE(NEW.company_id, p.company_id) INTO v_company_id
  FROM public.products p
  WHERE p.id = NEW.product_id;

  v_qty_change := CASE NEW.transaction_type
    WHEN 'purchase'        THEN  ABS(NEW.quantity)
    WHEN 'sales_return'    THEN  ABS(NEW.quantity)
    WHEN 'transfer_in'     THEN  ABS(NEW.quantity)
    WHEN 'adj_in'          THEN  ABS(NEW.quantity)
    WHEN 'initial'         THEN  ABS(NEW.quantity)
    WHEN 'sales'           THEN -ABS(NEW.quantity)
    WHEN 'purchase_return' THEN -ABS(NEW.quantity)
    WHEN 'transfer_out'    THEN -ABS(NEW.quantity)
    WHEN 'adj_out'         THEN -ABS(NEW.quantity)
    WHEN 'adj'             THEN  NEW.quantity
    ELSE 0
  END;

  IF v_qty_change = 0 THEN RETURN NEW; END IF;

  INSERT INTO public.product_stock(product_id, warehouse_id, quantity, company_id, updated_by)
  VALUES (NEW.product_id, NEW.warehouse_id, v_qty_change, v_company_id, NEW.created_by)
  ON CONFLICT (company_id, product_id, warehouse_id)
  DO UPDATE SET
    quantity   = product_stock.quantity + v_qty_change,
    updated_at = now(),
    updated_by = NEW.created_by;

  RETURN NEW;
END;
$function$;

-- 3. Fix fn_auto_provision_branch_warehouse() so secondary branches do not violate uq_one_primary_warehouse_per_company
CREATE OR REPLACE FUNCTION public.fn_auto_provision_branch_warehouse()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_has_primary boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouses w
    WHERE w.company_id = NEW.company_id
      AND w.branch_id = NEW.id
      AND w.deleted_at IS NULL
  ) THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.warehouses w
      WHERE w.company_id = NEW.company_id
        AND w.is_primary = true
        AND w.deleted_at IS NULL
    ) INTO v_has_primary;

    INSERT INTO public.warehouses (
      company_id,
      branch_id,
      name_ar,
      location,
      is_primary,
      status
    ) VALUES (
      NEW.company_id,
      NEW.id,
      'مستودع ' || NEW.name,
      NEW.address,
      NOT v_has_primary,
      'active'
    );
  END IF;
  RETURN NEW;
END;
$function$;
