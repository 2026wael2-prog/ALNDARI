-- Migration: 20261120000001_remediate_audit_accounting_and_security_flaws.sql
-- Description: Complete Remediation of 20 November 2026 Database Architectural, Accounting, and Security Audit
-- Target DB: Supabase (PostgreSQL 17.11)

-- ============================================================================
-- SECTION 1: ACCOUNTING CORRECTNESS & INTEGRITY
-- ============================================================================

-- 1.1 Fix Double Discount Subtraction in fn_auto_post_invoice_journal()
-- In invoices, total_amount already accounts for line discounts.
-- Subtracting discount_amount again created an erroneous second discount.
CREATE OR REPLACE FUNCTION public.fn_auto_post_invoice_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_je_id uuid;
  v_acc_ar uuid;
  v_acc_ap uuid;
  v_acc_revenue uuid;
  v_acc_vat uuid;
  v_acc_inventory uuid;
  v_acc_cogs uuid;
  v_acc_funding uuid;
  v_net_amount numeric(18,4);
  v_net_receivable numeric(18,4);
  v_base_net_amount numeric(18,4);
  v_base_net_receivable numeric(18,4);
  v_base_tax numeric(18,4);
  v_total_cogs numeric(18,4);
  v_already_posted boolean;
  v_postable_statuses text[] := array['posted','confirmed','paid','partially_paid'];
  v_paid_foreign numeric(18,4);
  v_unpaid_foreign numeric(18,4);
  v_base_paid numeric(18,4);
  v_base_unpaid numeric(18,4);
