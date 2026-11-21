-- ============================================================================
-- Migration: 20261121000007_wave3a_p1_inventory_statements_reports.sql
-- Wave 3A (P1): Fix Inventory Adjustments/WAC/Transfers, Party Statement BF Sign,
--               commit_payment Numbering & Closed-Year Profit & Loss Report
-- ============================================================================

-- 1. trg_update_product_stock() — support 'adjustment' as defense-in-depth
CREATE OR REPLACE FUNCTION public.trg_update_product_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_qty_change   numeric;
  v_company_id   uuid;
BEGIN
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
    WHEN 'adjustment'      THEN  NEW.quantity
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

-- 2. fn_update_weighted_avg_cost() — include 'initial' alongside 'opening'
CREATE OR REPLACE FUNCTION public.fn_update_weighted_avg_cost()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old_qty numeric;
  v_old_avg numeric;
  v_new_avg numeric;
  v_company_id uuid;
BEGIN
  IF new.transaction_type IN ('purchase', 'transfer_in', 'adj_in', 'opening', 'initial')
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

-- 3. adjust_stock_atomic() — use adj_in / adj_out with ABS(qty), FOR UPDATE lock, true unit_cost & role guard
CREATE OR REPLACE FUNCTION public.adjust_stock_atomic(
  p_company_id uuid,
  p_product_id uuid,
  p_warehouse_id uuid,
  p_target_quantity numeric,
  p_user_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid        uuid := COALESCE(auth.uid(), p_user_id);
  v_current    numeric := 0;
  v_adjustment numeric;
  v_unit_cost  numeric := 0;
  v_txn_type   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM public.fn_assert_company_access(p_company_id);

  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_uid
      AND ucr.company_id = p_company_id
      AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية تعديل المخزون' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_target_quantity, -1) < 0 THEN
    RAISE EXCEPTION 'الكمية المستهدفة لا يمكن أن تكون سالبة';
  END IF;

  SELECT COALESCE(ps.quantity, 0), COALESCE(NULLIF(ps.weighted_avg_cost, 0), 0)
    INTO v_current, v_unit_cost
    FROM public.product_stock ps
   WHERE ps.company_id = p_company_id
     AND ps.product_id = p_product_id
     AND ps.warehouse_id = p_warehouse_id
   FOR UPDATE;

  IF NOT FOUND THEN
    v_current := 0;
    v_unit_cost := 0;
  END IF;

  IF v_unit_cost = 0 THEN
    SELECT COALESCE(NULLIF(cost_price, 0), purchase_price, 0) INTO v_unit_cost
    FROM public.products
    WHERE id = p_product_id AND company_id = p_company_id;
    v_unit_cost := COALESCE(v_unit_cost, 0);
  END IF;

  v_adjustment := p_target_quantity - v_current;

  IF v_adjustment <> 0 THEN
    v_txn_type := CASE WHEN v_adjustment > 0 THEN 'adj_in' ELSE 'adj_out' END;

    INSERT INTO public.inventory_transactions (
      company_id, created_by, product_id, warehouse_id, quantity,
      unit_cost, total_cost, transaction_type, reference_type
    ) VALUES (
      p_company_id, v_uid, p_product_id, p_warehouse_id, ABS(v_adjustment),
      v_unit_cost, ROUND(ABS(v_adjustment) * v_unit_cost, 4), v_txn_type, 'manual_update'
    );

    BEGIN
      PERFORM public.audit_write(
        'stock_adjusted',
        'inventory_transactions',
        p_product_id,
        p_company_id,
        jsonb_build_object('warehouse_id', p_warehouse_id, 'adjustment', v_adjustment, 'txn_type', v_txn_type)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'adjustment', v_adjustment, 'new_quantity', p_target_quantity);
END;
$function$;

-- 4. get_party_statement() — fix supplier brought_forward debit/credit column placement
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
 SET search_path TO 'public', 'pg_temp'
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
      -- 1.1 Balance Brought Forward: place true net debit in debit, true net credit in credit
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
          GREATEST(SUM(prior_raw.debit - prior_raw.credit), 0) AS debit,
          GREATEST(SUM(prior_raw.credit - prior_raw.debit), 0) AS credit,
          GREATEST(SUM(prior_raw.debit_base - prior_raw.credit_base), 0) AS debit_base,
          GREATEST(SUM(prior_raw.credit_base - prior_raw.debit_base), 0) AS credit_base
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
            COALESCE(jel.currency_code, v_base_currency) AS currency,
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
            AND a.deleted_at IS NULL
            AND (
              a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%'
              OR a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%'
            )
            AND (p_from_date IS NOT NULL AND je.entry_date < p_from_date)
            AND (p_currency_code IS NULL OR jel.currency_code = p_currency_code)
        ) prior_raw
        GROUP BY prior_raw.currency
        HAVING SUM(prior_raw.debit - prior_raw.credit) <> 0
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

      -- 1.3 Journal lines within date range
      SELECT
        jel.id::text AS line_id,
        je.entry_date,
        jel.created_at,
        0 AS is_bf,
        CASE
          WHEN je.reference_type IN ('sales_invoice', 'invoice') THEN COALESCE(inv.invoice_number, 'INV')
          WHEN je.reference_type = 'purchase_invoice' THEN COALESCE(inv.invoice_number, 'PUR')
          WHEN je.reference_type IN ('payment', 'payment_bond') THEN COALESCE(pay.payment_number, 'PAY')
          WHEN je.reference_type IN ('receipt', 'receipt_bond', 'voucher') THEN COALESCE(pay.payment_number, 'RCV')
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
          WHEN je.reference_type IN ('receipt', 'receipt_bond', 'voucher') THEN 'سند قبض'
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
      LEFT JOIN public.payments pay ON pay.id = je.reference_id AND je.reference_type IN ('payment', 'payment_bond', 'receipt', 'receipt_bond', 'voucher')
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
        AND a.deleted_at IS NULL
        AND (
          a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%'
          OR a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%'
        )
        AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
        AND (p_to_date IS NULL OR je.entry_date <= p_to_date)
        AND (p_currency_code IS NULL OR jel.currency_code = p_currency_code)
    ) sub
  ) t;

  RETURN v_movements;
