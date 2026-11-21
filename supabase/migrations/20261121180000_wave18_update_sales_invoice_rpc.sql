-- ============================================================================
-- Migration: 20261121180000_wave18_update_sales_invoice_rpc.sql
-- Wave 18: Professional Atomic Sales Invoice Update RPC
-- Supports editing posted/committed sales invoices:
--   - Party / Customer update
--   - Payment method (cash vs credit) and payment account update
--   - Items additions, removals, qty, price, discount edits
--   - Atomic reversal of previous stock deductions + new deductions
--   - Atomic synchronization of GL journal entries and lines
--   - Comprehensive customer stats & audit trail
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_sales_invoice_v2(
  p_invoice_id uuid,
  p_party_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_items jsonb,
  p_payment_type text DEFAULT 'cash'::text,
  p_notes text DEFAULT NULL::text,
  p_currency_code text DEFAULT 'SAR'::text,
  p_exchange_rate numeric DEFAULT 1,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_payment_account_id uuid DEFAULT NULL::uuid,
  p_paid_amount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_user_role text;
  v_invoice RECORD;
  v_old_party_id uuid;
  v_branch_id uuid;
  v_currency text;
  v_eff_rate numeric;
  v_warehouse_id uuid;
  v_target_wh_id uuid;
  v_old_wh_id uuid;
  v_item RECORD;
  v_old_item RECORD;
  v_product_name text;
  v_product_sku text;
  v_db_price numeric;
  v_db_cost numeric;
  v_sale_cost numeric;
  v_line_net numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_doc_subtotal numeric := 0;
  v_doc_tax numeric := 0;
  v_doc_discount numeric := 0;
  v_doc_total numeric := 0;
  v_base_subtotal numeric := 0;
  v_base_tax numeric := 0;
  v_base_discount numeric := 0;
  v_base_total numeric := 0;
  v_is_cash boolean;
  v_actual_paid numeric;
  v_status text;
  v_total_cogs numeric := 0;
  v_je_id uuid;
  v_acc_ar uuid;
  v_acc_revenue uuid;
  v_acc_vat uuid;
  v_acc_inventory uuid;
  v_acc_cogs uuid;
  v_acc_funding uuid;
  v_base_unpaid numeric;
  v_doc_unpaid numeric;
  v_doc_paid numeric;
  v_bond_allocated numeric := 0;
  v_total_paid_on_inv numeric := 0;
BEGIN
  -- 1. Authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Fetch and lock invoice
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found: الفاتورة المحددة غير موجودة (%)', p_invoice_id;
  END IF;

  IF v_invoice.type NOT IN ('sale') THEN
    RAISE EXCEPTION 'invalid_invoice_type: هذا الإجراء مخصص لفواتير المبيعات فقط';
  END IF;

  IF v_invoice.status IN ('void', 'cancelled') THEN
    RAISE EXCEPTION 'invoice_is_void: لا يمكن تعديل فاتورة ملغية مسبقاً' USING ERRCODE = '23514';
  END IF;

  v_company_id := v_invoice.company_id;
  v_old_party_id := v_invoice.party_id;

  -- 3. Authorization check
  SELECT role INTO v_user_role FROM public.user_company_roles
  WHERE user_id = v_user_id AND company_id = v_company_id LIMIT 1;
  IF v_user_role IS NULL THEN
    SELECT role INTO v_user_role FROM public.user_profiles WHERE id = v_user_id;
  END IF;

  IF NOT public.is_super_admin() AND COALESCE(v_user_role, 'viewer') NOT IN ('owner', 'admin', 'manager', 'accountant', 'cashier') THEN
    RAISE EXCEPTION 'access_denied: ليس لديك صلاحية تعديل فواتير المبيعات' USING ERRCODE = '42501';
  END IF;

  -- 4. Branch access check
  v_branch_id := COALESCE(p_branch_id, v_invoice.branch_id);
  IF v_branch_id IS NOT NULL THEN
    PERFORM public.fn_assert_branch_access(v_branch_id);
  END IF;

  -- 5. Fiscal year check
  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_years
    WHERE company_id = v_company_id
      AND p_invoice_date BETWEEN start_date AND end_date
      AND is_closed = false
  ) THEN
    RAISE EXCEPTION 'تاريخ الفاتورة يقع خارج سنة مالية مفتوحة';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'يجب أن تحتوي الفاتورة على صنف واحد على الأقل';
  END IF;

  -- 6. Normalize currency & exchange rate
  v_currency := UPPER(TRIM(COALESCE(NULLIF(p_currency_code, ''), v_invoice.currency_code, 'SAR')));
  IF v_currency = 'SAR' THEN
    v_eff_rate := 1;
  ELSIF v_currency = 'YER' THEN
    IF COALESCE(p_exchange_rate, 0) <= 0 OR p_exchange_rate = 1 THEN
      RAISE EXCEPTION 'invalid_currency_rate: سعر صرف الريال اليمني غير صالح (%)', p_exchange_rate USING ERRCODE = '23514';
    END IF;
    v_eff_rate := CASE WHEN p_exchange_rate > 1 THEN ROUND(1.0 / p_exchange_rate, 6) ELSE p_exchange_rate END;
  ELSE
    IF COALESCE(p_exchange_rate, 0) <= 0 THEN
      RAISE EXCEPTION 'invalid_currency_rate: سعر الصرف يجب أن يكون أكبر من صفر' USING ERRCODE = '23514';
    END IF;
    v_eff_rate := p_exchange_rate;
  END IF;

  -- 7. Determine primary warehouse
  IF v_branch_id IS NOT NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
    WHERE company_id = v_company_id AND branch_id = v_branch_id AND deleted_at IS NULL
    ORDER BY is_primary DESC, created_at ASC LIMIT 1;
  END IF;
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
    WHERE company_id = v_company_id AND is_primary = true AND deleted_at IS NULL
    LIMIT 1;
  END IF;
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
    WHERE company_id = v_company_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- 8. Validate items & compute document totals
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric,
      warehouse_id uuid, cost_price numeric, discount_amount numeric)
  LOOP
    IF COALESCE(v_item.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'الكمية المدخلة غير صحيحة (%) للصنف', v_item.quantity;
    END IF;

    SELECT name_ar, sku, sale_price, COALESCE(NULLIF(cost_price, 0), purchase_price, 0)
    INTO v_product_name, v_product_sku, v_db_price, v_db_cost
    FROM public.products
    WHERE id = v_item.product_id AND company_id = v_company_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'الصنف المحدد غير مسجل في بيانات المنشأة';
    END IF;

    v_line_net   := GREATEST(0, v_item.quantity * v_item.unit_price - COALESCE(v_item.discount_amount, 0));
    v_line_tax   := COALESCE(round(v_line_net * COALESCE(v_item.tax_rate, 0) / 100, 4), 0);
    v_line_total := round(v_line_net + v_line_tax, 2);

    v_doc_subtotal := v_doc_subtotal + round(v_line_net, 2);
    v_doc_discount := v_doc_discount + COALESCE(v_item.discount_amount, 0);
    v_doc_tax      := v_doc_tax + round(v_line_tax, 2);
    v_doc_total    := v_doc_total + v_line_total;
  END LOOP;

  v_base_total    := ROUND(v_doc_total * v_eff_rate, 2);
  v_base_tax      := ROUND(v_doc_tax * v_eff_rate, 2);
  v_base_discount := ROUND(v_doc_discount * v_eff_rate, 2);
  v_base_subtotal := ROUND(v_base_total - v_base_tax, 2);

  -- 9. Determine payment status & amounts (respecting existing payment_allocations)
  SELECT COALESCE(SUM(pa.allocated_amount), 0)
  INTO v_bond_allocated
  FROM public.payment_allocations pa
  WHERE pa.invoice_id = p_invoice_id
    AND pa.deleted_at IS NULL;

  v_is_cash := coalesce(p_payment_type, 'cash') <> 'credit';

  IF v_is_cash THEN
    IF v_bond_allocated > 0 THEN
      RAISE EXCEPTION 'allocated_bonds_exist: هذه الفاتورة مرتبطة بسندات قبض بمبلغ (%). يرجى إلغاء ربط السندات قبل تحويل الفاتورة إلى نقدية.', v_bond_allocated USING ERRCODE = '23514';
    END IF;
    v_actual_paid := v_base_total;
    v_total_paid_on_inv := v_base_total;
    v_status := 'paid';
  ELSE
    IF p_party_id IS NULL THEN
      RAISE EXCEPTION 'يجب تحديد العميل للفاتورة الآجلة';
    END IF;
    v_actual_paid := LEAST(v_base_total, ROUND(GREATEST(0, COALESCE(p_paid_amount, 0)) * v_eff_rate, 2));
    v_total_paid_on_inv := LEAST(v_base_total, v_actual_paid + v_bond_allocated);
    IF v_total_paid_on_inv >= v_base_total AND v_base_total > 0 THEN
      v_status := 'paid';
    ELSIF v_total_paid_on_inv > 0 THEN
      v_status := 'partially_paid';
    ELSE
      v_status := 'posted';
    END IF;
  END IF;

  -- 10. Elevate session configuration for authorized execution
  PERFORM set_config('app.rpc_authorized', 'true', true);
  PERFORM set_config('app.reposting_doc', 'true', true);

  -- 11. Reverse net previous stock deductions via adj_in (idempotent across multiple edits)
  FOR v_old_item IN
    SELECT
      it.product_id,
      COALESCE(it.warehouse_id, v_warehouse_id) AS warehouse_id,
      SUM(
        CASE
          WHEN it.transaction_type IN ('sales', 'adj_out', 'purchase_return', 'transfer_out') THEN -ABS(it.quantity)
          WHEN it.transaction_type IN ('sales_return', 'adj_in', 'purchase', 'transfer_in', 'initial') THEN ABS(it.quantity)
          ELSE it.quantity
        END
      ) AS net_qty,
      MAX(COALESCE(it.unit_cost, 0)) AS unit_cost
    FROM public.inventory_transactions it
    WHERE it.reference_id = p_invoice_id
      AND it.reference_type IN ('sales_invoice', 'sale_invoice', 'sales_invoice_edit')
      AND it.deleted_at IS NULL
    GROUP BY it.product_id, COALESCE(it.warehouse_id, v_warehouse_id)
  LOOP
    IF v_old_item.net_qty < 0 THEN
      INSERT INTO public.inventory_transactions (
        company_id, product_id, warehouse_id, quantity, transaction_type,
        reference_type, reference_id, unit_cost, total_cost, created_by
      ) VALUES (
        v_company_id, v_old_item.product_id, v_old_item.warehouse_id,
        ABS(v_old_item.net_qty), 'adj_in', 'sales_invoice_edit', p_invoice_id,
        v_old_item.unit_cost,
        ROUND(ABS(v_old_item.net_qty) * v_old_item.unit_cost, 4),
        v_user_id
      );
    END IF;
  END LOOP;

  -- Remove previous invoice items
  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  -- 12. Insert new invoice items & deduct stock via sales transactions
  v_total_cogs := 0;
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS
    x(product_id uuid, quantity numeric, unit_price numeric, tax_rate numeric,
      warehouse_id uuid, cost_price numeric, discount_amount numeric)
  LOOP
    v_target_wh_id := COALESCE(v_item.warehouse_id, v_warehouse_id);

    SELECT COALESCE(NULLIF(ps.weighted_avg_cost, 0), NULLIF(p.cost_price, 0), p.purchase_price, 0)
    INTO v_sale_cost
    FROM public.products p
    LEFT JOIN public.product_stock ps
      ON ps.product_id = p.id
     AND ps.warehouse_id = v_target_wh_id
     AND ps.company_id = v_company_id
    WHERE p.id = v_item.product_id AND p.company_id = v_company_id;

    v_sale_cost  := COALESCE(v_sale_cost, 0);
    v_line_net   := GREATEST(0, v_item.quantity * v_item.unit_price - COALESCE(v_item.discount_amount, 0));
    v_line_tax   := COALESCE(round(v_line_net * COALESCE(v_item.tax_rate, 0) / 100, 4), 0);
    v_line_total := round(v_line_net + v_line_tax, 2);

    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, cost_price,
      discount_amount, tax_amount, total, company_id
    ) VALUES (
      p_invoice_id, v_item.product_id, v_item.quantity, v_item.unit_price,
      v_sale_cost,
      COALESCE(v_item.discount_amount, 0),
      v_line_tax,
      v_line_total, v_company_id
    );

    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity, transaction_type,
      reference_type, reference_id, unit_cost, total_cost, created_by
    ) VALUES (
      v_company_id, v_item.product_id, v_target_wh_id,
      -ABS(v_item.quantity), 'sales', 'sales_invoice', p_invoice_id,
      v_sale_cost,
      ROUND(ABS(v_item.quantity) * v_sale_cost, 4),
      v_user_id
    );

    v_total_cogs := v_total_cogs + ROUND(v_item.quantity * v_sale_cost, 4);
  END LOOP;

  -- 13. Update invoice header
  UPDATE public.invoices
  SET party_id                 = p_party_id,
      issue_date               = p_invoice_date,
      due_date                 = p_due_date,
      payment_method           = p_payment_type,
      payment_account_id       = p_payment_account_id,
      subtotal_document_amount = v_doc_subtotal,
      total_document_amount    = v_doc_total,
      subtotal                 = v_base_subtotal,
      tax_amount               = v_base_tax,
      discount_amount          = v_base_discount,
      total_amount             = v_base_total,
      status                   = v_status,
      paid_amount              = v_total_paid_on_inv,
      advance_payment          = v_actual_paid,
      notes                    = p_notes,
      currency_code            = v_currency,
      exchange_rate            = v_eff_rate,
      branch_id                = v_branch_id,
      updated_at               = now()
  WHERE id = p_invoice_id;

  -- 14. Adjust Journal Entries & Lines
  v_acc_ar        := fn_get_account_id(v_company_id, '1100');
  v_acc_revenue   := fn_get_account_id(v_company_id, '4100');
  v_acc_vat       := fn_get_account_id(v_company_id, '2200');
  v_acc_inventory := fn_get_account_id(v_company_id, '1200');
  v_acc_cogs      := fn_get_account_id(v_company_id, '5100');

  IF p_payment_account_id IS NOT NULL THEN
    v_acc_funding := p_payment_account_id;
  ELSIF p_payment_type = 'cash' THEN
    v_acc_funding := COALESCE(
      public.fn_get_default_cash_account(v_company_id, v_currency),
      fn_get_account_id(v_company_id, '1010-01'),
      fn_get_account_id(v_company_id, '101001')
    );
  ELSE
    v_acc_funding := NULL;
  END IF;

  IF v_acc_funding IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.accounts
    WHERE id = v_acc_funding AND allow_posting = true AND is_active = true AND deleted_at IS NULL
  ) THEN
    v_acc_funding := public.fn_get_default_cash_account(v_company_id, v_currency);
  END IF;

  IF v_acc_funding IS NULL AND v_actual_paid > 0 AND p_payment_type = 'cash' THEN
    SELECT id INTO v_acc_funding FROM public.accounts
    WHERE company_id = v_company_id
      AND (code LIKE '101%' OR code LIKE '102%' OR type = 'asset')
      AND allow_posting = true AND is_active = true AND deleted_at IS NULL
    ORDER BY CASE WHEN code LIKE '101%' THEN 0 ELSE 1 END, code ASC LIMIT 1;
  END IF;

  IF v_acc_revenue IS NULL THEN
    RAISE EXCEPTION 'auto_post_failed: revenue 4100 missing for company %', v_company_id;
  END IF;
  IF v_acc_funding IS NULL AND v_acc_ar IS NULL THEN
    RAISE EXCEPTION 'auto_post_failed: AR 1100 and cash both missing for company %', v_company_id;
  END IF;

  v_base_unpaid := v_base_total - v_actual_paid;
  IF v_base_total > 0 THEN
    v_doc_unpaid := ROUND(v_doc_total * (v_base_unpaid / v_base_total), 2);
    v_doc_paid   := ROUND(v_doc_total * (v_actual_paid / v_base_total), 2);
  ELSE
    v_doc_unpaid := 0;
    v_doc_paid   := 0;
  END IF;

  SELECT id INTO v_je_id
  FROM public.journal_entries
  WHERE reference_id = p_invoice_id
    AND reference_type = 'sales_invoice'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_je_id IS NOT NULL THEN
    UPDATE public.journal_entries
    SET status = 'draft',
        entry_date = p_invoice_date,
        description = 'فاتورة مبيعات ' || COALESCE(v_invoice.invoice_number, '') || ' (معدلة)',
        branch_id = v_branch_id,
        updated_at = now()
    WHERE id = v_je_id;

    DELETE FROM public.journal_entry_lines WHERE journal_entry_id = v_je_id;
  ELSE
    INSERT INTO public.journal_entries(
      company_id, branch_id, entry_date, reference_type, reference_id,
      description, status, created_by
    ) VALUES (
      v_company_id, v_branch_id, p_invoice_date, 'sales_invoice', p_invoice_id,
      'فاتورة مبيعات ' || COALESCE(v_invoice.invoice_number, '') || ' (معدلة)', 'draft', v_user_id
    ) RETURNING id INTO v_je_id;
  END IF;

  -- Journal line 1: Cash/Bank
  IF v_actual_paid > 0 AND v_acc_funding IS NOT NULL THEN
    INSERT INTO journal_entry_lines(
      journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount,
      foreign_amount, currency_code, exchange_rate, description, party_id
    ) VALUES (
      v_je_id, v_acc_funding, v_company_id, v_branch_id, v_actual_paid, 0,
      v_doc_paid, v_currency, v_eff_rate,
      CASE WHEN v_base_unpaid > 0 THEN 'سداد جزئي نقدي/بنكي - ' ELSE 'مبيعات نقدية/بنكية - ' END || COALESCE(v_invoice.invoice_number,''),
      NULL
    );
  END IF;

  -- Journal line 2: Accounts Receivable (AR)
  IF v_base_unpaid > 0 OR (v_actual_paid = 0 AND v_acc_funding IS NULL) THEN
    INSERT INTO journal_entry_lines(
      journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount,
      foreign_amount, currency_code, exchange_rate, description, party_id
    ) VALUES (
      v_je_id, v_acc_ar, v_company_id, v_branch_id, v_base_unpaid, 0,
      v_doc_unpaid, v_currency, v_eff_rate,
      CASE WHEN v_actual_paid > 0 THEN 'متبقي ذمم عملاء - ' ELSE 'مبيعات آجل - ' END || COALESCE(v_invoice.invoice_number,''),
      p_party_id
    );
  END IF;

  -- Journal line 3: Sales Revenue
  INSERT INTO journal_entry_lines(
    journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount,
    foreign_amount, currency_code, exchange_rate, description, party_id
  ) VALUES (
    v_je_id, v_acc_revenue, v_company_id, v_branch_id, 0, v_base_subtotal,
    v_doc_subtotal, v_currency, v_eff_rate,
    'إيراد مبيعات - ' || COALESCE(v_invoice.invoice_number,''),
    NULL
  );

  -- Journal line 4: Output VAT
  IF COALESCE(v_base_tax, 0) <> 0 AND v_acc_vat IS NOT NULL THEN
    INSERT INTO journal_entry_lines(
      journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount,
      foreign_amount, currency_code, exchange_rate, description, party_id
    ) VALUES (
      v_je_id, v_acc_vat, v_company_id, v_branch_id, 0, v_base_tax,
      v_doc_tax, v_currency, v_eff_rate,
      'ضريبة مخرجات مبيعات - ' || COALESCE(v_invoice.invoice_number,''),
      NULL
    );
  END IF;

  -- Journal lines 5 & 6: COGS & Inventory
  IF v_total_cogs > 0 AND v_acc_cogs IS NOT NULL AND v_acc_inventory IS NOT NULL THEN
    INSERT INTO journal_entry_lines(
      journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount,
      foreign_amount, currency_code, exchange_rate, description, party_id
    ) VALUES (
      v_je_id, v_acc_cogs, v_company_id, v_branch_id, v_total_cogs, 0,
      NULL, NULL, NULL,
      'تكلفة مبيعات - ' || COALESCE(v_invoice.invoice_number,''),
      NULL
    );

    INSERT INTO journal_entry_lines(
      journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount,
      foreign_amount, currency_code, exchange_rate, description, party_id
    ) VALUES (
      v_je_id, v_acc_inventory, v_company_id, v_branch_id, 0, v_total_cogs,
      NULL, NULL, NULL,
      'إخراج بضاعة مباعة - ' || COALESCE(v_invoice.invoice_number,''),
      NULL
    );
  END IF;

  UPDATE public.journal_entries SET status = 'posted' WHERE id = v_je_id;

  -- 15. Synchronize parties stats (both previous and new customer)
  IF v_old_party_id IS NOT NULL AND v_old_party_id <> p_party_id THEN
    UPDATE public.parties SET
      total_invoices_count = (SELECT COUNT(*) FROM public.invoices WHERE party_id = v_old_party_id AND type = 'sale' AND status NOT IN ('cancelled', 'void', 'draft') AND deleted_at IS NULL),
      total_paid_amount = (SELECT COALESCE(SUM(paid_amount), 0) FROM public.invoices WHERE party_id = v_old_party_id AND type = 'sale' AND status NOT IN ('cancelled', 'void', 'draft') AND deleted_at IS NULL),
      updated_at = now()
    WHERE id = v_old_party_id;
  END IF;

  IF p_party_id IS NOT NULL THEN
    UPDATE public.parties SET
      total_invoices_count = (SELECT COUNT(*) FROM public.invoices WHERE party_id = p_party_id AND type = 'sale' AND status NOT IN ('cancelled', 'void', 'draft') AND deleted_at IS NULL),
      total_paid_amount = (SELECT COALESCE(SUM(paid_amount), 0) FROM public.invoices WHERE party_id = p_party_id AND type = 'sale' AND status NOT IN ('cancelled', 'void', 'draft') AND deleted_at IS NULL),
      updated_at = now()
    WHERE id = p_party_id;
  END IF;

  -- 16. Audit Log
  PERFORM public.audit_write(
    'invoice_updated', 'invoices', p_invoice_id, v_company_id,
    jsonb_build_object(
      'invoice_number', v_invoice.invoice_number,
      'old_party_id', v_old_party_id,
      'new_party_id', p_party_id,
      'old_total', v_invoice.total_amount,
      'new_total', v_base_total,
      'items_count', jsonb_array_length(p_items),
      'journal_entry_id', v_je_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'invoice_number', v_invoice.invoice_number,
    'journal_entry_id', v_je_id,
    'total_amount', v_base_total,
    'total_document_amount', v_doc_total,
    'status', v_status
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_sales_invoice_v2(uuid, uuid, date, date, jsonb, text, text, text, numeric, uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_sales_invoice_v2(uuid, uuid, date, date, jsonb, text, text, text, numeric, uuid, uuid, numeric) TO authenticated, service_role;