BEGIN
  IF NOT (new.status = ANY(v_postable_statuses)) THEN RETURN new; END IF;

  SELECT exists(SELECT 1 FROM public.journal_entries je
    WHERE je.reference_id = new.id AND je.deleted_at IS NULL)
  INTO v_already_posted;
  IF v_already_posted THEN RETURN new; END IF;

  v_acc_ar        := fn_get_account_id(new.company_id, '1100');
  v_acc_ap        := fn_get_account_id(new.company_id, '2100');
  v_acc_revenue   := fn_get_account_id(new.company_id, '4100');
  v_acc_vat       := fn_get_account_id(new.company_id, '2200');
  v_acc_inventory := fn_get_account_id(new.company_id, '1200');
  v_acc_cogs      := fn_get_account_id(new.company_id, '5100');

  SELECT COALESCE(SUM(quantity * COALESCE(cost_price, 0)), 0)
  INTO v_total_cogs FROM public.invoice_items WHERE invoice_id = new.id;

  -- [AUDIT FIX 1.1] total_amount already incorporates discount_amount.
  -- Do NOT subtract discount_amount a second time.
  v_net_amount          := new.total_amount - COALESCE(new.tax_amount, 0);
  v_net_receivable      := new.total_amount;
  v_base_net_amount     := public.fn_to_base_amount(new.currency_code, v_net_amount, new.exchange_rate);
  v_base_tax            := public.fn_to_base_amount(new.currency_code, COALESCE(new.tax_amount, 0), new.exchange_rate);
  v_base_net_receivable := v_base_net_amount + v_base_tax;

  IF new.payment_method = 'cash' AND (new.paid_amount IS NULL OR new.paid_amount = 0) THEN
    v_paid_foreign := v_net_receivable;
  ELSE
    v_paid_foreign := LEAST(COALESCE(new.paid_amount, 0), v_net_receivable);
  END IF;
  v_unpaid_foreign := v_net_receivable - v_paid_foreign;

  IF v_net_receivable > 0 THEN
    v_base_paid   := round(v_base_net_receivable * (v_paid_foreign / v_net_receivable), 4);
    v_base_unpaid := v_base_net_receivable - v_base_paid;
  ELSE
    v_base_paid := 0; v_base_unpaid := 0;
  END IF;

  -- Determine funding account (cash/bank)
  IF new.payment_account_id IS NOT NULL THEN
    v_acc_funding := new.payment_account_id;
  ELSIF new.payment_method = 'cash' THEN
    v_acc_funding := COALESCE(
      public.fn_get_default_cash_account(new.company_id, new.currency_code),
      fn_get_account_id(new.company_id, '1010-01'),
      fn_get_account_id(new.company_id, '101001')
    );
  ELSIF new.payment_method IN ('network','card','bank','bank_transfer','pos') THEN
    v_acc_funding := COALESCE(
      fn_get_account_id(new.company_id, '1020'),
      fn_get_account_id(new.company_id, '1120')
    );
  ELSE
    v_acc_funding := NULL;
  END IF;

  -- Validate funding account allows posting
  IF v_acc_funding IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = v_acc_funding AND allow_posting = true AND is_active = true AND deleted_at IS NULL
    ) THEN
      v_acc_funding := public.fn_get_default_cash_account(new.company_id, new.currency_code);
    END IF;
  END IF;

  -- Fallback for immediate-payment types only
  IF v_acc_funding IS NULL AND v_base_paid > 0
     AND new.payment_method IN ('cash','network','card','bank','bank_transfer','pos') THEN
    SELECT id INTO v_acc_funding FROM public.accounts
    WHERE company_id = new.company_id
      AND (code LIKE '101%' OR code LIKE '102%' OR type = 'asset')
      AND allow_posting = true AND is_active = true AND deleted_at IS NULL
    ORDER BY CASE WHEN code LIKE '101%' THEN 0 ELSE 1 END, code ASC LIMIT 1;
  END IF;

  -- Last resort for cash types only
  IF v_acc_funding IS NULL AND v_base_paid > 0
     AND new.payment_method IN ('cash','network','card','bank','bank_transfer','pos') THEN
    v_acc_funding := v_acc_ar;
  END IF;

  -- Credit sale returns must credit AR, not cash
  IF new.type IN ('sale_return','return_sale') AND new.payment_method = 'credit' THEN
    v_acc_funding := NULL;
  END IF;

  -- Set session flag so journal entry posting trigger knows this is internal authorized RPC
  PERFORM set_config('app.rpc_authorized', 'true', true);

  -- 1. Sale invoice
  IF new.type = 'sale' THEN
    IF v_acc_revenue IS NULL THEN
      RAISE EXCEPTION 'auto_post_failed: revenue 4100 missing for company %', new.company_id;
    END IF;
    IF v_acc_funding IS NULL AND v_acc_ar IS NULL THEN
      RAISE EXCEPTION 'auto_post_failed: AR 1100 and cash both missing for company %', new.company_id;
    END IF;

    INSERT INTO journal_entries(company_id,branch_id,entry_date,reference_type,reference_id,description,status,created_by)
    VALUES(new.company_id,new.branch_id,new.issue_date,'sales_invoice',new.id,
           'ترحيل تلقائي - فاتورة مبيعات '||COALESCE(new.invoice_number,''),'draft',new.created_by)
    RETURNING id INTO v_je_id;

    IF v_base_paid > 0 AND v_acc_funding IS NOT NULL THEN
      INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
      VALUES(v_je_id,v_acc_funding,new.company_id,new.branch_id,v_base_paid,0,v_paid_foreign,new.currency_code,COALESCE(new.exchange_rate,1),
             CASE WHEN v_base_unpaid>0 THEN 'سداد جزئي نقدي/بنكي - ' ELSE 'مبيعات نقدية/بنكية - ' END||COALESCE(new.invoice_number,''),NULL);
    END IF;
    IF v_base_unpaid > 0 OR (v_base_paid = 0 AND v_acc_funding IS NULL) THEN
      INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
      VALUES(v_je_id,v_acc_ar,new.company_id,new.branch_id,v_base_unpaid,0,v_unpaid_foreign,new.currency_code,COALESCE(new.exchange_rate,1),
             CASE WHEN v_base_paid>0 THEN 'متبقي ذمم عملاء - ' ELSE 'مبيعات آجل - ' END||COALESCE(new.invoice_number,''),new.party_id);
    END IF;
    INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
    VALUES(v_je_id,v_acc_revenue,new.company_id,new.branch_id,0,v_base_net_amount,v_net_amount,new.currency_code,COALESCE(new.exchange_rate,1),
           'إيراد مبيعات - '||COALESCE(new.invoice_number,''),NULL);
    IF COALESCE(new.tax_amount,0) <> 0 THEN
      IF v_acc_vat IS NULL THEN RAISE EXCEPTION 'auto_post_failed: VAT 2200 missing for company %', new.company_id; END IF;
      INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
      VALUES(v_je_id,v_acc_vat,new.company_id,new.branch_id,0,v_base_tax,new.tax_amount,new.currency_code,COALESCE(new.exchange_rate,1),
             'ضريبة مخرجات مبيعات - '||COALESCE(new.invoice_number,''),NULL);
    END IF;
    IF v_total_cogs > 0 THEN
      IF v_acc_cogs IS NULL OR v_acc_inventory IS NULL THEN
        RAISE EXCEPTION 'auto_post_failed: COGS 5100 or inventory 1200 missing for company %', new.company_id;
      END IF;
      INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
      VALUES(v_je_id,v_acc_cogs,new.company_id,new.branch_id,v_total_cogs,0,NULL,NULL,NULL,'تكلفة مبيعات - '||COALESCE(new.invoice_number,''),NULL);
      INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
      VALUES(v_je_id,v_acc_inventory,new.company_id,new.branch_id,0,v_total_cogs,NULL,NULL,NULL,'إخراج بضاعة مباعة - '||COALESCE(new.invoice_number,''),NULL);
    END IF;

  -- 2. Purchase invoice
  ELSIF new.type = 'purchase' THEN
    IF v_acc_inventory IS NULL THEN RAISE EXCEPTION 'auto_post_failed: inventory 1200 missing for company %', new.company_id; END IF;
    IF v_acc_funding IS NULL AND v_acc_ap IS NULL THEN RAISE EXCEPTION 'auto_post_failed: AP 2100 and cash both missing for company %', new.company_id; END IF;

    INSERT INTO journal_entries(company_id,branch_id,entry_date,reference_type,reference_id,description,status,created_by)
    VALUES(new.company_id,new.branch_id,new.issue_date,'purchase_invoice',new.id,
           'ترحيل تلقائي - فاتورة مشتريات '||COALESCE(new.invoice_number,''),'draft',new.created_by)
    RETURNING id INTO v_je_id;

    INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
    VALUES(v_je_id,v_acc_inventory,new.company_id,new.branch_id,v_base_net_amount,0,v_net_amount,new.currency_code,COALESCE(new.exchange_rate,1),
           'إدخال مخزون مشتريات - '||COALESCE(new.invoice_number,''),NULL);
    IF COALESCE(new.tax_amount,0) <> 0 THEN
      IF v_acc_vat IS NULL THEN RAISE EXCEPTION 'auto_post_failed: VAT 2200 missing for company %', new.company_id; END IF;
      INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
      VALUES(v_je_id,v_acc_vat,new.company_id,new.branch_id,v_base_tax,0,new.tax_amount,new.currency_code,COALESCE(new.exchange_rate,1),
             'ضريبة مدخلات مشتريات - '||COALESCE(new.invoice_number,''),NULL);
    END IF;
    IF v_base_paid > 0 AND v_acc_funding IS NOT NULL THEN
      INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
      VALUES(v_je_id,v_acc_funding,new.company_id,new.branch_id,0,v_base_paid,v_paid_foreign,new.currency_code,COALESCE(new.exchange_rate,1),
             CASE WHEN v_base_unpaid>0 THEN 'سداد جزئي نقدي/بنكي لمورد - ' ELSE 'مشتريات نقدية/بنكية - ' END||COALESCE(new.invoice_number,''),NULL);
    END IF;
    IF v_base_unpaid > 0 OR (v_base_paid = 0 AND v_acc_funding IS NULL) THEN
      INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
      VALUES(v_je_id,v_acc_ap,new.company_id,new.branch_id,0,v_base_unpaid,v_unpaid_foreign,new.currency_code,COALESCE(new.exchange_rate,1),
             CASE WHEN v_base_paid>0 THEN 'متبقي ذمم موردين - ' ELSE 'مشتريات آجل - ' END||COALESCE(new.invoice_number,''),new.party_id);
    END IF;

  -- 3. Sale return
  ELSIF new.type IN ('sale_return','return_sale') THEN
    IF v_acc_revenue IS NULL THEN RAISE EXCEPTION 'auto_post_failed: revenue 4100 missing for company %', new.company_id; END IF;
    IF v_acc_funding IS NULL AND v_acc_ar IS NULL THEN RAISE EXCEPTION 'auto_post_failed: AR 1100 and cash both missing for company %', new.company_id; END IF;

    INSERT INTO journal_entries(company_id,branch_id,entry_date,reference_type,reference_id,description,status,created_by)
    VALUES(new.company_id,new.branch_id,new.issue_date,'sales_return',new.id,
           'ترحيل تلقائي - مردود مبيعات '||COALESCE(new.invoice_number,''),'draft',new.created_by)
    RETURNING id INTO v_je_id;

    INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
    VALUES(v_je_id,v_acc_revenue,new.company_id,new.branch_id,v_base_net_amount,0,v_net_amount,new.currency_code,COALESCE(new.exchange_rate,1),
           'مردود مبيعات - '||COALESCE(new.invoice_number,''),NULL);
    IF COALESCE(new.tax_amount,0) <> 0 THEN
      IF v_acc_vat IS NULL THEN RAISE EXCEPTION 'auto_post_failed: VAT 2200 missing for company %', new.company_id; END IF;
      INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
      VALUES(v_je_id,v_acc_vat,new.company_id,new.branch_id,v_base_tax,0,new.tax_amount,new.currency_code,COALESCE(new.exchange_rate,1),
             'تخفيض ضريبة مردودات - '||COALESCE(new.invoice_number,''),NULL);
    END IF;
    INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
    VALUES(
      v_je_id, COALESCE(v_acc_funding, v_acc_ar),
      new.company_id, new.branch_id, 0, v_base_net_receivable, v_net_receivable,
      new.currency_code, COALESCE(new.exchange_rate,1),
      CASE WHEN v_acc_funding IS NULL THEN 'مردودات تخفض ذمم عملاء - ' ELSE 'مستردات نقدية لعميل - ' END||COALESCE(new.invoice_number,''),
      CASE WHEN v_acc_funding IS NULL THEN new.party_id ELSE NULL END
    );
    IF v_total_cogs > 0 THEN
      IF v_acc_cogs IS NULL OR v_acc_inventory IS NULL THEN
        RAISE EXCEPTION 'auto_post_failed: COGS/inventory missing for company %', new.company_id;
      END IF;
      INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
      VALUES(v_je_id,v_acc_inventory,new.company_id,new.branch_id,v_total_cogs,0,NULL,NULL,NULL,'إرجاع مخزون مردودات مبيعات - '||COALESCE(new.invoice_number,''),NULL);
      INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
      VALUES(v_je_id,v_acc_cogs,new.company_id,new.branch_id,0,v_total_cogs,NULL,NULL,NULL,'تخفيض تكلفة مبيعات - '||COALESCE(new.invoice_number,''),NULL);
    END IF;

  -- 4. Purchase return
  ELSIF new.type IN ('purchase_return','return_purchase') THEN
    IF v_acc_inventory IS NULL THEN RAISE EXCEPTION 'auto_post_failed: inventory 1200 missing for company %', new.company_id; END IF;
    IF v_acc_funding IS NULL AND v_acc_ap IS NULL THEN RAISE EXCEPTION 'auto_post_failed: AP/cash missing for company %', new.company_id; END IF;

    INSERT INTO journal_entries(company_id,branch_id,entry_date,reference_type,reference_id,description,status,created_by)
    VALUES(new.company_id,new.branch_id,new.issue_date,'purchase_return',new.id,
           'ترحيل تلقائي - مردود مشتريات '||COALESCE(new.invoice_number,''),'draft',new.created_by)
    RETURNING id INTO v_je_id;

    INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
    VALUES(v_je_id,COALESCE(v_acc_funding,v_acc_ap),new.company_id,new.branch_id,v_base_net_receivable,0,v_net_receivable,new.currency_code,COALESCE(new.exchange_rate,1),
           CASE WHEN v_acc_funding IS NULL THEN 'مردودات ذمم موردين - ' ELSE 'مستردات نقدية من مورد - ' END||COALESCE(new.invoice_number,''),
           CASE WHEN v_acc_funding IS NULL THEN new.party_id ELSE NULL END);
    INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
    VALUES(v_je_id,v_acc_inventory,new.company_id,new.branch_id,0,v_base_net_amount,v_net_amount,new.currency_code,COALESCE(new.exchange_rate,1),
           'تخفيض مخزون مردودات - '||COALESCE(new.invoice_number,''),NULL);
    IF COALESCE(new.tax_amount,0) <> 0 THEN
      IF v_acc_vat IS NULL THEN RAISE EXCEPTION 'auto_post_failed: VAT 2200 missing for company %', new.company_id; END IF;
      INSERT INTO journal_entry_lines(journal_entry_id,account_id,company_id,branch_id,debit_amount,credit_amount,foreign_amount,currency_code,exchange_rate,description,party_id)
      VALUES(v_je_id,v_acc_vat,new.company_id,new.branch_id,0,v_base_tax,new.tax_amount,new.currency_code,COALESCE(new.exchange_rate,1),
             'استرداد ضريبة مشتريات - '||COALESCE(new.invoice_number,''),NULL);
    END IF;
  END IF;

  IF v_je_id IS NOT NULL THEN
    UPDATE journal_entries SET status = 'posted' WHERE id = v_je_id;
  END IF;

  RETURN new;
