-- P1 Fixes:
-- 1. user_can_access_branch: Require company membership even when p_branch_id IS NULL (close cross-tenant bypass).
-- 2. create_stock_transfer: Validate both warehouses belong to p_company_id, are distinct, and caller can access source branch.
-- 3. commit_purchase_return: Scope warehouse selection to p_branch_id when provided, lock product_stock (FOR UPDATE),
--    and enforce sufficient stock before returning to supplier.
-- 4. fn_process_cross_branch_sale: Lock source product_stock (FOR UPDATE), enforce sufficient stock,
--    and fix transaction_type from 'sale' to 'sales' so trg_update_product_stock actually deducts stock.

CREATE OR REPLACE FUNCTION public.user_can_access_branch(p_company_id uuid, p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = auth.uid()
        AND ucr.company_id = p_company_id
        AND (
          p_branch_id IS NULL
          OR ucr.role IN ('owner', 'admin', 'manager')
          OR ucr.branch_id IS NULL
          OR ucr.branch_id = p_branch_id
        )
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  p_from_warehouse uuid,
  p_to_warehouse uuid,
  p_items jsonb,
  p_company_id uuid,
  p_user_id uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer_id uuid;
  v_item jsonb;
  v_from_branch_id uuid;
  v_to_branch_id uuid;
BEGIN
  IF p_from_warehouse = p_to_warehouse THEN
    RAISE EXCEPTION 'لا يمكن التحويل من وإلى نفس المستودع';
  END IF;

  SELECT branch_id INTO v_from_branch_id
  FROM public.warehouses
  WHERE id = p_from_warehouse AND company_id = p_company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستودع المصدر غير موجود أو لا يتبع هذه الشركة';
  END IF;

  SELECT branch_id INTO v_to_branch_id
  FROM public.warehouses
  WHERE id = p_to_warehouse AND company_id = p_company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستودع الوجهة غير موجود أو لا يتبع هذه الشركة';
  END IF;

  IF NOT public.user_can_access_branch(p_company_id, v_from_branch_id) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية التحويل من مستودع هذا الفرع';
  END IF;

  INSERT INTO public.stock_transfers (
    company_id, from_warehouse_id, to_warehouse_id, notes, status, created_by
  )
  VALUES (
    p_company_id, p_from_warehouse, p_to_warehouse, p_notes, 'pending', p_user_id
  ) RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.stock_transfer_items (
      transfer_id, company_id, product_id, quantity
    ) VALUES (
      v_transfer_id, p_company_id, (v_item->>'product_id')::uuid, (v_item->>'quantity')::numeric
    );
  END LOOP;

  PERFORM public.process_stock_transfer(v_transfer_id);

  PERFORM public.audit_write(
    'stock_transfer_created',
    'stock_transfers',
    v_transfer_id,
    p_company_id,
    jsonb_build_object(
      'source_warehouse_id', p_from_warehouse,
      'destination_warehouse_id', p_to_warehouse,
      'source_branch_id', v_from_branch_id,
      'destination_branch_id', v_to_branch_id
    )
  );

  RETURN jsonb_build_object('success', true, 'transfer_id', v_transfer_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.commit_purchase_return(
  p_company_id uuid,
  p_user_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_notes text,
  p_currency text,
  p_exchange_rate numeric,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_return_reason text DEFAULT NULL::text,
  p_reference_invoice_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_journal_id uuid;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_base_subtotal numeric := 0;
  v_base_total numeric := 0;
  v_payable_account_id uuid;
  v_inventory_account_id uuid;
  v_primary_wh_id uuid;
  v_item jsonb;
  v_product RECORD;
  v_avail_qty numeric;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'لا توجد أصناف في مرتجع المشتريات';
  END IF;

  SELECT id INTO v_payable_account_id FROM accounts
    WHERE company_id = p_company_id AND code = '2100' AND deleted_at IS NULL;
  IF v_payable_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب ذمم الموردين (2100) غير موجود';
  END IF;

  SELECT id INTO v_inventory_account_id FROM accounts
    WHERE company_id = p_company_id AND code = '1200' AND deleted_at IS NULL;
  IF v_inventory_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب المخزون (1200) غير موجود';
  END IF;

  -- Prefer the branch warehouse when p_branch_id is specified
  IF p_branch_id IS NOT NULL THEN
    SELECT id INTO v_primary_wh_id FROM warehouses
      WHERE company_id = p_company_id AND branch_id = p_branch_id AND deleted_at IS NULL
      ORDER BY is_primary DESC, created_at ASC LIMIT 1;
  END IF;
  IF v_primary_wh_id IS NULL THEN
    SELECT id INTO v_primary_wh_id FROM warehouses
      WHERE company_id = p_company_id AND is_primary = true AND deleted_at IS NULL LIMIT 1;
  END IF;
  IF v_primary_wh_id IS NULL THEN
    SELECT id INTO v_primary_wh_id FROM warehouses
      WHERE company_id = p_company_id AND deleted_at IS NULL LIMIT 1;
  END IF;
  IF v_primary_wh_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد مستودع متاح لخصم مرتجع المشتريات';
  END IF;

  SELECT COALESCE(prefix, 'PRET-') || LPAD((COALESCE(current_number, 0) + 1)::text, 5, '0')
    INTO v_invoice_number
  FROM numbering_sequences
  WHERE company_id = p_company_id AND document_type = 'purchase_return';

  IF v_invoice_number IS NULL THEN
    v_invoice_number := 'PRET-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM()*1000)::text, 3, '0');
  ELSE
    UPDATE numbering_sequences
      SET current_number = current_number + 1, updated_at = NOW()
      WHERE company_id = p_company_id AND document_type = 'purchase_return';
  END IF;

  INSERT INTO invoices(
    company_id, branch_id, type, invoice_number, party_id,
    issue_date, notes, status, currency_code, exchange_rate,
    subtotal, tax_amount, total_amount, created_by, return_reason,
    reference_invoice_id
  ) VALUES (
    p_company_id, p_branch_id, 'purchase_return', v_invoice_number, p_supplier_id,
    CURRENT_DATE, p_notes, 'draft', p_currency, p_exchange_rate,
    0, 0, 0, p_user_id, p_return_reason,
    p_reference_invoice_id
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM products
      WHERE id = (v_item->>'product_id')::uuid
        AND company_id = p_company_id AND deleted_at IS NULL;
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'المنتج غير موجود: %', v_item->>'product_id';
    END IF;

    DECLARE
      v_qty       numeric := (v_item->>'quantity')::numeric;
      v_unit_cost numeric := COALESCE((v_item->>'unit_cost')::numeric, v_product.purchase_price);
      v_discount  numeric := COALESCE((v_item->>'discount_amount')::numeric, 0);
      v_line_sub  numeric := (v_qty * v_unit_cost) - v_discount;
    BEGIN
      IF v_qty <= 0 THEN RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر'; END IF;

      -- Lock stock row and guard against negative inventory
      SELECT COALESCE(ps.quantity, 0) INTO v_avail_qty
      FROM public.product_stock ps
      WHERE ps.product_id = v_product.id AND ps.warehouse_id = v_primary_wh_id
      FOR UPDATE;

      IF COALESCE(v_avail_qty, 0) < v_qty THEN
        RAISE EXCEPTION 'الكمية المتوفرة في المستودع (%) غير كافية لإرجاع (%) من المنتج "%"',
          COALESCE(v_avail_qty, 0), v_qty, v_product.name_ar;
      END IF;

      IF p_reference_invoice_id IS NOT NULL THEN
        DECLARE
          v_orig_qty numeric := 0;
          v_prev_returned numeric := 0;
        BEGIN
          SELECT COALESCE(SUM(ii.quantity), 0) INTO v_orig_qty
          FROM public.invoice_items ii
          WHERE ii.invoice_id = p_reference_invoice_id AND ii.product_id = v_product.id;

          IF v_orig_qty > 0 THEN
            SELECT COALESCE(SUM(ret_ii.quantity), 0) INTO v_prev_returned
            FROM public.invoices ret_inv
            JOIN public.invoice_items ret_ii ON ret_ii.invoice_id = ret_inv.id
            WHERE ret_inv.reference_invoice_id = p_reference_invoice_id
              AND ret_inv.type = 'purchase_return'
              AND ret_inv.status <> 'void'
              AND ret_inv.deleted_at IS NULL
              AND ret_ii.product_id = v_product.id;

            IF (v_qty + v_prev_returned) > v_orig_qty THEN
              RAISE EXCEPTION 'كمية الإرجاع المطلوبة (%) تتجاوز الكمية المتبقية القابلة للإرجاع (%) للمنتج "%"',
                v_qty, GREATEST(0, v_orig_qty - v_prev_returned), v_product.name_ar;
            END IF;
          END IF;
        END;
      END IF;

      INSERT INTO invoice_items(
        invoice_id, product_id, description, quantity,
        unit_price, cost_price, discount_amount, tax_amount, total, company_id
      ) VALUES (
        v_invoice_id, v_product.id, v_product.name_ar, v_qty,
        v_unit_cost, v_unit_cost, v_discount, 0, v_line_sub, p_company_id
      );

      INSERT INTO inventory_transactions(
        company_id, product_id, warehouse_id, quantity,
        transaction_type, reference_type, reference_id, created_by,
        unit_cost, total_cost
      ) VALUES (
        p_company_id, v_product.id, v_primary_wh_id, v_qty,
        'purchase_return', 'invoice', v_invoice_id, p_user_id,
        v_unit_cost, round(v_qty * v_unit_cost, 4)
      );

      v_subtotal := v_subtotal + v_line_sub;
    END;
  END LOOP;

  v_total := v_subtotal;
  UPDATE invoices SET subtotal = v_subtotal, tax_amount = 0, total_amount = v_total WHERE id = v_invoice_id;

  v_base_subtotal := public.fn_to_base_amount(p_currency, v_subtotal, p_exchange_rate);
  v_base_total    := public.fn_to_base_amount(p_currency, v_total, p_exchange_rate);

  INSERT INTO journal_entries(
    company_id, branch_id, entry_date, description, reference_type, reference_id, status, created_by
  ) VALUES (
    p_company_id, p_branch_id, CURRENT_DATE, 'مرتجع مشتريات ' || v_invoice_number,
    'purchase_return', v_invoice_id, 'draft', p_user_id
  ) RETURNING id INTO v_journal_id;

  INSERT INTO journal_entry_lines(
    journal_entry_id, account_id, party_id, debit_amount, credit_amount,
    description, currency_code, exchange_rate, foreign_amount, company_id, branch_id
  ) VALUES
    (v_journal_id, v_payable_account_id, p_supplier_id, v_base_total, 0,
     'تخفيض ذمم المورد - ' || v_invoice_number, p_currency, p_exchange_rate, v_total, p_company_id, p_branch_id),
    (v_journal_id, v_inventory_account_id, NULL, 0, v_base_subtotal,
     'خصم مخزون مرتجع - ' || v_invoice_number, p_currency, p_exchange_rate, v_subtotal, p_company_id, p_branch_id);

  UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  UPDATE invoices SET status = 'posted' WHERE id = v_invoice_id;

  RETURN jsonb_build_object(
    'id', v_invoice_id, 'invoice_number', v_invoice_number,
    'total_base', v_base_total, 'currency', p_currency, 'status', 'posted'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_process_cross_branch_sale(
  p_company_id uuid,
  p_seller_branch_id uuid,
  p_source_warehouse_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_payment_type text,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_source_branch_id uuid;
  v_item record;
  v_cost_price numeric;
  v_avail_qty numeric;
  v_internal_sale_id uuid;
  v_customer_sale_id uuid;
  v_total_cost numeric := 0;
  v_total_sale numeric := 0;
  v_inv_num_internal text;
  v_inv_num_customer text;
  v_acc_interbranch uuid;
  v_acc_inventory uuid;
  v_je_out_id uuid;
  v_je_in_id uuid;
  v_real_user_id uuid;
BEGIN
  v_real_user_id := auth.uid();
  IF p_user_id != v_real_user_id THEN
    RAISE EXCEPTION 'Unauthorized: User ID mismatch';
  END IF;

  PERFORM public.fn_assert_company_access(p_company_id);

  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_seller_branch_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'Unauthorized: Seller branch does not belong to the specified company';
  END IF;

  SELECT branch_id INTO v_source_branch_id
  FROM public.warehouses
  WHERE id = p_source_warehouse_id AND company_id = p_company_id AND deleted_at IS NULL;

  IF v_source_branch_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse does not belong to a specific branch or does not exist.';
  END IF;

  IF v_source_branch_id = p_seller_branch_id THEN
    RAISE EXCEPTION 'Not a cross-branch sale. Source and Seller branches are the same.';
  END IF;

  SELECT id INTO v_acc_interbranch FROM public.accounts WHERE company_id = p_company_id AND code = '3300' LIMIT 1;
  SELECT id INTO v_acc_inventory FROM public.accounts WHERE company_id = p_company_id AND code = '1200' LIMIT 1;

  IF v_acc_interbranch IS NULL OR v_acc_inventory IS NULL THEN
    RAISE EXCEPTION 'Required accounts (3300 Inter-branch or 1200 Inventory) are missing.';
  END IF;

  v_inv_num_internal := public.generate_invoice_number(p_company_id, 'sale', v_source_branch_id);
  v_inv_num_customer := public.generate_invoice_number(p_company_id, 'sale', p_seller_branch_id);

  INSERT INTO invoices (
    id, company_id, branch_id, type, party_id, issue_date, due_date,
    total_amount, status, payment_status, created_by, invoice_number, notes
  ) VALUES (
    gen_random_uuid(), p_company_id, v_source_branch_id, 'sale', NULL, CURRENT_DATE, CURRENT_DATE,
    0, 'approved', 'unpaid', p_user_id, v_inv_num_internal || '-INT', 'مبيعات داخلية لفرع آخر'
  ) RETURNING id INTO v_internal_sale_id;

  INSERT INTO invoices (
    id, company_id, branch_id, type, party_id, issue_date, due_date,
    total_amount, status, payment_status, created_by, invoice_number, notes, payment_method
  ) VALUES (
    gen_random_uuid(), p_company_id, p_seller_branch_id, 'sale', p_customer_id, CURRENT_DATE, CURRENT_DATE,
    0, 'draft', p_payment_type, p_user_id, v_inv_num_customer, 'مبيعات بضاعة من مستودع فرع آخر', p_payment_type
  ) RETURNING id INTO v_customer_sale_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity numeric, sale_price numeric)
  LOOP
    SELECT COALESCE(ps.quantity, 0), ps.weighted_avg_cost
    INTO v_avail_qty, v_cost_price
    FROM product_stock ps
    WHERE ps.product_id = v_item.product_id AND ps.warehouse_id = p_source_warehouse_id
    FOR UPDATE;

    IF COALESCE(v_avail_qty, 0) < v_item.quantity THEN
      RAISE EXCEPTION 'الكمية المتوفرة في مستودع الفرع المصدر (%) غير كافية للمنتج (%)',
        COALESCE(v_avail_qty, 0), v_item.product_id;
    END IF;

    IF v_cost_price IS NULL THEN
      SELECT COALESCE(cost_price, 0) INTO v_cost_price FROM public.products WHERE id = v_item.product_id;
    END IF;
    v_cost_price := COALESCE(v_cost_price, 0);

    v_total_cost := v_total_cost + (v_cost_price * v_item.quantity);
    v_total_sale := v_total_sale + (v_item.sale_price * v_item.quantity);

    INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, cost_price, subtotal, company_id)
    VALUES (v_internal_sale_id, v_item.product_id, v_item.quantity, v_cost_price, v_cost_price, v_cost_price * v_item.quantity, p_company_id);

    INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, cost_price, subtotal, company_id)
    VALUES (v_customer_sale_id, v_item.product_id, v_item.quantity, v_item.sale_price, v_cost_price, v_item.sale_price * v_item.quantity, p_company_id);

    -- Use 'sales' (not 'sale') so trg_update_product_stock deducts stock accurately
    INSERT INTO inventory_transactions (company_id, product_id, warehouse_id, quantity, transaction_type, reference_type, reference_id, unit_cost, created_by)
    VALUES (p_company_id, v_item.product_id, p_source_warehouse_id, -v_item.quantity, 'sales', 'invoice', v_internal_sale_id, v_cost_price, p_user_id);
  END LOOP;

  UPDATE invoices SET total_amount = v_total_cost WHERE id = v_internal_sale_id;
  UPDATE invoices SET total_amount = v_total_sale WHERE id = v_customer_sale_id;

  UPDATE invoices SET status = CASE WHEN p_payment_type = 'cash' THEN 'paid' ELSE 'posted' END WHERE id = v_customer_sale_id;

  IF v_total_cost > 0 THEN
    INSERT INTO journal_entries (company_id, branch_id, entry_date, reference_type, reference_id, description, status, created_by)
    VALUES (p_company_id, v_source_branch_id, CURRENT_DATE, 'cross_branch_transfer', v_internal_sale_id, 'نقل داخلي مباع لفرع آخر', 'posted', p_user_id)
    RETURNING id INTO v_je_out_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, description)
    VALUES
    (v_je_out_id, v_acc_interbranch, p_company_id, v_source_branch_id, v_total_cost, 0, 'استحقاق على فرع آخر'),
    (v_je_out_id, v_acc_inventory, p_company_id, v_source_branch_id, 0, v_total_cost, 'إخراج مخزون للفرع الآخر');

    INSERT INTO journal_entries (company_id, branch_id, entry_date, reference_type, reference_id, description, status, created_by)
    VALUES (p_company_id, p_seller_branch_id, CURRENT_DATE, 'cross_branch_transfer', v_internal_sale_id, 'استلام نقل داخلي مباع', 'posted', p_user_id)
    RETURNING id INTO v_je_in_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, description)
    VALUES
    (v_je_in_id, v_acc_inventory, p_company_id, p_seller_branch_id, v_total_cost, 0, 'إدخال مخزون من فرع آخر'),
    (v_je_in_id, v_acc_interbranch, p_company_id, p_seller_branch_id, 0, v_total_cost, 'التزام لفرع آخر');
  END IF;

  PERFORM pg_notify(
    'branch_notifications',
    json_build_object(
      'company_id', p_company_id,
      'source_branch_id', v_source_branch_id,
      'seller_branch_id', p_seller_branch_id,
      'invoice_id', v_customer_sale_id,
      'internal_invoice_id', v_internal_sale_id,
      'total_cost', v_total_cost,
      'total_sale', v_total_sale,
      'type', 'cross_branch_sale'
    )::text
  );

  RETURN v_customer_sale_id;
END;
$function$;