END;
$function$;

-- 5. commit_payment() — safe regex numbering + open fiscal year + auth.uid() + app.rpc_authorized
CREATE OR REPLACE FUNCTION public.commit_payment(
  p_company_id uuid,
  p_user_id uuid,
  p_type text,
  p_amount numeric,
  p_date date,
  p_cash_account_id uuid,
  p_counterparty_type text DEFAULT NULL::text,
  p_counterparty_id uuid DEFAULT NULL::uuid,
  p_description text DEFAULT ''::text,
  p_payment_method text DEFAULT 'cash'::text,
  p_reference_number text DEFAULT ''::text,
  p_currency_code text DEFAULT 'SAR'::text,
  p_exchange_rate numeric DEFAULT 1,
  p_foreign_amount numeric DEFAULT NULL::numeric,
  p_branch_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid            uuid := COALESCE(auth.uid(), p_user_id);
  v_company        uuid;
  v_payment_id     uuid;
  v_payment_number text;
  v_max_num        bigint;
  v_fiscal_year_id uuid;
BEGIN
  v_company := public.verify_company_access(p_company_id);

  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: مبلغ السند يجب أن يكون أكبر من الصفر';
  END IF;

  SELECT id INTO v_fiscal_year_id FROM public.fiscal_years
  WHERE company_id = v_company AND is_closed = false
    AND p_date BETWEEN start_date AND end_date
  LIMIT 1;

  IF v_fiscal_year_id IS NULL THEN
    RAISE EXCEPTION 'fiscal_year_closed: التاريخ يقع خارج سنة مالية مفتوحة';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('payment_number:' || v_company::text));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(payment_number, '\D', '', 'g'), '')::bigint), 0) + 1
  INTO v_max_num
  FROM public.payments WHERE company_id = v_company;
  v_payment_number := v_max_num::text;

  PERFORM set_config('app.rpc_authorized', 'true', true);

  INSERT INTO public.payments (
    company_id, payment_number, type, amount,
    currency_code, exchange_rate, payment_date, payment_method,
    account_id, counterparty_account_id, reference_type, notes, status,
    created_by, branch_id, party_id
  ) VALUES (
    v_company, v_payment_number, p_type, COALESCE(NULLIF(p_foreign_amount, 0), p_amount),
    p_currency_code, p_exchange_rate, p_date, p_payment_method,
    p_cash_account_id,
    CASE WHEN p_counterparty_type = 'account' THEN p_counterparty_id ELSE NULL END,
    'bond', p_description, 'posted',
    v_uid, p_branch_id,
    CASE WHEN p_counterparty_type = 'party' THEN p_counterparty_id ELSE NULL END
  ) RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object('id', v_payment_id, 'payment_number', v_payment_number);