END;
$$;


-- 1.2 Weighted Average Cost (WAC) Unification
-- Trigger on inventory_transactions to recalculate WAC on purchases, transfer_in, adj_in, opening
CREATE OR REPLACE FUNCTION public.fn_update_weighted_avg_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_old_qty numeric;
  v_old_avg numeric;
  v_new_avg numeric;
  v_company_id uuid;
BEGIN
  -- [AUDIT FIX 1.2] Include transfer_in, adj_in, opening in addition to purchase
  IF new.transaction_type IN ('purchase', 'transfer_in', 'adj_in', 'opening') 
     AND new.quantity > 0 AND COALESCE(new.unit_cost, 0) > 0 THEN

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

    INSERT INTO public.product_stock (
      product_id, warehouse_id, quantity, weighted_avg_cost, company_id, updated_by
    ) VALUES (
      new.product_id, new.warehouse_id, 0, v_new_avg, v_company_id, new.created_by
    )
    ON CONFLICT (company_id, product_id, warehouse_id) DO UPDATE
    SET weighted_avg_cost = EXCLUDED.weighted_avg_cost,
        updated_at = now();

    -- Also update general products cost_price if purchase
    IF new.transaction_type = 'purchase' THEN
      UPDATE public.products
      SET cost_price = v_new_avg,
          purchase_price = new.unit_cost
      WHERE id = new.product_id
        AND company_id = v_company_id;
    END IF;
  END IF;

  RETURN new;
END;
$function$;


