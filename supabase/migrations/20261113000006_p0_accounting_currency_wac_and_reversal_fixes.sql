-- P0 Fixes:
-- 1. fn_update_weighted_avg_cost: UPSERT product_stock so first-ever purchase in a warehouse does not lose weighted_avg_cost
--    (since trg_update_weighted_avg_cost runs alphabetically before update_product_stock_trigger).
-- 2. process_stock_transfer: Lock source product_stock (FOR UPDATE), enforce non-negative stock availability,
--    and propagate source warehouse unit_cost to both transfer_out and transfer_in.
-- 3. fn_reverse_inventory_for_reference: Reverse purchase_return as 'adj_in' (not 'purchase' to avoid WAC corruption)
--    and reverse 'adj' based on quantity sign.
-- 4. report_debts: Align receivables/payables sign classification uniformly with party_balances (positive = receivable, negative = payable).
-- 5. get_party_statement: Convert party_opening_balances and brought-forward balances to base currency via fn_to_base_amount.

CREATE OR REPLACE FUNCTION public.fn_update_weighted_avg_cost()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_qty numeric;
  v_old_avg numeric;
  v_new_avg numeric;
BEGIN
  IF new.transaction_type = 'purchase' AND new.quantity > 0 THEN
    SELECT quantity, weighted_avg_cost INTO v_old_qty, v_old_avg
    FROM public.product_stock
    WHERE product_id = new.product_id AND warehouse_id = new.warehouse_id
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
      new.product_id, new.warehouse_id, 0, v_new_avg, new.company_id, new.created_by
    )
    ON CONFLICT (product_id, warehouse_id) DO UPDATE
    SET weighted_avg_cost = EXCLUDED.weighted_avg_cost,
        updated_at = now();

    UPDATE public.products
    SET cost_price = v_new_avg,
        purchase_price = new.unit_cost
    WHERE id = new.product_id;
  END IF;

  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_stock_transfer(p_transfer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer    RECORD;
  v_item        RECORD;
  v_avail_qty   numeric;
  v_unit_cost   numeric;
BEGIN
  SELECT * INTO v_transfer FROM public.stock_transfers WHERE id = p_transfer_id;
  IF v_transfer IS NULL THEN
    RAISE EXCEPTION 'التحويل غير موجود: %', p_transfer_id;
  END IF;

  IF NOT is_super_admin() AND NOT EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = auth.uid() AND ucr.company_id = v_transfer.company_id
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية الوصول لهذه الشركة';
  END IF;

  IF v_transfer.status = 'completed' THEN
    RAISE EXCEPTION 'تم تنفيذ هذا التحويل مسبقاً';
  END IF;
  IF v_transfer.status = 'cancelled' THEN
    RAISE EXCEPTION 'لا يمكن تنفيذ تحويل ملغى';
  END IF;

  FOR v_item IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    SELECT COALESCE(ps.quantity, 0), ps.weighted_avg_cost
    INTO v_avail_qty, v_unit_cost
    FROM public.product_stock ps
    WHERE ps.product_id = v_item.product_id
      AND ps.warehouse_id = v_transfer.from_warehouse_id
    FOR UPDATE;

    IF COALESCE(v_avail_qty, 0) < v_item.quantity THEN
      RAISE EXCEPTION 'الكمية المتوفرة في المستودع المصدر (%) غير كافية للصنف (%)', COALESCE(v_avail_qty, 0), v_item.product_id;
    END IF;

    IF v_unit_cost IS NULL THEN
      SELECT COALESCE(cost_price, 0) INTO v_unit_cost FROM public.products WHERE id = v_item.product_id;
    END IF;
    v_unit_cost := COALESCE(v_unit_cost, 0);

    PERFORM public.fn_post_inventory_movement(
      v_transfer.company_id, v_item.product_id, v_transfer.from_warehouse_id, v_item.quantity,
      'transfer_out', 'stock_transfer', p_transfer_id, v_transfer.created_by, v_unit_cost
    );
    PERFORM public.fn_post_inventory_movement(
      v_transfer.company_id, v_item.product_id, v_transfer.to_warehouse_id, v_item.quantity,
      'transfer_in', 'stock_transfer', p_transfer_id, v_transfer.created_by, v_unit_cost
    );
  END LOOP;

  UPDATE public.stock_transfers SET status = 'completed', updated_at = now() WHERE id = p_transfer_id;
  RETURN p_transfer_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_reverse_inventory_for_reference(
  p_reference_id uuid,
  p_source_reference_types text[],
  p_new_reference_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_txn RECORD;
  v_opposite_type text;
  v_reverse_qty numeric;
BEGIN
  FOR v_txn IN
    SELECT * FROM inventory_transactions
    WHERE reference_id = p_reference_id
      AND reference_type = ANY(p_source_reference_types)
      AND deleted_at IS NULL
    ORDER BY created_at ASC
  LOOP
    v_opposite_type := CASE v_txn.transaction_type
      WHEN 'sales' THEN 'sales_return'
      WHEN 'sales_return' THEN 'sales'
      WHEN 'purchase' THEN 'purchase_return'
      WHEN 'purchase_return' THEN 'adj_in'
      WHEN 'transfer_in' THEN 'transfer_out'
      WHEN 'transfer_out' THEN 'transfer_in'
      WHEN 'adj_in' THEN 'adj_out'
      WHEN 'adj_out' THEN 'adj_in'
      WHEN 'adj' THEN CASE WHEN v_txn.quantity >= 0 THEN 'adj_out' ELSE 'adj_in' END
      ELSE 'adj_out'
    END;

    v_reverse_qty := CASE
      WHEN v_opposite_type IN ('sales_return', 'purchase', 'transfer_in', 'adj_in', 'initial') THEN ABS(v_txn.quantity)
      ELSE -ABS(v_txn.quantity)
    END;

    INSERT INTO inventory_transactions(
      company_id, product_id, warehouse_id, quantity, unit_cost, total_cost,
      transaction_type, reference_type, reference_id, created_by
    ) VALUES (
      v_txn.company_id, v_txn.product_id, v_txn.warehouse_id, v_reverse_qty, v_txn.unit_cost,
      round(ABS(v_reverse_qty) * COALESCE(v_txn.unit_cost, 0), 4),
      v_opposite_type, p_new_reference_type, p_reference_id, auth.uid()
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_debts(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_receivables numeric := 0;
  v_payables numeric := 0;
  v_debts json;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  WITH active_debts AS (
    SELECT
      p.id,
      p.name,
      p.type,
      pb.balance AS remaining_amount
    FROM public.parties p
    JOIN public.party_balances pb ON pb.party_id = p.id AND pb.company_id = p_company_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND ABS(pb.balance) > 0.01
    ORDER BY pb.balance DESC
  )
  SELECT
    COALESCE(SUM(remaining_amount) FILTER (WHERE remaining_amount > 0), 0),
    COALESCE(SUM(ABS(remaining_amount)) FILTER (WHERE remaining_amount < 0), 0),
    COALESCE(json_agg(row_to_json(ad)), '[]'::json)
  INTO v_receivables, v_payables, v_debts
  FROM active_debts ad;

  RETURN json_build_object(
    'summary', json_build_object(
      'receivables', v_receivables,
      'payables', v_payables
    ),
    'debts', v_debts
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_party_statement(
  p_company_id uuid,
  p_party_id uuid,
  p_from_date date DEFAULT NULL::date,
  p_to_date date DEFAULT NULL::date,
  p_currency_code text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_movements json;
  v_party_type text;
  v_base_currency text;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT type INTO v_party_type
  FROM public.parties
  WHERE id = p_party_id AND company_id = p_company_id AND deleted_at IS NULL;

  IF v_party_type IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(base_currency, 'SAR') INTO v_base_currency
  FROM public.companies
  WHERE id = p_company_id;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.entry_date, t.is_bf DESC, t.created_at, t.line_id), '[]'::json)
  INTO v_movements
  FROM (
    SELECT
      sub.line_id,
      sub.entry_date,
      sub.created_at,
      sub.is_bf,
      sub.ref,
      sub.operation_type,
      sub.description,
      sub.type,
      sub.debit,
      sub.credit,
      sub.currency,
      sub.debit_base,
      sub.credit_base,
      sub.reference_id,
      sub.reference_type,
      sub.payment_status,
      sub.paid_amount,
      sub.remaining_amount,
      sub.items_count,
      SUM(
        CASE
          WHEN v_party_type = 'supplier' THEN sub.credit - sub.debit
          ELSE sub.debit - sub.credit
        END
      ) OVER (
        PARTITION BY sub.currency
        ORDER BY sub.entry_date, sub.is_bf DESC, sub.created_at, sub.line_id
        ROWS UNBOUNDED PRECEDING
      ) AS balance
    FROM (
      -- 1.1 Balance Brought Forward
      SELECT
        'BF-' || ob_prev.currency AS line_id,
        p_from_date AS entry_date,
        (p_from_date::text || ' 00:00:00+00')::timestamptz AS created_at,
        1 AS is_bf,
        'رصيد سابق' AS ref,
        'رصيد ما قبل الفترة' AS operation_type,
        'رصيد مرحل من الفترة السابقة' AS description,
        'brought_forward' AS type,
        ob_prev.debit,
        ob_prev.credit,
        ob_prev.currency,
        ob_prev.debit_base,
        ob_prev.credit_base,
        NULL::uuid AS reference_id,
        'brought_forward' AS reference_type,
        'posted' AS payment_status,
        0::numeric AS paid_amount,
        0::numeric AS remaining_amount,
        0::bigint AS items_count
      FROM (
        SELECT
          prior_raw.currency,
          GREATEST(
            SUM(
              CASE
                WHEN v_party_type = 'supplier' THEN prior_raw.credit - prior_raw.debit
                ELSE prior_raw.debit - prior_raw.credit
              END
            ), 0
          ) AS debit,
          GREATEST(
            -SUM(
              CASE
                WHEN v_party_type = 'supplier' THEN prior_raw.credit - prior_raw.debit
                ELSE prior_raw.debit - prior_raw.credit
              END
            ), 0
          ) AS credit,
          GREATEST(
            SUM(
              CASE
                WHEN v_party_type = 'supplier' THEN prior_raw.credit_base - prior_raw.debit_base
                ELSE prior_raw.debit_base - prior_raw.credit_base
              END
            ), 0
          ) AS debit_base,
          GREATEST(
            -SUM(
              CASE
                WHEN v_party_type = 'supplier' THEN prior_raw.credit_base - prior_raw.debit_base
                ELSE prior_raw.debit_base - prior_raw.credit_base
              END
            ), 0
          ) AS credit_base
        FROM (
          SELECT
            ob.currency_code AS currency,
            CASE WHEN ob.direction = 'debit' THEN ob.amount ELSE 0 END AS debit,
            CASE WHEN ob.direction = 'credit' THEN ob.amount ELSE 0 END AS credit,
            CASE WHEN ob.direction = 'debit' THEN
              public.fn_to_base_amount(ob.currency_code, ob.amount, (
                SELECT lr.rate_to_base FROM public.exchange_rates lr
                WHERE lr.company_id = p_company_id AND lr.currency_code = ob.currency_code
                ORDER BY lr.effective_date DESC, lr.created_at DESC LIMIT 1
              ))
            ELSE 0 END AS debit_base,
            CASE WHEN ob.direction = 'credit' THEN
              public.fn_to_base_amount(ob.currency_code, ob.amount, (
                SELECT lr.rate_to_base FROM public.exchange_rates lr
                WHERE lr.company_id = p_company_id AND lr.currency_code = ob.currency_code
                ORDER BY lr.effective_date DESC, lr.created_at DESC LIMIT 1
              ))
            ELSE 0 END AS credit_base
          FROM public.party_opening_balances ob
          WHERE ob.company_id = p_company_id
            AND ob.party_id = p_party_id
            AND (p_from_date IS NOT NULL AND ob.entry_date < p_from_date)
            AND (p_currency_code IS NULL OR ob.currency_code = p_currency_code)

          UNION ALL

          SELECT
            jel.currency_code AS currency,
            CASE WHEN jel.debit_amount > 0 THEN COALESCE(NULLIF(jel.foreign_amount, 0), jel.debit_amount) ELSE 0 END AS debit,
            CASE WHEN jel.credit_amount > 0 THEN COALESCE(NULLIF(jel.foreign_amount, 0), jel.credit_amount) ELSE 0 END AS credit,
            jel.debit_amount AS debit_base,
            jel.credit_amount AS credit_base
          FROM public.journal_entry_lines jel
          JOIN public.journal_entries je ON je.id = jel.journal_entry_id
          JOIN public.accounts a ON a.id = jel.account_id
          WHERE je.company_id = p_company_id
            AND je.status = 'posted'
            AND je.deleted_at IS NULL
            AND jel.deleted_at IS NULL
            AND jel.party_id = p_party_id
            AND ((a.code LIKE '1100%' OR a.code LIKE '121%') OR (a.code LIKE '2100%' OR a.code LIKE '231%') OR (a.code LIKE '2400%' OR a.code LIKE '122%') OR (a.code LIKE '1400%' OR a.code LIKE '235%'))
            AND (p_from_date IS NOT NULL AND je.entry_date < p_from_date)
            AND (p_currency_code IS NULL OR jel.currency_code = p_currency_code)
        ) prior_raw
        GROUP BY prior_raw.currency
        HAVING SUM(
          CASE
            WHEN v_party_type = 'supplier' THEN prior_raw.credit - prior_raw.debit
            ELSE prior_raw.debit - prior_raw.credit
          END
        ) <> 0
      ) ob_prev
      WHERE p_from_date IS NOT NULL

      UNION ALL

      -- 1.2 Opening balance records in date range
      SELECT
        'OB-' || ob.id::text AS line_id,
        ob.entry_date,
        ob.created_at,
        0 AS is_bf,
        'رصيد افتتاحي' AS ref,
        'رصيد افتتاحي' AS operation_type,
        COALESCE(ob.notes, 'رصيد افتتاحي معتمد') AS description,
        'opening_balance' AS type,
        CASE WHEN ob.direction = 'debit' THEN ob.amount ELSE 0 END AS debit,
        CASE WHEN ob.direction = 'credit' THEN ob.amount ELSE 0 END AS credit,
        ob.currency_code AS currency,
        CASE WHEN ob.direction = 'debit' THEN
          public.fn_to_base_amount(ob.currency_code, ob.amount, (
            SELECT lr.rate_to_base FROM public.exchange_rates lr
            WHERE lr.company_id = p_company_id AND lr.currency_code = ob.currency_code
            ORDER BY lr.effective_date DESC, lr.created_at DESC LIMIT 1
          ))
        ELSE 0 END AS debit_base,
        CASE WHEN ob.direction = 'credit' THEN
          public.fn_to_base_amount(ob.currency_code, ob.amount, (
            SELECT lr.rate_to_base FROM public.exchange_rates lr
            WHERE lr.company_id = p_company_id AND lr.currency_code = ob.currency_code
            ORDER BY lr.effective_date DESC, lr.created_at DESC LIMIT 1
          ))
        ELSE 0 END AS credit_base,
        NULL::uuid AS reference_id,
        'opening_balance' AS reference_type,
        'posted' AS payment_status,
        0::numeric AS paid_amount,
        0::numeric AS remaining_amount,
        0::bigint AS items_count
      FROM public.party_opening_balances ob
      WHERE ob.company_id = p_company_id
        AND ob.party_id = p_party_id
        AND (p_from_date IS NULL OR ob.entry_date >= p_from_date)
        AND (p_to_date IS NULL OR ob.entry_date <= p_to_date)
        AND (p_currency_code IS NULL OR ob.currency_code = p_currency_code)

      UNION ALL

      -- 1.3 Journal lines within the filtered date range with enriched invoice/bond status
      SELECT
        jel.id::text AS line_id,
        je.entry_date,
        jel.created_at,
        0 AS is_bf,
        CASE
          WHEN je.reference_type IN ('sales_invoice', 'invoice') THEN COALESCE(inv.invoice_number, 'INV')
          WHEN je.reference_type = 'purchase_invoice' THEN COALESCE(inv.invoice_number, 'PUR')
          WHEN je.reference_type IN ('payment', 'payment_bond') THEN COALESCE(pay.payment_number, 'PAY')
          WHEN je.reference_type IN ('receipt', 'receipt_bond') THEN COALESCE(pay.payment_number, 'RCV')
          WHEN je.reference_type IN ('sale_return', 'sales_return', 'return_sale') THEN COALESCE(inv.invoice_number, 'RET')
          WHEN je.reference_type IN ('purchase_return', 'return_purchase') THEN COALESCE(inv.invoice_number, 'PRET')
          WHEN je.reference_type = 'expense' THEN 'EXP'
          WHEN je.reference_type = 'settlement' THEN 'SETTLE'
          ELSE COALESCE('JV-' || je.entry_number::text, 'JV')
        END AS ref,
        CASE
          WHEN je.reference_type IN ('sales_invoice', 'invoice') THEN 'فاتورة مبيعات'
          WHEN je.reference_type = 'purchase_invoice' THEN 'فاتورة مشتريات'
          WHEN je.reference_type IN ('payment', 'payment_bond') THEN 'سند صرف'
          WHEN je.reference_type IN ('receipt', 'receipt_bond') THEN 'سند قبض'
          WHEN je.reference_type IN ('sale_return', 'sales_return', 'return_sale') THEN 'مرتجع مبيعات'
          WHEN je.reference_type IN ('purchase_return', 'return_purchase') THEN 'مرتجع مشتريات'
          WHEN je.reference_type = 'expense' THEN 'صرف مصروف'
          WHEN je.reference_type = 'settlement' THEN 'تسوية ومقاصة'
          ELSE 'قيد محاسبي'
        END AS operation_type,
        COALESCE(jel.description, je.description, 'حركة محاسبية') AS description,
        je.reference_type AS type,
        CASE WHEN jel.debit_amount > 0 THEN COALESCE(NULLIF(jel.foreign_amount, 0), jel.debit_amount) ELSE 0 END AS debit,
        CASE WHEN jel.credit_amount > 0 THEN COALESCE(NULLIF(jel.foreign_amount, 0), jel.credit_amount) ELSE 0 END AS credit,
        COALESCE(jel.currency_code, v_base_currency) AS currency,
        jel.debit_amount AS debit_base,
        jel.credit_amount AS credit_base,
        COALESCE(inv.id, pay.id, je.reference_id, je.id) AS reference_id,
        COALESCE(je.reference_type, 'journal_entry') AS reference_type,
        CASE
          WHEN inv.id IS NOT NULL THEN
            CASE
              WHEN inv.status = 'paid' OR (inv.paid_amount >= inv.total_amount AND inv.total_amount > 0) THEN 'paid'
              WHEN inv.paid_amount > 0 THEN 'partial'
              WHEN inv.status = 'void' OR inv.status = 'cancelled' THEN 'void'
              ELSE 'unpaid'
            END
          WHEN pay.id IS NOT NULL THEN
            CASE
              WHEN pay.status = 'posted' THEN 'paid'
              WHEN pay.status = 'void' THEN 'void'
              ELSE 'draft'
            END
          ELSE 'posted'
        END AS payment_status,
        COALESCE(inv.paid_amount, pay.amount, 0)::numeric AS paid_amount,
        COALESCE(GREATEST(inv.total_amount - COALESCE(inv.paid_amount, 0), 0), 0)::numeric AS remaining_amount,
        COALESCE(inv_meta.item_count, 0)::bigint AS items_count
      FROM public.journal_entry_lines jel
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      JOIN public.accounts a ON a.id = jel.account_id
      LEFT JOIN public.invoices inv ON inv.id = je.reference_id AND je.reference_type IN ('sales_invoice', 'invoice', 'purchase_invoice', 'sale_return', 'sales_return', 'return_sale', 'purchase_return', 'return_purchase')
      LEFT JOIN public.payments pay ON pay.id = je.reference_id AND je.reference_type IN ('payment', 'payment_bond', 'receipt', 'receipt_bond')
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS item_count
        FROM public.invoice_items ii
        WHERE ii.invoice_id = inv.id
      ) inv_meta ON true
      WHERE je.company_id = p_company_id
        AND je.status = 'posted'
        AND je.deleted_at IS NULL
        AND jel.deleted_at IS NULL
        AND jel.party_id = p_party_id
        AND ((a.code LIKE '1100%' OR a.code LIKE '121%') OR (a.code LIKE '2100%' OR a.code LIKE '231%') OR (a.code LIKE '2400%' OR a.code LIKE '122%') OR (a.code LIKE '1400%' OR a.code LIKE '235%'))
        AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
        AND (p_to_date IS NULL OR je.entry_date <= p_to_date)
        AND (p_currency_code IS NULL OR jel.currency_code = p_currency_code)
    ) sub
  ) t;

  RETURN v_movements;
END;
$function$;