END;
$function$;

-- 6. report_profit_loss() — exclude fiscal_year_closing entries so closed years still report real P&L
CREATE OR REPLACE FUNCTION public.report_profit_loss(
  p_company_id uuid,
  p_from date DEFAULT NULL::date,
  p_to date DEFAULT NULL::date,
  p_branch_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(category text, amount numeric, type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_from date := COALESCE(p_from, make_date(EXTRACT(YEAR FROM COALESCE(p_to, CURRENT_DATE))::int, 1, 1));
  v_to   date := COALESCE(p_to, CURRENT_DATE);
  v_revenue numeric := 0;
  v_expense numeric := 0;
  v_net_profit numeric := 0;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  WITH rev_exp_accounts AS (
     SELECT id, accounts.type AS act_type
     FROM public.accounts
     WHERE accounts.company_id = p_company_id
       AND accounts.type IN ('revenue', 'expense')
       AND accounts.deleted_at IS NULL
  ),
  entries AS (
     SELECT id
     FROM public.journal_entries
     WHERE journal_entries.company_id = p_company_id
       AND journal_entries.status = 'posted'
       AND journal_entries.deleted_at IS NULL
       AND COALESCE(journal_entries.reference_type, '') <> 'fiscal_year_closing'
       AND journal_entries.entry_date BETWEEN v_from AND v_to
       AND (p_branch_id IS NULL OR journal_entries.branch_id = p_branch_id)
  ),
  line_totals AS (
     SELECT
        rea.act_type,
        SUM(l.debit_amount)  AS debit_amount,
        SUM(l.credit_amount) AS credit_amount
     FROM entries e
     JOIN public.journal_entry_lines l
       ON l.journal_entry_id = e.id
      AND l.company_id = p_company_id
      AND l.deleted_at IS NULL
     JOIN rev_exp_accounts rea
       ON rea.id = l.account_id
     GROUP BY rea.act_type
  )
  SELECT
    COALESCE(MAX(CASE WHEN lt.act_type = 'revenue' THEN lt.credit_amount - lt.debit_amount ELSE 0 END), 0),
    COALESCE(MAX(CASE WHEN lt.act_type = 'expense' THEN lt.debit_amount - lt.credit_amount ELSE 0 END), 0)
  INTO v_revenue, v_expense
  FROM line_totals lt;

  v_net_profit := v_revenue - v_expense;

  category := 'الإيرادات'; amount := v_revenue; type := 'revenue'; RETURN NEXT;
  category := 'المصروفات'; amount := v_expense; type := 'expense'; RETURN NEXT;
  category := 'صافي الربح/الخسارة'; amount := v_net_profit; type := 'net_profit'; RETURN NEXT;
END;
$function$;

-- 7. process_stock_transfer() — add FOR UPDATE row lock + role guard
CREATE OR REPLACE FUNCTION public.process_stock_transfer(p_transfer_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer    RECORD;
  v_item        RECORD;
  v_avail_qty   numeric;
  v_unit_cost   numeric;
BEGIN
  SELECT * INTO v_transfer FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF v_transfer IS NULL THEN
    RAISE EXCEPTION 'التحويل غير موجود: %', p_transfer_id;
  END IF;

  IF NOT public.is_super_admin() AND NOT EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = auth.uid()
        AND ucr.company_id = v_transfer.company_id
        AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية تنفيذ التحويل المخزني' USING ERRCODE = '42501';
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

    IF v_unit_cost IS NULL OR v_unit_cost = 0 THEN
      SELECT COALESCE(NULLIF(cost_price, 0), purchase_price, 0) INTO v_unit_cost FROM public.products WHERE id = v_item.product_id;
    END IF;
    v_unit_cost := COALESCE(v_unit_cost, 0);

    PERFORM public.fn_post_inventory_movement(
      v_transfer.company_id, v_item.product_id, v_transfer.from_warehouse_id, v_item.quantity,
      'transfer_out', 'stock_transfer', p_transfer_id, COALESCE(auth.uid(), v_transfer.created_by), v_unit_cost
    );
    PERFORM public.fn_post_inventory_movement(
      v_transfer.company_id, v_item.product_id, v_transfer.to_warehouse_id, v_item.quantity,
      'transfer_in', 'stock_transfer', p_transfer_id, COALESCE(auth.uid(), v_transfer.created_by), v_unit_cost
    );
  END LOOP;

  UPDATE public.stock_transfers SET status = 'completed', updated_at = now() WHERE id = p_transfer_id;
  RETURN p_transfer_id;
END;
$function$;

-- 8. reverse_stock_transfer() — add FOR UPDATE lock + destination stock sufficiency check
CREATE OR REPLACE FUNCTION public.reverse_stock_transfer(p_transfer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer  RECORD;
  v_item      RECORD;
  v_dest_qty  numeric;
BEGIN
  SELECT * INTO v_transfer FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF v_transfer IS NULL THEN RAISE EXCEPTION 'التحويل غير موجود: %', p_transfer_id; END IF;

  IF NOT public.is_super_admin() AND NOT EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = auth.uid() AND ucr.company_id = v_transfer.company_id
        AND ucr.role IN ('owner','admin','accountant')
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية عكس التحويل المخزني' USING ERRCODE = '42501';
  END IF;

  IF v_transfer.status <> 'completed' THEN
    RAISE EXCEPTION 'لا يمكن عكس تحويل غير منفَّذ (الحالة الحالية: %)', v_transfer.status;
  END IF;

  FOR v_item IN
    SELECT it.product_id, ABS(it.quantity) AS quantity, it.unit_cost
    FROM public.inventory_transactions it
    WHERE it.reference_type = 'stock_transfer' AND it.reference_id = p_transfer_id
      AND it.transaction_type = 'transfer_out'
      AND it.deleted_at IS NULL
  LOOP
    SELECT COALESCE(ps.quantity, 0) INTO v_dest_qty
    FROM public.product_stock ps
    WHERE ps.company_id = v_transfer.company_id
      AND ps.product_id = v_item.product_id
      AND ps.warehouse_id = v_transfer.to_warehouse_id
    FOR UPDATE;

    IF COALESCE(v_dest_qty, 0) < v_item.quantity THEN
      RAISE EXCEPTION 'الكمية المتوفرة في المستودع الوجهة (%) غير كافية لعكس التحويل للصنف (%)',
        COALESCE(v_dest_qty, 0), v_item.product_id;
    END IF;

    PERFORM public.fn_post_inventory_movement(
      v_transfer.company_id, v_item.product_id, v_transfer.to_warehouse_id, v_item.quantity,
      'transfer_out', 'stock_transfer_reversal', p_transfer_id, auth.uid(), v_item.unit_cost
    );
    PERFORM public.fn_post_inventory_movement(
      v_transfer.company_id, v_item.product_id, v_transfer.from_warehouse_id, v_item.quantity,
      'transfer_in', 'stock_transfer_reversal', p_transfer_id, auth.uid(), v_item.unit_cost
    );
  END LOOP;

  UPDATE public.stock_transfers SET status = 'cancelled', updated_at = now() WHERE id = p_transfer_id;

  RETURN jsonb_build_object('success', true, 'transfer_id', p_transfer_id, 'note', 'reversed_via_offsetting_movements');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.adjust_stock_atomic(uuid, uuid, uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.adjust_stock_atomic(uuid, uuid, uuid, numeric, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_party_statement(uuid, uuid, date, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_party_statement(uuid, uuid, date, date, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.commit_payment(uuid, uuid, text, numeric, date, uuid, text, uuid, text, text, text, text, numeric, numeric, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.commit_payment(uuid, uuid, text, numeric, date, uuid, text, uuid, text, text, text, text, numeric, numeric, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.report_profit_loss(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.report_profit_loss(uuid, date, date, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.process_stock_transfer(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.process_stock_transfer(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reverse_stock_transfer(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reverse_stock_transfer(uuid) TO authenticated, service_role;