-- Standardize get_stock_valuation() to use warehouse-level weighted_avg_cost
CREATE OR REPLACE FUNCTION public.get_stock_valuation(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result json;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  WITH warehouse_totals AS (
    SELECT
      w.id AS warehouse_id,
      w.name_ar AS warehouse_name,
      COALESCE(SUM(ps.quantity * COALESCE(NULLIF(ps.weighted_avg_cost, 0), p.cost_price, 0)), 0)::numeric AS value,
      COALESCE(SUM(ps.quantity), 0)::numeric AS qty
    FROM public.product_stock ps
    JOIN public.products p ON p.id = ps.product_id
    JOIN public.warehouses w ON w.id = ps.warehouse_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND w.deleted_at IS NULL
      AND ps.quantity > 0
    GROUP BY w.id, w.name_ar
  ),
  overall_totals AS (
    SELECT
      COALESCE(SUM(ps.quantity * COALESCE(NULLIF(ps.weighted_avg_cost, 0), p.cost_price, 0)), 0)::numeric AS total_val,
      COUNT(DISTINCT p.id)::bigint AS total_items_count,
      COALESCE(SUM(ps.quantity), 0)::numeric AS total_quantity
    FROM public.product_stock ps
    JOIN public.products p ON p.id = ps.product_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND ps.quantity > 0
  )
  SELECT json_build_object(
    'total_value',    ROUND(ot.total_val, 2),
    'total_items',    ot.total_items_count,
    'total_products', ot.total_items_count,
    'total_qty',      ROUND(ot.total_quantity, 2),
    'total_stock',    ROUND(ot.total_quantity, 2),
    'warehouses',     COALESCE((
      SELECT json_agg(json_build_object(
        'warehouse_id',   wt.warehouse_id,
        'warehouse_name', wt.warehouse_name,
        'total_value',    ROUND(wt.value, 2),
        'total_items',    wt.qty
      ))
      FROM warehouse_totals wt
    ), '[]'::json)
  ) INTO v_result
  FROM overall_totals ot;

  RETURN v_result;
END;
$$;


-- Standardize calculate_product_cogs():
-- Filter strictly status IN ('posted','paid','partially_paid'), subtract returns, and link with WAC
CREATE OR REPLACE FUNCTION public.calculate_product_cogs(p_company_id uuid, p_product_id uuid)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  total_purchased numeric,
  total_cost_sar numeric,
  avg_cost_sar numeric,
  qty_sold numeric,
  cogs_sar numeric,
  current_stock numeric,
  stock_value_sar numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM public.verify_company_access(p_company_id);

  RETURN QUERY
  WITH
  purchases AS (
    SELECT
      ii.product_id,
      SUM(CASE WHEN inv.type = 'purchase' THEN ii.quantity ELSE -ii.quantity END) AS total_qty,
      SUM(CASE WHEN inv.type = 'purchase' 
               THEN ii.quantity * ii.cost_price * inv.exchange_rate 
               ELSE -(ii.quantity * ii.cost_price * inv.exchange_rate) END) AS total_cost
    FROM invoice_items ii
    JOIN invoices inv ON inv.id = ii.invoice_id
    WHERE inv.company_id = p_company_id
      AND inv.type IN ('purchase', 'purchase_return', 'return_purchase')
      AND inv.status IN ('posted', 'paid', 'partially_paid')
      AND ii.product_id = p_product_id
      AND inv.deleted_at IS NULL
    GROUP BY ii.product_id
  ),
  sales AS (
    SELECT
      ii.product_id,
      SUM(CASE WHEN inv.type = 'sale' THEN ii.quantity ELSE -ii.quantity END) AS qty_sold
    FROM invoice_items ii
    JOIN invoices inv ON inv.id = ii.invoice_id
    WHERE inv.company_id = p_company_id
      AND inv.type IN ('sale', 'sale_return', 'return_sale')
      AND inv.status IN ('posted', 'paid', 'partially_paid')
      AND ii.product_id = p_product_id
      AND inv.deleted_at IS NULL
    GROUP BY ii.product_id
  ),
  stock AS (
    SELECT 
      ps.product_id, 
      SUM(ps.quantity) AS current_qty,
      SUM(ps.quantity * COALESCE(NULLIF(ps.weighted_avg_cost, 0), p.cost_price, 0)) AS current_val
    FROM product_stock ps
    JOIN products p ON p.id = ps.product_id
    WHERE ps.company_id = p_company_id AND ps.product_id = p_product_id
    GROUP BY ps.product_id
  )
  SELECT
    p.id,
    p.name_ar::text,
    COALESCE(pu.total_qty, 0),
    COALESCE(pu.total_cost, 0),
    CASE WHEN COALESCE(pu.total_qty,0) > 0
         THEN ROUND(pu.total_cost / pu.total_qty, 4) 
         ELSE COALESCE(p.cost_price, 0) END,
    COALESCE(s.qty_sold, 0),
    ROUND(COALESCE(s.qty_sold, 0) *
      CASE WHEN COALESCE(pu.total_qty,0) > 0
           THEN pu.total_cost / pu.total_qty 
           ELSE COALESCE(p.cost_price, 0) END, 2),
    COALESCE(st.current_qty, 0),
    ROUND(COALESCE(st.current_val, 0), 2)
  FROM products p
  LEFT JOIN purchases pu ON pu.product_id = p.id
  LEFT JOIN sales s      ON s.product_id  = p.id
  LEFT JOIN stock st     ON st.product_id = p.id
  WHERE p.id = p_product_id AND p.company_id = p_company_id;
END;
$function$;


-- Standardize commit_sales_invoice_v2() to look up warehouse-level weighted_avg_cost
-- and ignore unverified client cost_price overrides
CREATE OR REPLACE FUNCTION public.commit_sales_invoice_v2(
  p_company_id uuid,
  p_branch_id uuid,
  p_party_id uuid,
  p_invoice_number text,
  p_issue_date date,
  p_payment_method text,
  p_items jsonb,
  p_payments jsonb,
  p_created_by uuid,
  p_notes text DEFAULT NULL,
  p_currency_code text DEFAULT 'SAR',
  p_exchange_rate numeric DEFAULT 1,
  p_due_date date DEFAULT NULL,
  p_credit_limit numeric DEFAULT 0,
  p_allow_credit_breach boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_company_id uuid;
  v_invoice_id uuid;
  v_item record;
  v_payment record;
  v_subtotal numeric(18,2) := 0;
  v_tax_total numeric(18,2) := 0;
  v_discount_total numeric(18,2) := 0;
  v_grand_total numeric(18,2) := 0;
  v_paid_total numeric(18,2) := 0;
  v_remaining_amount numeric(18,2) := 0;
  v_current_debt numeric(18,2) := 0;
  v_party_credit_limit numeric(18,2) := 0;
  v_party_name text;
  v_line_net numeric(18,2);
  v_line_tax numeric(18,2);
  v_line_total numeric(18,2);
  v_product_name text;
  v_product_sku text;
  v_db_price numeric(18,2);
  v_sale_cost numeric(18,4);
  v_avail_stock numeric(18,4);
  v_default_warehouse_id uuid;
  v_target_warehouse_id uuid;
  v_client_cost_fallback numeric(18,4);
BEGIN
  v_company_id := p_company_id;
  PERFORM public.fn_assert_company_access(v_company_id);

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'لا يمكن إنشاء فاتورة مبيعات بدون أصناف';
  END IF;

  SELECT id INTO v_default_warehouse_id
  FROM public.warehouses
  WHERE branch_id = p_branch_id AND company_id = v_company_id AND deleted_at IS NULL
  ORDER BY is_primary DESC, created_at ASC LIMIT 1;

  IF v_default_warehouse_id IS NULL THEN
    SELECT id INTO v_default_warehouse_id
    FROM public.warehouses
    WHERE company_id = v_company_id AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC LIMIT 1;
  END IF;

  -- Validate items and lock stock
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric,
      warehouse_id uuid, cost_price numeric, discount_amount numeric)
  LOOP
    IF v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'الكمية المدخلة غير صحيحة (%) للصنف', v_item.quantity;
    END IF;

    v_target_warehouse_id := COALESCE(v_item.warehouse_id, v_default_warehouse_id);

    SELECT name_ar, sku, sale_price, cost_price
    INTO v_product_name, v_product_sku, v_db_price, v_client_cost_fallback
    FROM public.products
    WHERE id = v_item.product_id AND company_id = v_company_id;

    IF v_product_name IS NULL THEN
      RAISE EXCEPTION 'الصنف المحدد غير موجود أو لا ينتمي لهذه الشركة (%)', v_item.product_id;
    END IF;

    -- [AUDIT FIX 1.2] Look up warehouse weighted_avg_cost directly from product_stock
    SELECT COALESCE(ps.quantity, 0), COALESCE(NULLIF(ps.weighted_avg_cost, 0), v_client_cost_fallback, 0)
    INTO v_avail_stock, v_sale_cost
    FROM public.product_stock ps
    WHERE ps.company_id = v_company_id
      AND ps.product_id = v_item.product_id
      AND ps.warehouse_id = v_target_warehouse_id
    FOR UPDATE;

    IF v_avail_stock IS NULL THEN
      v_avail_stock := 0;
      v_sale_cost := COALESCE(v_client_cost_fallback, 0);
    END IF;

    IF v_avail_stock < v_item.quantity THEN
      RAISE EXCEPTION 'الكمية المتوفرة بالمستودع للصنف % (%s) هي % فقط، المطلوب %',
        v_product_name, COALESCE(v_product_sku,''), v_avail_stock, v_item.quantity;
    END IF;

    v_line_net := GREATEST(0, v_item.quantity * v_item.unit_price - COALESCE(v_item.discount_amount, 0));
    v_line_tax := round(v_line_net * (COALESCE(v_item.tax_rate, 0) / 100.0), 2);
    v_line_total := round(v_line_net + v_line_tax, 2);

    v_subtotal := v_subtotal + round(v_item.quantity * v_item.unit_price, 2);
    v_discount_total := v_discount_total + COALESCE(v_item.discount_amount, 0);
    v_tax_total := v_tax_total + v_line_tax;
    v_grand_total := v_grand_total + v_line_total;
  END LOOP;

  -- Validate payments
  IF p_payments IS NOT NULL AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_payment IN SELECT * FROM jsonb_to_recordset(p_payments) AS
      x(amount numeric, payment_method text, account_id uuid)
    LOOP
      IF v_payment.amount > 0 THEN
        v_paid_total := v_paid_total + v_payment.amount;
      END IF;
    END LOOP;
  ELSIF p_payment_method = 'cash' THEN
    v_paid_total := v_grand_total;
  END IF;

  v_remaining_amount := GREATEST(0, v_grand_total - v_paid_total);

  -- Credit validation for parties
  IF v_remaining_amount > 0 AND p_party_id IS NOT NULL THEN
    SELECT name, credit_limit INTO v_party_name, v_party_credit_limit
    FROM public.parties WHERE id = p_party_id AND company_id = v_company_id;

    SELECT COALESCE(balance, 0) INTO v_current_debt
    FROM public.party_balances WHERE party_id = p_party_id;

    IF v_party_credit_limit > 0 AND NOT p_allow_credit_breach THEN
      IF (COALESCE(v_current_debt, 0) + v_remaining_amount) > v_party_credit_limit THEN
        RAISE EXCEPTION 'تجاوز حد الائتمان للعميل %! الحد المسموح: %، الرصيد الحالي: %، المتبقي من الفاتورة: %',
          v_party_name, v_party_credit_limit, v_current_debt, v_remaining_amount;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.invoices (
    company_id, branch_id, party_id, invoice_number, issue_date, due_date,
    type, payment_method, status, subtotal, discount_amount, tax_amount,
    total_amount, paid_amount, currency_code, exchange_rate, notes, created_by
  ) VALUES (
    v_company_id, p_branch_id, p_party_id, p_invoice_number, p_issue_date, p_due_date,
    'sale', p_payment_method, 'draft', v_subtotal, v_discount_total, v_tax_total,
    v_grand_total, v_paid_total, p_currency_code, p_exchange_rate, p_notes, p_created_by
  ) RETURNING id INTO v_invoice_id;

  -- Create invoice items with warehouse WAC cost_price
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric,
      warehouse_id uuid, cost_price numeric, discount_amount numeric)
  LOOP
    v_target_warehouse_id := COALESCE(v_item.warehouse_id, v_default_warehouse_id);

    SELECT COALESCE(NULLIF(ps.weighted_avg_cost, 0), p.cost_price, 0)
    INTO v_sale_cost
    FROM public.products p
    LEFT JOIN public.product_stock ps
      ON ps.product_id = p.id
     AND ps.warehouse_id = v_target_warehouse_id
     AND ps.company_id = v_company_id
    WHERE p.id = v_item.product_id AND p.company_id = v_company_id;

    v_line_net := GREATEST(0, v_item.quantity * v_item.unit_price - COALESCE(v_item.discount_amount, 0));
    v_line_tax := round(v_line_net * (COALESCE(v_item.tax_rate, 0) / 100.0), 2);
    v_line_total := round(v_line_net + v_line_tax, 2);

    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, cost_price,
      discount_amount, tax_amount, total, company_id
    ) VALUES (
      v_invoice_id, v_item.product_id, v_item.quantity, v_item.unit_price,
      COALESCE(v_sale_cost, 0),
      COALESCE(v_item.discount_amount, 0),
      v_line_tax,
      v_line_total,
      v_company_id
    );

    -- Single inventory ledger mutation: trigger handles stock update
    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity, unit_cost, total_cost,
      transaction_type, reference_type, reference_id, created_by
    ) VALUES (
      v_company_id, v_item.product_id, v_target_warehouse_id,
      -ABS(v_item.quantity), COALESCE(v_sale_cost, 0),
      ROUND(-ABS(v_item.quantity) * COALESCE(v_sale_cost, 0), 4),
      'sales', 'sale_invoice', v_invoice_id, p_created_by
    );
  END LOOP;

  PERFORM set_config('app.rpc_authorized', 'true', true);

  UPDATE public.invoices
  SET status = CASE WHEN v_remaining_amount <= 0 THEN 'paid'
                    WHEN v_paid_total > 0 THEN 'partially_paid'
                    ELSE 'posted' END,
      updated_at = now()
  WHERE id = v_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'invoice_number', p_invoice_number,
    'total_amount', v_grand_total,
    'paid_amount', v_paid_total,
    'remaining_amount', v_remaining_amount
  );
END;
$function$;


-- 1.3 Journal Entry Header Transition Guard
-- Prevents posting an empty or unbalanced journal entry via direct UPDATE on journal_entries
CREATE OR REPLACE FUNCTION public.fn_guard_journal_entry_posting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_line_count integer;
  v_sum_debit numeric(18,4);
  v_sum_credit numeric(18,4);
  v_invalid_accounts integer;
  v_caller_role text;
  v_is_authorized boolean := false;
BEGIN
  -- Only enforce when transitioning to 'posted'
  IF NEW.status = 'posted' AND (OLD.status IS NULL OR OLD.status != 'posted') THEN

    -- 1. Role validation: Must be owner, admin, accountant or called from authorized internal RPC
    IF current_setting('app.rpc_authorized', true) = 'true' THEN
      v_is_authorized := true;
    ELSIF is_super_admin() THEN
      v_is_authorized := true;
    ELSE
      SELECT role INTO v_caller_role
      FROM public.user_company_roles
      WHERE user_id = (SELECT auth.uid()) AND company_id = NEW.company_id
      LIMIT 1;

      IF v_caller_role IN ('owner', 'admin', 'accountant') THEN
        v_is_authorized := true;
      END IF;
    END IF;

    IF NOT v_is_authorized THEN
      RAISE EXCEPTION 'access_denied: ليس لديك صلاحية ترحيل قيود اليومية. يتطلب دور (محاسب / مدير / مالك)';
    END IF;

    -- 2. Audit check: Ensure at least 2 active lines exist
    SELECT 
      COUNT(*), 
      COALESCE(SUM(debit_amount), 0), 
      COALESCE(SUM(credit_amount), 0)
    INTO v_line_count, v_sum_debit, v_sum_credit
    FROM public.journal_entry_lines
    WHERE journal_entry_id = NEW.id AND deleted_at IS NULL;

    IF v_line_count < 2 THEN
      RAISE EXCEPTION 'accounting_error: لا يمكن ترحيل قيد يومية فارغ أو يحتوي على أقل من سطرين (عدد السطور الحالية: %)', v_line_count;
    END IF;

    IF v_sum_debit <= 0 THEN
      RAISE EXCEPTION 'accounting_error: إجمالي مدين القيد يجب أن يكون أكبر من الصفر (المدين: %)', v_sum_debit;
    END IF;

    IF ABS(v_sum_debit - v_sum_credit) >= 0.005 THEN
      RAISE EXCEPTION 'accounting_error: القيد غير متوازن! إجمالي المدين (%) لا يساوي إجمالي الدائن (%)، الفرق: %',
        v_sum_debit, v_sum_credit, ABS(v_sum_debit - v_sum_credit);
    END IF;

    -- 3. Verify accounts validity and posting permission
    SELECT COUNT(*) INTO v_invalid_accounts
    FROM public.journal_entry_lines jel
    JOIN public.accounts a ON a.id = jel.account_id
    WHERE jel.journal_entry_id = NEW.id
      AND jel.deleted_at IS NULL
      AND (a.deleted_at IS NOT NULL OR a.is_active = false OR a.allow_posting = false OR a.company_id != NEW.company_id);

    IF v_invalid_accounts > 0 THEN
      RAISE EXCEPTION 'accounting_error: يحتوي القيد على حسابات غير مسموح بالترحيل عليها أو لا تنتمي لنفس الشركة';
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_journal_entry_posting ON public.journal_entries;
CREATE TRIGGER trg_guard_journal_entry_posting
BEFORE UPDATE OF status ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_journal_entry_posting();


-- ============================================================================
-- SECTION 2: SECURITY & RBAC TABLE LOCKDOWN
-- ============================================================================

-- 2.1 Guard Direct Status Mutations on invoices
CREATE OR REPLACE FUNCTION public.fn_guard_invoice_status_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role text;
  v_is_authorized boolean := false;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('posted', 'void', 'cancelled') OR OLD.status IN ('posted', 'void', 'cancelled') THEN
      IF current_setting('app.rpc_authorized', true) = 'true' THEN
        v_is_authorized := true;
      ELSIF is_super_admin() THEN
        v_is_authorized := true;
      ELSE
        SELECT role INTO v_caller_role
        FROM public.user_company_roles
        WHERE user_id = (SELECT auth.uid()) AND company_id = NEW.company_id
        LIMIT 1;

        IF v_caller_role IN ('owner', 'admin', 'accountant') THEN
          v_is_authorized := true;
        END IF;
      END IF;

      IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'access_denied: لا يسمح بتعديل حالة الفاتورة مباشرة إلا للمحاسب أو المدير أو عبر الإجراءات المعتمدة (void_invoice / commit_sales_invoice)';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoice_status_mutation ON public.invoices;
CREATE TRIGGER trg_guard_invoice_status_mutation
BEFORE UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_invoice_status_mutation();


-- Guard Direct Status Mutations on payments (Financial Bonds)
CREATE OR REPLACE FUNCTION public.fn_guard_payment_status_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role text;
  v_is_authorized boolean := false;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('posted', 'void', 'cancelled') OR OLD.status IN ('posted', 'void', 'cancelled') THEN
      IF current_setting('app.rpc_authorized', true) = 'true' THEN
        v_is_authorized := true;
      ELSIF is_super_admin() THEN
        v_is_authorized := true;
      ELSE
        SELECT role INTO v_caller_role
        FROM public.user_company_roles
        WHERE user_id = (SELECT auth.uid()) AND company_id = NEW.company_id
        LIMIT 1;

        IF v_caller_role IN ('owner', 'admin', 'manager', 'accountant') THEN
          v_is_authorized := true;
        END IF;
      END IF;

      IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'access_denied: لا يسمح بتعديل حالة السند المالي مباشرة إلا للمحاسب أو المدير أو عبر void_bond';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_payment_status_mutation ON public.payments;
CREATE TRIGGER trg_guard_payment_status_mutation
BEFORE UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_payment_status_mutation();


-- 2.2 Guard Expenses Status Mutations and Deletions
CREATE OR REPLACE FUNCTION public.fn_guard_expense_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status != 'draft' THEN
      RAISE EXCEPTION 'accounting_error: لا يمكن حذف مصروف مرحل أو ملغى (الحالة: %). يجب استخدام void_expense لإنشاء قيد عكسي.', OLD.status;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF current_setting('app.rpc_authorized', true) != 'true' AND NOT is_super_admin() THEN
        SELECT role INTO v_caller_role
        FROM public.user_company_roles
        WHERE user_id = (SELECT auth.uid()) AND company_id = NEW.company_id
        LIMIT 1;

        IF v_caller_role NOT IN ('owner', 'admin', 'accountant') THEN
          RAISE EXCEPTION 'access_denied: لا تملك صلاحية تعديل حالة المصروفات. استخدم دالة void_expense الرسمية.';
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_expense_mutation ON public.expenses;
CREATE TRIGGER trg_guard_expense_mutation
BEFORE UPDATE OF status OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_expense_mutation();


-- 2.3 Fiscal Years Owner-Only Lockdown
CREATE OR REPLACE FUNCTION public.fn_guard_fiscal_years_lockdown()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role text;
  v_company_id uuid;
BEGIN
  v_company_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;

  IF is_super_admin() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT role INTO v_caller_role
  FROM public.user_company_roles
  WHERE user_id = (SELECT auth.uid()) AND company_id = v_company_id
  LIMIT 1;

  IF v_caller_role != 'owner' THEN
    RAISE EXCEPTION 'access_denied: تعديل أو حذف السنوات المالية وإغلاقها مقتصر فقط على مالك الشركة (owner).';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_fiscal_years_lockdown ON public.fiscal_years;
CREATE TRIGGER trg_guard_fiscal_years_lockdown
BEFORE UPDATE OR DELETE ON public.fiscal_years
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_fiscal_years_lockdown();


-- 2.4 Fixed Assets Concurrency & RBAC Lockdown
-- Enforce FOR UPDATE in fn_post_asset_depreciation()
CREATE OR REPLACE FUNCTION public.fn_post_asset_depreciation(
  p_asset_id   uuid,
  p_period_date date DEFAULT CURRENT_DATE,
  p_created_by  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_asset                  RECORD;
  v_company_id             uuid;
  v_branch_id              uuid;
  v_base_currency          text;
  v_monthly_amount         numeric;
  v_depreciable_base       numeric;
  v_remaining_depreciable  numeric;
  v_depr_amount            numeric;
  v_je_id                  uuid;
  v_current_user_id        uuid;
BEGIN
  -- [AUDIT FIX 1.4] Lock asset row FOR UPDATE to prevent concurrency race
  SELECT * INTO v_asset 
  FROM public.fixed_assets 
  WHERE id = p_asset_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'asset_not_found: الأصل الثابت غير موجود';
  END IF;

  v_company_id := v_asset.company_id;
  PERFORM public.fn_assert_company_access(v_company_id);

  IF v_asset.status != 'active' THEN
    RAISE EXCEPTION 'asset_not_active: الأصل الثابت ليس في حالة نشطة (%): لا يمكن إهلاكه', v_asset.status;
  END IF;

  IF v_asset.last_depreciation_date IS NOT NULL
     AND DATE_TRUNC('month', v_asset.last_depreciation_date) = DATE_TRUNC('month', p_period_date) THEN
    RAISE EXCEPTION 'already_depreciated: تم احتساب إهلاك هذا الأصل لنفس الشهر مسبقاً (تاريخ الإهلاك السابق: %)', v_asset.last_depreciation_date;
  END IF;

  IF v_asset.salvage_value > v_asset.purchase_cost THEN
    RAISE EXCEPTION 'invalid_salvage_value: قيمة الخردة لا يمكن أن تتجاوز تكلفة الشراء';
  END IF;

  v_depreciable_base      := v_asset.purchase_cost - v_asset.salvage_value;
  v_remaining_depreciable := v_depreciable_base - v_asset.total_depreciated;

  IF v_remaining_depreciable <= 0 THEN
    UPDATE public.fixed_assets SET status = 'fully_depreciated', updated_at = NOW() WHERE id = v_asset.id;
    RETURN jsonb_build_object('success', false, 'message', 'تم استنفاد إهلاك هذا الأصل بالكامل');
  END IF;

  v_monthly_amount := ROUND(v_depreciable_base / v_asset.useful_life_months, 2);
  v_depr_amount    := LEAST(v_monthly_amount, v_remaining_depreciable);

  IF v_depr_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'مبلغ الإهلاك المحسوب يساوي صفر');
  END IF;

  SELECT base_currency INTO v_base_currency FROM public.companies WHERE id = v_company_id;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  v_branch_id       := COALESCE(v_asset.branch_id,
    (SELECT id FROM public.branches WHERE company_id = v_company_id AND is_main = true LIMIT 1));
  v_current_user_id := COALESCE(p_created_by, (SELECT auth.uid()));

  PERFORM set_config('app.rpc_authorized', 'true', true);

  INSERT INTO public.journal_entries (
    company_id, branch_id, entry_date, description,
    reference_type, reference_id, status, created_by
  )
  VALUES (
    v_company_id, v_branch_id, p_period_date,
    'إهلاك دوري للأصل: ' || v_asset.name || ' (' || v_asset.asset_code || ') لفترة ' || TO_CHAR(p_period_date, 'YYYY-MM'),
    'asset_depreciation', v_asset.id, 'posted', v_current_user_id
  )
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, branch_id, company_id,
    debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount
  )
  VALUES
  (
    v_je_id, v_asset.depreciation_expense_account_id, v_branch_id, v_company_id,
    v_depr_amount, 0,
    'مصروف إهلاك: ' || v_asset.name, v_base_currency, 1, 0
  ),
  (
    v_je_id, v_asset.accumulated_depr_account_id, v_branch_id, v_company_id,
    0, v_depr_amount,
    'مجمع إهلاك: ' || v_asset.name, v_base_currency, 1, 0
  );

  INSERT INTO public.fixed_asset_depreciations (
    company_id, asset_id, period_date, amount, journal_entry_id, created_by
  )
  VALUES (
    v_company_id, v_asset.id, p_period_date, v_depr_amount, v_je_id, v_current_user_id
  );

  UPDATE public.fixed_assets
  SET total_depreciated = total_depreciated + v_depr_amount,
      book_value = purchase_cost - (total_depreciated + v_depr_amount),
      last_depreciation_date = p_period_date,
      status = CASE WHEN (total_depreciated + v_depr_amount) >= v_depreciable_base THEN 'fully_depreciated' ELSE 'active' END,
      updated_at = NOW()
  WHERE id = v_asset.id;

  RETURN jsonb_build_object(
    'success', true,
    'asset_id', v_asset.id,
    'period_date', p_period_date,
    'depreciation_amount', v_depr_amount,
    'journal_entry_id', v_je_id
  );
END;
$function$;

-- Add unique constraint to prevent duplicate depreciation records for the same asset in the same period
CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_asset_depreciations_asset_period 
ON public.fixed_asset_depreciations(asset_id, period_date);

-- Restrict fixed assets mutation to authorized roles (owner, admin, accountant)
DROP POLICY IF EXISTS fixed_assets_write_policy ON public.fixed_assets;
CREATE POLICY fixed_assets_write_policy ON public.fixed_assets
FOR ALL TO authenticated
USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = (SELECT auth.uid()) AND ucr.company_id = fixed_assets.company_id
      AND ucr.role IN ('owner', 'admin', 'accountant')
  )
)
WITH CHECK (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = (SELECT auth.uid()) AND ucr.company_id = fixed_assets.company_id
      AND ucr.role IN ('owner', 'admin', 'accountant')
  )
);

DROP POLICY IF EXISTS fixed_asset_depreciations_write_policy ON public.fixed_asset_depreciations;
CREATE POLICY fixed_asset_depreciations_write_policy ON public.fixed_asset_depreciations
FOR ALL TO authenticated
USING (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = (SELECT auth.uid()) AND ucr.company_id = fixed_asset_depreciations.company_id
      AND ucr.role IN ('owner', 'admin', 'accountant')
  )
)
WITH CHECK (
  is_super_admin() OR EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = (SELECT auth.uid()) AND ucr.company_id = fixed_asset_depreciations.company_id
      AND ucr.role IN ('owner', 'admin', 'accountant')
  )
);


-- 2.5 Security Invoker on party_balances and party_balances_by_currency
-- Ensures tenant RLS policies on parties and journal entries are strictly enforced
ALTER VIEW IF EXISTS public.party_balances SET (security_invoker = true);
ALTER VIEW IF EXISTS public.party_balances_by_currency SET (security_invoker = true);


-- 2.6 Revoke anon Execution Privileges from all public routines
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
  ) LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, PUBLIC;', r.nspname, r.proname, r.args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role;', r.nspname, r.proname, r.args);
    EXCEPTION WHEN OTHERS THEN
      -- ignore if function cannot be altered
    END;
  END LOOP;
END $$;


-- 2.7 Search Path Hardening on Flagged Functions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_credit_sale_general_customer' AND pronamespace = 'public'::regnamespace) THEN
    ALTER FUNCTION public.prevent_credit_sale_general_customer() SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_invoice_currency' AND pronamespace = 'public'::regnamespace) THEN
    ALTER FUNCTION public.validate_invoice_currency() SET search_path = public, pg_temp;
  END IF;

  -- Drop legacy placeholder function if found
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'your_function_name' AND pronamespace = 'public'::regnamespace) THEN
    DROP FUNCTION public.your_function_name();
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'wael_mig' AND p.proname = 'apply_currency_fix') THEN
    ALTER FUNCTION wael_mig.apply_currency_fix() SET search_path = public, pg_temp;
  END IF;
END $$;


-- 2.8 RLS on gn_sync.config
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'gn_sync' AND table_name = 'config') THEN
    EXECUTE 'ALTER TABLE gn_sync.config ENABLE ROW LEVEL SECURITY;';
    EXECUTE 'DROP POLICY IF EXISTS gn_sync_config_admin_policy ON gn_sync.config;';
    EXECUTE 'CREATE POLICY gn_sync_config_admin_policy ON gn_sync.config FOR ALL TO authenticated USING (is_super_admin() OR EXISTS (SELECT 1 FROM public.user_company_roles ucr WHERE ucr.user_id = (SELECT auth.uid()) AND ucr.role IN (''owner'', ''admin'')));';
  END IF;
END $$;


-- ============================================================================
-- SECTION 3: PERFORMANCE OPTIMIZATION (auth.uid() InitPlan & FK Indexes)
-- ============================================================================

-- 3.1 Optimize auth.uid() in RLS policies to prevent per-row re-evaluation
DROP POLICY IF EXISTS parties_select ON public.parties;
CREATE POLICY parties_select ON public.parties
FOR SELECT TO authenticated
USING (
  is_super_admin() OR (
    (company_id IN (SELECT get_auth_companies())) AND (
      (EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        WHERE ucr.user_id = (SELECT auth.uid()) AND ucr.company_id = parties.company_id
          AND ucr.role = ANY (ARRAY['owner'::text, 'admin'::text]) AND ucr.branch_id IS NULL
      )) OR (
        (branch_id IS NOT NULL) AND (branch_id IN (SELECT get_auth_branches(parties.company_id)))
      )
    )
  )
);

DROP POLICY IF EXISTS parties_update ON public.parties;
CREATE POLICY parties_update ON public.parties
FOR UPDATE TO authenticated
USING (
  is_super_admin() OR (
    (company_id IN (SELECT get_auth_companies())) AND (
      (EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        WHERE ucr.user_id = (SELECT auth.uid()) AND ucr.company_id = parties.company_id
          AND ucr.role = ANY (ARRAY['owner'::text, 'admin'::text]) AND ucr.branch_id IS NULL
      )) OR (
        (branch_id IS NOT NULL) AND (branch_id IN (SELECT get_auth_branches(parties.company_id)))
      )
    )
  )
)
WITH CHECK (
  is_super_admin() OR (
    (company_id IN (SELECT get_auth_companies())) AND (
      (EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        WHERE ucr.user_id = (SELECT auth.uid()) AND ucr.company_id = parties.company_id
          AND ucr.role = ANY (ARRAY['owner'::text, 'admin'::text]) AND ucr.branch_id IS NULL
      )) OR (
        (branch_id IS NOT NULL) AND (branch_id IN (SELECT get_auth_branches(parties.company_id)))
      )
    )
  )
);

DROP POLICY IF EXISTS party_opening_balances_select ON public.party_opening_balances;
CREATE POLICY party_opening_balances_select ON public.party_opening_balances
FOR SELECT TO authenticated
USING (
  is_super_admin() OR (
    (company_id IN (SELECT get_auth_companies())) AND (
      (EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        WHERE ucr.user_id = (SELECT auth.uid()) AND ucr.company_id = party_opening_balances.company_id
          AND ucr.role = ANY (ARRAY['owner'::text, 'admin'::text]) AND ucr.branch_id IS NULL
      )) OR (
        (branch_id IS NOT NULL) AND (branch_id IN (SELECT get_auth_branches(party_opening_balances.company_id)))
      )
    )
  )
);

DROP POLICY IF EXISTS inv_intelligence_config_company_policy ON public.inv_intelligence_config;
CREATE POLICY inv_intelligence_config_company_policy ON public.inv_intelligence_config
FOR ALL TO authenticated
USING (company_id IN (SELECT ucr.company_id FROM public.user_company_roles ucr WHERE ucr.user_id = (SELECT auth.uid())))
WITH CHECK (company_id IN (SELECT ucr.company_id FROM public.user_company_roles ucr WHERE ucr.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS inv_intelligence_runs_company_policy ON public.inv_intelligence_runs;
CREATE POLICY inv_intelligence_runs_company_policy ON public.inv_intelligence_runs
FOR ALL TO authenticated
USING (company_id IN (SELECT ucr.company_id FROM public.user_company_roles ucr WHERE ucr.user_id = (SELECT auth.uid())))
WITH CHECK (company_id IN (SELECT ucr.company_id FROM public.user_company_roles ucr WHERE ucr.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS inv_demand_forecasts_company_policy ON public.inv_demand_forecasts;
CREATE POLICY inv_demand_forecasts_company_policy ON public.inv_demand_forecasts
FOR ALL TO authenticated
USING (company_id IN (SELECT ucr.company_id FROM public.user_company_roles ucr WHERE ucr.user_id = (SELECT auth.uid())))
WITH CHECK (company_id IN (SELECT ucr.company_id FROM public.user_company_roles ucr WHERE ucr.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS inv_model_evaluations_company_policy ON public.inv_model_evaluations;
CREATE POLICY inv_model_evaluations_company_policy ON public.inv_model_evaluations
FOR ALL TO authenticated
USING (company_id IN (SELECT ucr.company_id FROM public.user_company_roles ucr WHERE ucr.user_id = (SELECT auth.uid())))
WITH CHECK (company_id IN (SELECT ucr.company_id FROM public.user_company_roles ucr WHERE ucr.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS inv_intelligence_recommendations_company_policy ON public.inv_intelligence_recommendations;
CREATE POLICY inv_intelligence_recommendations_company_policy ON public.inv_intelligence_recommendations
FOR ALL TO authenticated
USING (company_id IN (SELECT ucr.company_id FROM public.user_company_roles ucr WHERE ucr.user_id = (SELECT auth.uid())))
WITH CHECK (company_id IN (SELECT ucr.company_id FROM public.user_company_roles ucr WHERE ucr.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS inv_daily_avail_company_policy ON public.inv_daily_availability_snapshots;
CREATE POLICY inv_daily_avail_company_policy ON public.inv_daily_availability_snapshots
FOR ALL TO authenticated
USING (company_id IN (SELECT ucr.company_id FROM public.user_company_roles ucr WHERE ucr.user_id = (SELECT auth.uid())))
WITH CHECK (company_id IN (SELECT ucr.company_id FROM public.user_company_roles ucr WHERE ucr.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS inv_sched_jobs_company_policy ON public.inv_scheduled_jobs_log;
CREATE POLICY inv_sched_jobs_company_policy ON public.inv_scheduled_jobs_log
FOR ALL TO authenticated
USING (company_id IN (SELECT ucr.company_id FROM public.user_company_roles ucr WHERE ucr.user_id = (SELECT auth.uid())));


-- 3.2 Covering Indexes on Foreign Keys
CREATE INDEX IF NOT EXISTS idx_fk_debt_collector_assignments_assigned_by ON public.debt_collector_assignments(assigned_by);
CREATE INDEX IF NOT EXISTS idx_fk_debt_collector_assignments_collector_id ON public.debt_collector_assignments(collector_id);
CREATE INDEX IF NOT EXISTS idx_fk_debt_collector_assignments_party_id ON public.debt_collector_assignments(party_id);
CREATE INDEX IF NOT EXISTS idx_fk_debt_opt_outs_party_id ON public.debt_opt_outs(party_id);
CREATE INDEX IF NOT EXISTS idx_fk_debt_reminder_queue_party_id ON public.debt_reminder_queue(party_id);
CREATE INDEX IF NOT EXISTS idx_fk_inv_daily_availability_snapshots_warehouse_id ON public.inv_daily_availability_snapshots(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_inv_demand_forecasts_branch_id ON public.inv_demand_forecasts(branch_id);
CREATE INDEX IF NOT EXISTS idx_fk_inv_demand_forecasts_product_id ON public.inv_demand_forecasts(product_id);
CREATE INDEX IF NOT EXISTS idx_fk_inv_intelligence_config_updated_by ON public.inv_intelligence_config(updated_by);
CREATE INDEX IF NOT EXISTS idx_fk_inv_intelligence_recommendations_decided_by ON public.inv_intelligence_recommendations(decided_by);
CREATE INDEX IF NOT EXISTS idx_fk_inv_intelligence_recommendations_from_branch ON public.inv_intelligence_recommendations(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_fk_inv_intelligence_recommendations_linked_transfer ON public.inv_intelligence_recommendations(linked_transfer_id);
CREATE INDEX IF NOT EXISTS idx_fk_inv_intelligence_recommendations_supplier ON public.inv_intelligence_recommendations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_fk_inv_intelligence_recommendations_to_branch ON public.inv_intelligence_recommendations(to_branch_id);
CREATE INDEX IF NOT EXISTS idx_fk_inv_intelligence_runs_company_id ON public.inv_intelligence_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_fk_inv_intelligence_runs_triggered_by ON public.inv_intelligence_runs(triggered_by);
CREATE INDEX IF NOT EXISTS idx_fk_inv_model_evaluations_branch_id ON public.inv_model_evaluations(branch_id);
CREATE INDEX IF NOT EXISTS idx_fk_inv_model_evaluations_company_id ON public.inv_model_evaluations(company_id);
CREATE INDEX IF NOT EXISTS idx_fk_inv_model_evaluations_run_id ON public.inv_model_evaluations(run_id);
CREATE INDEX IF NOT EXISTS idx_fk_invoice_items_company_product ON public.invoice_items(company_id, product_id);
CREATE INDEX IF NOT EXISTS idx_fk_invoices_company_account ON public.invoices(company_id, payment_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_invoices_company_reference ON public.invoices(company_id, reference_invoice_id);
CREATE INDEX IF NOT EXISTS idx_fk_invoices_created_by ON public.invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_fk_invoices_currency_code ON public.invoices(currency_code);
CREATE INDEX IF NOT EXISTS idx_fk_invoices_payment_account_id ON public.invoices(payment_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_parties_category_id ON public.parties(category_id);
CREATE INDEX IF NOT EXISTS idx_fk_payments_counterparty_account_id ON public.payments(counterparty_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_payments_currency_code ON public.payments(currency_code);
CREATE INDEX IF NOT EXISTS idx_fk_product_cross_references_reviewed_by ON public.product_cross_references(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_fk_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_fk_products_classification_reviewed_by ON public.products(classification_reviewed_by);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_quotation_shipments_created_by ON public.purchase_quotation_shipments(created_by);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_quotation_shipments_dest_branch ON public.purchase_quotation_shipments(destination_branch_id);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_quotation_shipments_dest_warehouse ON public.purchase_quotation_shipments(destination_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_quotation_shipments_quotation_id ON public.purchase_quotation_shipments(quotation_id);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_quotation_shipments_req_branch ON public.purchase_quotation_shipments(requesting_branch_id);
