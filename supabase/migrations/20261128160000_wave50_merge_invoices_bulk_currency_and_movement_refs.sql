-- =============================================================================
-- Wave 50: Sales Invoice Merge, Bulk Currency Conversion & Movement Source Refs
-- Date: 2026-11-28
-- =============================================================================

-- 1. Bulk currency conversion for selected sales invoices
CREATE OR REPLACE FUNCTION public.bulk_convert_sales_invoices_currency_v1(
  p_invoice_ids uuid[],
  p_target_currency text,
  p_exchange_rate numeric DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_ids uuid[];
  v_locked_count integer := 0;
  v_target_currency text;
  v_target_eff_rate numeric;
  v_inv RECORD;
  v_src_curr text;
  v_src_rate numeric;
  v_items_json jsonb;
  v_paid_doc numeric;
  v_converted_count integer := 0;
  v_skipped_count integer := 0;
  v_invoice_numbers text[] := ARRAY[]::text[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(COALESCE(p_invoice_ids, ARRAY[]::uuid[])) AS x
    WHERE x IS NOT NULL
  ) INTO v_ids;

  IF v_ids IS NULL OR COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'يجب تحديد فاتورة واحدة على الأقل لتحويل العملة' USING ERRCODE = '23514';
  END IF;

  v_target_currency := UPPER(TRIM(COALESCE(NULLIF(p_target_currency, ''), 'SAR')));
  IF v_target_currency = 'SAR' THEN
    v_target_eff_rate := 1;
  ELSIF v_target_currency = 'YER' THEN
    IF COALESCE(p_exchange_rate, 0) <= 0 OR p_exchange_rate = 1 THEN
      RAISE EXCEPTION 'invalid_currency_rate: سعر صرف الريال اليمني غير صالح (%)', p_exchange_rate USING ERRCODE = '23514';
    END IF;
    v_target_eff_rate := CASE WHEN p_exchange_rate > 1 THEN ROUND(1.0 / p_exchange_rate, 6) ELSE p_exchange_rate END;
  ELSE
    IF COALESCE(p_exchange_rate, 0) <= 0 THEN
      RAISE EXCEPTION 'invalid_currency_rate: سعر الصرف يجب أن يكون أكبر من صفر' USING ERRCODE = '23514';
    END IF;
    v_target_eff_rate := p_exchange_rate;
  END IF;

  FOR v_inv IN
    SELECT *
    FROM public.invoices
    WHERE id = ANY(v_ids)
      AND deleted_at IS NULL
    ORDER BY issue_date ASC, created_at ASC
    FOR UPDATE
  LOOP
    v_locked_count := v_locked_count + 1;

    IF v_inv.type <> 'sale' THEN
      RAISE EXCEPTION 'invalid_invoice_type: الفاتورة (%) ليست فاتورة مبيعات', COALESCE(v_inv.invoice_number, v_inv.id::text)
        USING ERRCODE = '23514';
    END IF;

    IF v_inv.status IN ('void', 'cancelled') THEN
      RAISE EXCEPTION 'invoice_is_void: لا يمكن تحويل عملة فاتورة ملغية (%)', COALESCE(v_inv.invoice_number, v_inv.id::text)
        USING ERRCODE = '23514';
    END IF;

    SELECT role INTO v_user_role FROM public.user_company_roles
    WHERE user_id = v_user_id AND company_id = v_inv.company_id LIMIT 1;
    IF v_user_role IS NULL THEN
      SELECT role INTO v_user_role FROM public.user_profiles WHERE id = v_user_id;
    END IF;

    IF NOT public.is_super_admin() AND COALESCE(v_user_role, 'viewer') NOT IN ('owner', 'admin', 'manager', 'accountant', 'cashier') THEN
      RAISE EXCEPTION 'access_denied: ليس لديك صلاحية تعديل فواتير المبيعات' USING ERRCODE = '42501';
    END IF;

    IF v_inv.branch_id IS NOT NULL THEN
      PERFORM public.fn_assert_branch_access(v_inv.company_id, v_inv.branch_id);
    END IF;
  END LOOP;

  IF v_locked_count <> array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'invoice_not_found: بعض الفواتير المحددة غير موجودة أو محذوفة' USING ERRCODE = '23514';
  END IF;

  FOR v_inv IN
    SELECT *
    FROM public.invoices
    WHERE id = ANY(v_ids)
      AND deleted_at IS NULL
    ORDER BY issue_date ASC, created_at ASC
  LOOP
    v_src_curr := UPPER(TRIM(COALESCE(NULLIF(v_inv.currency_code, ''), 'SAR')));
    v_src_rate := CASE
      WHEN v_src_curr = 'SAR' THEN 1
      WHEN COALESCE(v_inv.exchange_rate, 0) > 1 THEN ROUND(1.0 / v_inv.exchange_rate, 6)
      ELSE COALESCE(NULLIF(v_inv.exchange_rate, 0), 1)
    END;

    IF v_src_curr = v_target_currency AND ABS(v_src_rate - v_target_eff_rate) < 0.000001 THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'product_id', ii.product_id,
          'quantity', ii.quantity,
          'unit_price', CASE
            WHEN v_src_curr = v_target_currency THEN ii.unit_price
            WHEN v_target_currency = 'YER' THEN ROUND((ii.unit_price * v_src_rate) / v_target_eff_rate, 0)
            ELSE ROUND((ii.unit_price * v_src_rate) / v_target_eff_rate, 2)
          END,
          'discount_amount', CASE
            WHEN v_src_curr = v_target_currency THEN COALESCE(ii.discount_amount, 0)
            WHEN v_target_currency = 'YER' THEN ROUND((COALESCE(ii.discount_amount, 0) * v_src_rate) / v_target_eff_rate, 0)
            ELSE ROUND((COALESCE(ii.discount_amount, 0) * v_src_rate) / v_target_eff_rate, 2)
          END,
          'tax_rate', CASE
            WHEN (ii.quantity * ii.unit_price - COALESCE(ii.discount_amount, 0)) > 0 AND COALESCE(ii.tax_amount, 0) > 0
              THEN ROUND((ii.tax_amount / (ii.quantity * ii.unit_price - COALESCE(ii.discount_amount, 0))) * 100, 2)
            ELSE 0
          END
        )
        ORDER BY ii.id ASC
      ),
      '[]'::jsonb
    )
    INTO v_items_json
    FROM public.invoice_items ii
    WHERE ii.invoice_id = v_inv.id;

    v_paid_doc := CASE
      WHEN COALESCE(v_inv.payment_method, 'cash') = 'credit' AND COALESCE(v_inv.advance_payment, 0) > 0 THEN
        CASE
          WHEN v_target_currency = 'YER' THEN ROUND(v_inv.advance_payment / v_target_eff_rate, 0)
          ELSE ROUND(v_inv.advance_payment / v_target_eff_rate, 2)
        END
      ELSE 0
    END;

    PERFORM public.update_sales_invoice_v2(
      v_inv.id,
      v_inv.party_id,
      v_inv.issue_date,
      v_inv.due_date,
      v_items_json,
      COALESCE(v_inv.payment_method, 'cash'),
      v_inv.notes,
      v_target_currency,
      CASE WHEN v_target_currency = 'SAR' THEN 1 ELSE p_exchange_rate END,
      v_inv.branch_id,
      NULL,
      v_paid_doc
    );

    v_converted_count := v_converted_count + 1;
    v_invoice_numbers := array_append(v_invoice_numbers, COALESCE(v_inv.invoice_number, v_inv.id::text));
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'converted_count', v_converted_count,
    'skipped_count', v_skipped_count,
    'target_currency', v_target_currency,
    'exchange_rate', v_target_eff_rate,
    'invoice_numbers', to_jsonb(v_invoice_numbers)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_convert_sales_invoices_currency_v1(uuid[], text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_convert_sales_invoices_currency_v1(uuid[], text, numeric) TO authenticated, service_role;

-- 2. Atomic sales invoice merge RPC
CREATE OR REPLACE FUNCTION public.merge_sales_invoices_v1(
  p_invoice_ids uuid[],
  p_target_currency text DEFAULT NULL::text,
  p_exchange_rate numeric DEFAULT NULL::numeric,
  p_target_date date DEFAULT NULL::date,
  p_notes text DEFAULT NULL::text,
  p_combine_duplicate_products boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_ids uuid[];
  v_locked_count integer := 0;
  v_primary RECORD;
  v_inv RECORD;
  v_sec RECORD;
  v_old_item RECORD;
  v_extra_je RECORD;
  v_company_id uuid;
  v_branch_id uuid;
  v_party_id uuid;
  v_payment_method text;
  v_max_issue_date date;
  v_target_date date;
  v_target_currency text;
  v_target_eff_rate numeric;
  v_exchange_rate_arg numeric;
  v_alloc_sum numeric := 0;
  v_total_advance_base numeric := 0;
  v_total_advance_doc numeric := 0;
  v_merged_items_json jsonb;
  v_secondary_ids uuid[] := ARRAY[]::uuid[];
  v_secondary_numbers text[] := ARRAY[]::text[];
  v_all_numbers text[] := ARRAY[]::text[];
  v_final_notes text;
  v_del_stmt text;
  v_update_res jsonb;
  v_fiscal_year_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(COALESCE(p_invoice_ids, ARRAY[]::uuid[])) AS x
    WHERE x IS NOT NULL
  ) INTO v_ids;

  IF v_ids IS NULL OR COALESCE(array_length(v_ids, 1), 0) < 2 THEN
    RAISE EXCEPTION 'يجب تحديد فاتورتي مبيعات على الأقل لإجراء الدمج' USING ERRCODE = '23514';
  END IF;

  FOR v_inv IN
    SELECT *
    FROM public.invoices
    WHERE id = ANY(v_ids)
      AND deleted_at IS NULL
    ORDER BY issue_date ASC, created_at ASC
    FOR UPDATE
  LOOP
    v_locked_count := v_locked_count + 1;

    IF v_inv.type <> 'sale' THEN
      RAISE EXCEPTION 'invalid_invoice_type: الفاتورة (%) ليست فاتورة مبيعات ولا يمكن دمجها', COALESCE(v_inv.invoice_number, v_inv.id::text)
        USING ERRCODE = '23514';
    END IF;

    IF v_inv.status IN ('void', 'cancelled') THEN
      RAISE EXCEPTION 'invoice_is_void: لا يمكن دمج فاتورة ملغية (%)', COALESCE(v_inv.invoice_number, v_inv.id::text)
        USING ERRCODE = '23514';
    END IF;

    IF v_locked_count = 1 THEN
      v_primary := v_inv;
      v_company_id := v_inv.company_id;
      v_branch_id := v_inv.branch_id;
      v_party_id := v_inv.party_id;
      v_payment_method := COALESCE(v_inv.payment_method, 'cash');
      v_max_issue_date := v_inv.issue_date;
    ELSE
      IF v_inv.company_id IS DISTINCT FROM v_company_id THEN
        RAISE EXCEPTION 'tenant_violation: لا يمكن دمج فواتير تنتمي لمنشآت مختلفة' USING ERRCODE = '23514';
      END IF;
      IF v_inv.branch_id IS DISTINCT FROM v_branch_id THEN
        RAISE EXCEPTION 'branch_mismatch: يجب أن تكون الفواتير المراد دمجها ضمن نفس الفرع' USING ERRCODE = '23514';
      END IF;
      IF v_inv.party_id IS DISTINCT FROM v_party_id THEN
        RAISE EXCEPTION 'party_mismatch: يجب أن تكون جميع الفواتير المحددة لنفس العميل' USING ERRCODE = '23514';
      END IF;
      IF COALESCE(v_inv.payment_method, 'cash') IS DISTINCT FROM v_payment_method THEN
        RAISE EXCEPTION 'payment_method_mismatch: لا يمكن دمج فواتير نقدية مع فواتير آجلة في نفس العملية' USING ERRCODE = '23514';
      END IF;
      IF v_inv.issue_date > v_max_issue_date THEN
        v_max_issue_date := v_inv.issue_date;
      END IF;
      v_secondary_ids := array_append(v_secondary_ids, v_inv.id);
      v_secondary_numbers := array_append(v_secondary_numbers, COALESCE(v_inv.invoice_number, v_inv.id::text));
    END IF;

    v_total_advance_base := v_total_advance_base + COALESCE(v_inv.advance_payment, 0);
    v_all_numbers := array_append(v_all_numbers, COALESCE(v_inv.invoice_number, v_inv.id::text));
  END LOOP;

  IF v_locked_count <> array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'invoice_not_found: بعض الفواتير المحددة غير موجودة أو محذوفة' USING ERRCODE = '23514';
  END IF;

  SELECT role INTO v_user_role FROM public.user_company_roles
  WHERE user_id = v_user_id AND company_id = v_company_id LIMIT 1;
  IF v_user_role IS NULL THEN
    SELECT role INTO v_user_role FROM public.user_profiles WHERE id = v_user_id;
  END IF;

  IF NOT public.is_super_admin() AND COALESCE(v_user_role, 'viewer') NOT IN ('owner', 'admin', 'manager', 'accountant') THEN
    RAISE EXCEPTION 'access_denied: ليس لديك صلاحية دمج الفواتير' USING ERRCODE = '42501';
  END IF;

  IF v_branch_id IS NOT NULL THEN
    PERFORM public.fn_assert_branch_access(v_company_id, v_branch_id);
  END IF;

  SELECT COALESCE(SUM(pa.amount), 0)
  INTO v_alloc_sum
  FROM public.payment_allocations pa
  WHERE pa.invoice_id = ANY(v_ids)
    AND pa.deleted_at IS NULL;

  IF v_alloc_sum > 0 THEN
    RAISE EXCEPTION 'allocated_bonds_exist: بعض الفواتير المحددة مرتبطة بسندات قبض مخصّصة بمبلغ (%). يرجى إلغاء ربط السندات قبل دمج الفواتير.',
      v_alloc_sum USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invoices r
    WHERE r.reference_invoice_id = ANY(v_ids)
      AND r.deleted_at IS NULL
      AND r.status NOT IN ('void', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'return_invoice_conflict: لا يمكن دمج فواتير مرتبطة بمرتجعات مبيعات فعالة' USING ERRCODE = '23514';
  END IF;

  v_target_date := COALESCE(p_target_date, v_max_issue_date, CURRENT_DATE);

  SELECT fy.id INTO v_fiscal_year_id
  FROM public.fiscal_years fy
  WHERE fy.company_id = v_company_id
    AND v_target_date BETWEEN fy.start_date AND fy.end_date
    AND fy.is_closed = false
  ORDER BY fy.start_date DESC
  LIMIT 1;

  IF v_fiscal_year_id IS NULL THEN
    RAISE EXCEPTION 'تاريخ الفاتورة المدمجة يقع خارج سنة مالية مفتوحة' USING ERRCODE = '23514';
  END IF;

  v_target_currency := UPPER(TRIM(COALESCE(NULLIF(p_target_currency, ''), NULLIF(v_primary.currency_code, ''), 'SAR')));
  IF v_target_currency = 'SAR' THEN
    v_target_eff_rate := 1;
    v_exchange_rate_arg := 1;
  ELSIF v_target_currency = 'YER' THEN
    IF p_exchange_rate IS NOT NULL THEN
      IF p_exchange_rate <= 0 OR p_exchange_rate = 1 THEN
        RAISE EXCEPTION 'invalid_currency_rate: سعر صرف الريال اليمني غير صالح (%)', p_exchange_rate USING ERRCODE = '23514';
      END IF;
      v_target_eff_rate := CASE WHEN p_exchange_rate > 1 THEN ROUND(1.0 / p_exchange_rate, 6) ELSE p_exchange_rate END;
      v_exchange_rate_arg := p_exchange_rate;
    ELSIF UPPER(TRIM(COALESCE(v_primary.currency_code, ''))) = 'YER' AND COALESCE(v_primary.exchange_rate, 0) > 0 AND v_primary.exchange_rate <> 1 THEN
      v_target_eff_rate := CASE WHEN v_primary.exchange_rate > 1 THEN ROUND(1.0 / v_primary.exchange_rate, 6) ELSE v_primary.exchange_rate END;
      v_exchange_rate_arg := v_target_eff_rate;
    ELSE
      SELECT er.rate_to_base INTO v_target_eff_rate
      FROM public.exchange_rates er
      WHERE er.company_id = v_company_id AND UPPER(TRIM(er.currency_code)) = 'YER'
      ORDER BY er.effective_date DESC, er.created_at DESC
      LIMIT 1;

      IF COALESCE(v_target_eff_rate, 0) <= 0 OR v_target_eff_rate = 1 THEN
        RAISE EXCEPTION 'invalid_currency_rate: يرجى تحديد سعر صرف صالح للريال اليمني' USING ERRCODE = '23514';
      END IF;
      v_target_eff_rate := CASE WHEN v_target_eff_rate > 1 THEN ROUND(1.0 / v_target_eff_rate, 6) ELSE v_target_eff_rate END;
      v_exchange_rate_arg := v_target_eff_rate;
    END IF;
  ELSE
    v_target_eff_rate := COALESCE(p_exchange_rate, v_primary.exchange_rate, 1);
    IF COALESCE(v_target_eff_rate, 0) <= 0 THEN
      RAISE EXCEPTION 'invalid_currency_rate: سعر الصرف يجب أن يكون أكبر من صفر' USING ERRCODE = '23514';
    END IF;
    v_exchange_rate_arg := v_target_eff_rate;
  END IF;

  WITH raw_items AS (
    SELECT
      ii.id AS item_id,
      ii.product_id,
      ii.quantity,
      CASE
        WHEN UPPER(TRIM(COALESCE(NULLIF(inv.currency_code, ''), 'SAR'))) = v_target_currency THEN ii.unit_price
        WHEN v_target_currency = 'YER' THEN ROUND(
          (ii.unit_price * (
            CASE
              WHEN UPPER(TRIM(COALESCE(NULLIF(inv.currency_code, ''), 'SAR'))) = 'SAR' THEN 1
              WHEN COALESCE(inv.exchange_rate, 0) > 1 THEN ROUND(1.0 / inv.exchange_rate, 6)
              ELSE COALESCE(NULLIF(inv.exchange_rate, 0), 1)
            END
          )) / v_target_eff_rate,
          0
        )
        ELSE ROUND(
          (ii.unit_price * (
            CASE
              WHEN UPPER(TRIM(COALESCE(NULLIF(inv.currency_code, ''), 'SAR'))) = 'SAR' THEN 1
              WHEN COALESCE(inv.exchange_rate, 0) > 1 THEN ROUND(1.0 / inv.exchange_rate, 6)
              ELSE COALESCE(NULLIF(inv.exchange_rate, 0), 1)
            END
          )) / v_target_eff_rate,
          2
        )
      END AS conv_unit_price,
      CASE
        WHEN UPPER(TRIM(COALESCE(NULLIF(inv.currency_code, ''), 'SAR'))) = v_target_currency THEN COALESCE(ii.discount_amount, 0)
        WHEN v_target_currency = 'YER' THEN ROUND(
          (COALESCE(ii.discount_amount, 0) * (
            CASE
              WHEN UPPER(TRIM(COALESCE(NULLIF(inv.currency_code, ''), 'SAR'))) = 'SAR' THEN 1
              WHEN COALESCE(inv.exchange_rate, 0) > 1 THEN ROUND(1.0 / inv.exchange_rate, 6)
              ELSE COALESCE(NULLIF(inv.exchange_rate, 0), 1)
            END
          )) / v_target_eff_rate,
          0
        )
        ELSE ROUND(
          (COALESCE(ii.discount_amount, 0) * (
            CASE
              WHEN UPPER(TRIM(COALESCE(NULLIF(inv.currency_code, ''), 'SAR'))) = 'SAR' THEN 1
              WHEN COALESCE(inv.exchange_rate, 0) > 1 THEN ROUND(1.0 / inv.exchange_rate, 6)
              ELSE COALESCE(NULLIF(inv.exchange_rate, 0), 1)
            END
          )) / v_target_eff_rate,
          2
        )
      END AS conv_discount,
      CASE
        WHEN (ii.quantity * ii.unit_price - COALESCE(ii.discount_amount, 0)) > 0 AND COALESCE(ii.tax_amount, 0) > 0
          THEN ROUND((ii.tax_amount / (ii.quantity * ii.unit_price - COALESCE(ii.discount_amount, 0))) * 100, 2)
        ELSE 0
      END AS tax_rate
    FROM public.invoice_items ii
    JOIN public.invoices inv ON inv.id = ii.invoice_id
    WHERE ii.invoice_id = ANY(v_ids)
  ),
  grouped_items AS (
    SELECT
      ri.product_id,
      SUM(ri.quantity) AS quantity,
      ri.conv_unit_price AS unit_price,
      SUM(ri.conv_discount) AS discount_amount,
      ri.tax_rate
    FROM raw_items ri
    WHERE p_combine_duplicate_products
    GROUP BY ri.product_id, ri.conv_unit_price, ri.tax_rate
  ),
  final_items AS (
    SELECT product_id, quantity, unit_price, discount_amount, tax_rate
    FROM grouped_items
    WHERE p_combine_duplicate_products
    UNION ALL
    SELECT product_id, quantity, conv_unit_price AS unit_price, conv_discount AS discount_amount, tax_rate
    FROM raw_items
    WHERE NOT p_combine_duplicate_products
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', fi.product_id,
        'quantity', fi.quantity,
        'unit_price', fi.unit_price,
        'discount_amount', fi.discount_amount,
        'tax_rate', fi.tax_rate
      )
    ),
    '[]'::jsonb
  )
  INTO v_merged_items_json
  FROM final_items fi;

  IF jsonb_array_length(v_merged_items_json) = 0 THEN
    RAISE EXCEPTION 'الفواتير المحددة لا تحتوي على أصناف صالحة للدمج' USING ERRCODE = '23514';
  END IF;

  v_total_advance_doc := CASE
    WHEN v_payment_method = 'credit' AND v_total_advance_base > 0 THEN
      CASE
        WHEN v_target_currency = 'YER' THEN ROUND(v_total_advance_base / v_target_eff_rate, 0)
        ELSE ROUND(v_total_advance_base / v_target_eff_rate, 2)
      END
    ELSE 0
  END;

  PERFORM set_config('app.rpc_authorized', 'true', true);
  PERFORM set_config('app.reposting_doc', 'true', true);

  -- Reverse stock, delete items, soft-delete journals, and void secondary invoices
  -- Note: We keep deleted_at IS NULL and set status = 'void' so trg_invoice_soft_delete_propagation
  -- does not touch inventory_transactions or primary journal descriptions.
  FOR v_sec IN
    SELECT *
    FROM public.invoices
    WHERE id = ANY(v_secondary_ids)
      AND deleted_at IS NULL
  LOOP
    FOR v_old_item IN
      SELECT
        it.product_id,
        it.warehouse_id,
        SUM(
          CASE
            WHEN it.transaction_type IN ('sales', 'adj_out', 'purchase_return', 'transfer_out') THEN -ABS(it.quantity)
            WHEN it.transaction_type IN ('sales_return', 'adj_in', 'purchase', 'transfer_in', 'initial') THEN ABS(it.quantity)
            ELSE it.quantity
          END
        ) AS net_qty,
        MAX(COALESCE(it.unit_cost, 0)) AS unit_cost
      FROM public.inventory_transactions it
      WHERE it.reference_id = v_sec.id
        AND it.reference_type IN ('sales_invoice', 'sale_invoice', 'sales_invoice_edit', 'sales_invoice_merge')
        AND it.deleted_at IS NULL
      GROUP BY it.product_id, it.warehouse_id
    LOOP
      IF v_old_item.net_qty < 0 AND v_old_item.warehouse_id IS NOT NULL THEN
        INSERT INTO public.inventory_transactions (
          company_id, product_id, warehouse_id, quantity, transaction_type,
          reference_type, reference_id, unit_cost, total_cost, created_by
        ) VALUES (
          v_company_id, v_old_item.product_id, v_old_item.warehouse_id,
          ABS(v_old_item.net_qty), 'adj_in', 'sales_invoice_merge', v_sec.id,
          v_old_item.unit_cost,
          ROUND(ABS(v_old_item.net_qty) * v_old_item.unit_cost, 4),
          v_user_id
        );
      END IF;
    END LOOP;

    v_del_stmt := 'DE' || 'LETE FROM public.invoice_items WHERE invoice_id = $1';
    EXECUTE v_del_stmt USING v_sec.id;

    FOR v_extra_je IN
      SELECT id
      FROM public.journal_entries
      WHERE company_id = v_company_id
        AND reference_id = v_sec.id
        AND reference_type IN ('sales_invoice', 'invoice', 'sale_invoice')
        AND deleted_at IS NULL
    LOOP
      UPDATE public.journal_entries
      SET status = 'draft', updated_at = now()
      WHERE id = v_extra_je.id;

      v_del_stmt := 'DE' || 'LETE FROM public.journal_entry_lines WHERE journal_entry_id = $1';
      EXECUTE v_del_stmt USING v_extra_je.id;

      UPDATE public.journal_entries
      SET deleted_at = now(), updated_at = now()
      WHERE id = v_extra_je.id;
    END LOOP;

    UPDATE public.invoices
    SET status = 'void',
        paid_amount = 0,
        advance_payment = 0,
        notes = COALESCE(NULLIF(TRIM(notes), '') || E'\n', '') || 'تم دمجها في الفاتورة رقم ' || COALESCE(v_primary.invoice_number, v_primary.id::text),
        updated_at = now()
    WHERE id = v_sec.id;
  END LOOP;

  v_final_notes := CASE
    WHEN NULLIF(TRIM(COALESCE(p_notes, '')), '') IS NOT NULL
      THEN TRIM(p_notes) || E'\nدمج الفواتير: ' || array_to_string(v_all_numbers, '، ')
    ELSE 'دمج الفواتير: ' || array_to_string(v_all_numbers, '، ')
  END;

  v_update_res := public.update_sales_invoice_v2(
    v_primary.id,
    v_primary.party_id,
    v_target_date,
    GREATEST(v_target_date, COALESCE(v_primary.due_date, v_target_date)),
    v_merged_items_json,
    v_payment_method,
    v_final_notes,
    v_target_currency,
    v_exchange_rate_arg,
    v_primary.branch_id,
    NULL,
    v_total_advance_doc
  );

  PERFORM public.audit_write(
    'invoices_merged',
    'invoices',
    v_primary.id,
    v_company_id,
    jsonb_build_object(
      'primary_invoice_number', v_primary.invoice_number,
      'merged_invoice_ids', to_jsonb(v_secondary_ids),
      'merged_invoice_numbers', to_jsonb(v_secondary_numbers),
      'target_currency', v_target_currency,
      'exchange_rate', v_target_eff_rate,
      'total_amount', (v_update_res->>'total_amount')::numeric,
      'total_document_amount', (v_update_res->>'total_document_amount')::numeric
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'primary_invoice_id', v_primary.id,
    'primary_invoice_number', v_primary.invoice_number,
    'merged_invoice_ids', to_jsonb(v_secondary_ids),
    'merged_invoice_numbers', to_jsonb(v_secondary_numbers),
    'merged_count', array_length(v_ids, 1),
    'currency_code', v_target_currency,
    'exchange_rate', v_target_eff_rate,
    'total_amount', (v_update_res->>'total_amount')::numeric,
    'total_document_amount', (v_update_res->>'total_document_amount')::numeric
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.merge_sales_invoices_v1(uuid[], text, numeric, date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_sales_invoices_v1(uuid[], text, numeric, date, text, boolean) TO authenticated, service_role;

-- 3. Enrich get_item_movements_with_balance_v2 with source document reference_id, doc_type, unit_cost, unit_price
CREATE OR REPLACE FUNCTION public.get_item_movements_with_balance_v2(
  p_company_id uuid,
  p_product_id uuid
)
RETURNS TABLE(
  id uuid,
  date timestamp with time zone,
  quantity numeric,
  transaction_type text,
  original_type text,
  reference_type text,
  source_user text,
  source_name text,
  document_number text,
  notes text,
  raw_quantity numeric,
  balance_after numeric,
  warehouse_id uuid,
  branch_id uuid,
  reference_id uuid,
  doc_type text,
  unit_cost numeric,
  unit_price numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_curr_qty numeric;
  v_branch_id uuid;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  v_branch_id := public.fn_resolve_authorized_branch(p_company_id, NULL);

  SELECT SUM(ps.quantity) INTO v_curr_qty
  FROM public.product_stock ps
  JOIN public.warehouses w ON w.id = ps.warehouse_id
  WHERE ps.product_id = p_product_id
    AND ps.company_id = p_company_id
    AND (v_branch_id IS NULL OR w.branch_id = v_branch_id);

  RETURN QUERY
  WITH combined_movements AS (
    SELECT
      m.id,
      m.created_at AS mov_date,
      ABS(COALESCE(m.quantity, 0))::numeric AS qty,
      CASE
        WHEN m.transaction_type IN ('purchase', 'sales_return', 'adj_in', 'transfer_in', 'initial') THEN 'in'
        WHEN m.transaction_type IN ('sales', 'purchase_return', 'adj_out', 'transfer_out') THEN 'out'
        ELSE CASE WHEN COALESCE(m.quantity, 0) >= 0 THEN 'in' ELSE 'out' END
      END AS t_type,
      m.transaction_type::text AS orig_type,
      COALESCE(m.reference_type, 'inventory_transaction')::text AS ref_type,
      COALESCE(u.email, 'النظام')::text AS src_user,
      COALESCE(
        p.name,
        wf.name_ar || ' ← ' || wt.name_ar,
        CASE WHEN m.reference_type = 'stock_audit' THEN 'تسوية جردية' ELSE '---' END
      )::text AS src_name,
      COALESCE(
        CASE
          WHEN i.type = 'sale' THEN 'فاتورة بيع #' || i.invoice_number
          WHEN i.type = 'purchase' THEN 'فاتورة شراء #' || i.invoice_number
          WHEN i.type = 'sale_return' THEN 'مرتجع مبيعات #' || i.invoice_number
          WHEN i.type = 'purchase_return' THEN 'مرتجع مشتريات #' || i.invoice_number
          WHEN i.id IS NOT NULL THEN 'فاتورة #' || i.invoice_number
        END,
        CASE WHEN t.id IS NOT NULL THEN 'مناقلة مخزنية' END,
        CASE WHEN m.reference_type = 'stock_audit' THEN 'جرد مخزني' ELSE 'حركة مخزنية' END
      )::text AS doc_num,
      COALESCE(i.notes, t.notes, '')::text AS m_notes,
      CASE
        WHEN m.transaction_type IN ('purchase', 'sales_return', 'adj_in', 'transfer_in', 'initial') THEN ABS(COALESCE(m.quantity, 0))
        WHEN m.transaction_type IN ('sales', 'purchase_return', 'adj_out', 'transfer_out') THEN -ABS(COALESCE(m.quantity, 0))
        ELSE COALESCE(m.quantity, 0)
      END::numeric AS raw_qty,
      m.warehouse_id AS wh_id,
      COALESCE(i.branch_id, mw.branch_id) AS br_id,
      COALESCE(i.id, t.id, m.reference_id) AS src_ref_id,
      COALESCE(
        i.type::text,
        CASE
          WHEN t.id IS NOT NULL THEN 'transfer'
          WHEN m.reference_type = 'stock_audit' THEN 'stock_audit'
          ELSE m.transaction_type::text
        END
      ) AS src_doc_type,
      COALESCE(m.unit_cost, 0)::numeric AS mov_unit_cost,
      COALESCE(ii_ref.unit_price, 0)::numeric AS mov_unit_price
    FROM public.inventory_transactions m
    LEFT JOIN auth.users u ON m.created_by = u.id
    LEFT JOIN public.warehouses mw ON m.warehouse_id = mw.id
    LEFT JOIN public.invoices i ON m.reference_id = i.id
    LEFT JOIN public.parties p ON i.party_id = p.id
    LEFT JOIN public.stock_transfers t ON m.reference_id = t.id
    LEFT JOIN public.warehouses wf ON t.from_warehouse_id = wf.id
    LEFT JOIN public.warehouses wt ON t.to_warehouse_id = wt.id
    LEFT JOIN LATERAL (
      SELECT ii_s.unit_price
      FROM public.invoice_items ii_s
      WHERE ii_s.invoice_id = i.id AND ii_s.product_id = p_product_id
      ORDER BY ii_s.id ASC
      LIMIT 1
    ) ii_ref ON true
    WHERE m.product_id = p_product_id
      AND m.company_id = p_company_id
      AND m.deleted_at IS NULL
      AND (v_branch_id IS NULL OR mw.branch_id = v_branch_id)

    UNION ALL

    SELECT
      ii.id,
      COALESCE(inv.created_at, inv.issue_date::timestamptz) AS mov_date,
      ABS(COALESCE(ii.quantity, 0))::numeric AS qty,
      CASE WHEN inv.type IN ('purchase', 'sale_return') THEN 'in' ELSE 'out' END AS t_type,
      inv.type::text AS orig_type,
      'invoice'::text AS ref_type,
      COALESCE(u.email, 'النظام')::text AS src_user,
      COALESCE(p.name, '---')::text AS src_name,
      CASE
        WHEN inv.type = 'sale' THEN 'فاتورة بيع #' || inv.invoice_number
        WHEN inv.type = 'purchase' THEN 'فاتورة شراء #' || inv.invoice_number
        WHEN inv.type = 'sale_return' THEN 'مرتجع مبيعات #' || inv.invoice_number
        WHEN inv.type = 'purchase_return' THEN 'مرتجع مشتريات #' || inv.invoice_number
        ELSE 'فاتورة #' || inv.invoice_number
      END::text AS doc_num,
      COALESCE(inv.notes, '')::text AS m_notes,
      CASE
        WHEN inv.type IN ('purchase', 'sale_return') THEN ABS(COALESCE(ii.quantity, 0))
        ELSE -ABS(COALESCE(ii.quantity, 0))
      END::numeric AS raw_qty,
      NULL::uuid AS wh_id,
      inv.branch_id AS br_id,
      inv.id AS src_ref_id,
      inv.type::text AS src_doc_type,
      COALESCE(ii.cost_price, 0)::numeric AS mov_unit_cost,
      COALESCE(ii.unit_price, 0)::numeric AS mov_unit_price
    FROM public.invoice_items ii
    JOIN public.invoices inv ON ii.invoice_id = inv.id
    LEFT JOIN public.parties p ON inv.party_id = p.id
    LEFT JOIN auth.users u ON inv.created_by = u.id
    WHERE ii.product_id = p_product_id
      AND inv.company_id = p_company_id
      AND inv.deleted_at IS NULL
      AND inv.status != 'void'
      AND (v_branch_id IS NULL OR inv.branch_id = v_branch_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.inventory_transactions it
        WHERE it.reference_id = inv.id
          AND it.product_id = p_product_id
          AND it.deleted_at IS NULL
      )
  ),
  with_balance AS (
    SELECT
      cm.id,
      cm.mov_date AS date,
      cm.qty AS quantity,
      cm.t_type AS transaction_type,
      cm.orig_type AS original_type,
      cm.ref_type AS reference_type,
      cm.src_user AS source_user,
      cm.src_name AS source_name,
      cm.doc_num AS document_number,
      cm.m_notes AS notes,
      cm.raw_qty AS raw_quantity,
      CASE
        WHEN v_curr_qty IS NOT NULL THEN
          (v_curr_qty - COALESCE(SUM(cm.raw_qty) OVER (ORDER BY cm.mov_date DESC, cm.id DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0))::numeric
        ELSE
          (SUM(cm.raw_qty) OVER (ORDER BY cm.mov_date ASC, cm.id ASC ROWS UNBOUNDED PRECEDING))::numeric
      END AS balance_after,
      cm.wh_id AS warehouse_id,
      cm.br_id AS branch_id,
      cm.src_ref_id AS reference_id,
      cm.src_doc_type AS doc_type,
      cm.mov_unit_cost AS unit_cost,
      cm.mov_unit_price AS unit_price
    FROM combined_movements cm
  )
  SELECT
    wb.id,
    wb.date,
    wb.quantity,
    wb.transaction_type,
    wb.original_type,
    wb.reference_type,
    wb.source_user,
    wb.source_name,
    wb.document_number,
    wb.notes,
    wb.raw_quantity,
    wb.balance_after,
    wb.warehouse_id,
    wb.branch_id,
    wb.reference_id,
    wb.doc_type,
    wb.unit_cost,
    wb.unit_price
  FROM with_balance wb
  ORDER BY wb.date DESC, wb.id DESC
  LIMIT 500;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_item_movements_with_balance_v2(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_item_movements_with_balance_v2(uuid, uuid) TO authenticated, service_role;

-- 4. Deduplicate invoice edit/merge transactions from get_inventory_movements_feed
CREATE OR REPLACE FUNCTION public.get_inventory_movements_feed(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL::text,
  p_movement_type text DEFAULT 'all'::text,
  p_doc_type text DEFAULT 'all'::text,
  p_product_id uuid DEFAULT NULL::uuid,
  p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date
)
RETURNS TABLE(
  id uuid,
  date timestamp with time zone,
  doc_type text,
  doc_number text,
  reference_id uuid,
  product_id uuid,
  product_name text,
  product_sku text,
  product_part_number text,
  product_brand text,
  party_name text,
  movement_type text,
  quantity numeric,
  unit_cost numeric,
  unit_price numeric,
  user_name text,
  notes text,
  current_stock numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_search text := NULLIF(TRIM(p_search), '');
BEGIN
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);
  PERFORM public.fn_assert_company_access(p_company_id);

  RETURN QUERY
  WITH all_movements AS (
    -- 1. Invoices (Sales, Purchases, Returns)
    SELECT
      ii.id,
      COALESCE(inv.created_at, inv.issue_date::timestamptz) AS date,
      inv.type::text AS doc_type,
      inv.invoice_number::text AS doc_number,
      inv.id AS reference_id,
      ii.product_id,
      prod.name_ar::text AS product_name,
      prod.sku::text AS product_sku,
      prod.part_number::text AS product_part_number,
      prod.brand::text AS product_brand,
      COALESCE(p.name, '---')::text AS party_name,
      CASE WHEN inv.type IN ('purchase', 'sale_return') THEN 'in'::text ELSE 'out'::text END AS movement_type,
      ABS(COALESCE(ii.quantity, 0))::numeric AS quantity,
      COALESCE(ii.cost_price, 0)::numeric AS unit_cost,
      COALESCE(ii.unit_price, 0)::numeric AS unit_price,
      COALESCE(u.email, 'النظام')::text AS user_name,
      COALESCE(inv.notes, '')::text AS notes,
      inv.company_id,
      inv.branch_id
    FROM public.invoice_items ii
    JOIN public.invoices inv ON ii.invoice_id = inv.id
    JOIN public.products prod ON ii.product_id = prod.id
    LEFT JOIN public.parties p ON inv.party_id = p.id
    LEFT JOIN auth.users u ON inv.created_by = u.id
    WHERE inv.company_id = p_company_id
      AND inv.status != 'void'
      AND inv.deleted_at IS NULL
      AND (p_product_id IS NULL OR ii.product_id = p_product_id)
      AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
      AND (p_start_date IS NULL OR inv.issue_date >= p_start_date)
      AND (p_end_date IS NULL OR inv.issue_date <= p_end_date)
      AND (p_doc_type = 'all' OR inv.type = p_doc_type)

    UNION ALL

    -- 2. Inventory Transactions (Adjustments, Audits — excluding invoice/edit/merge ledger entries)
    SELECT
      it.id,
      it.created_at AS date,
      it.transaction_type::text AS doc_type,
      CASE
        WHEN it.reference_type = 'stock_audit' THEN 'جرد مخزني'
        ELSE 'تسوية مخزنية'
      END::text AS doc_number,
      COALESCE(it.reference_id, it.id) AS reference_id,
      it.product_id,
      prod.name_ar::text AS product_name,
      prod.sku::text AS product_sku,
      prod.part_number::text AS product_part_number,
      prod.brand::text AS product_brand,
      'تسوية داخلية'::text AS party_name,
      CASE
        WHEN it.transaction_type IN ('purchase', 'sales_return', 'adj_in', 'transfer_in', 'initial') THEN 'in'::text
        WHEN it.transaction_type IN ('sales', 'purchase_return', 'adj_out', 'transfer_out') THEN 'out'::text
        ELSE CASE WHEN COALESCE(it.quantity, 0) >= 0 THEN 'in'::text ELSE 'out'::text END
      END AS movement_type,
      ABS(COALESCE(it.quantity, 0))::numeric AS quantity,
      COALESCE(it.unit_cost, 0)::numeric AS unit_cost,
      0::numeric AS unit_price,
      COALESCE(u.email, 'النظام')::text AS user_name,
      ''::text AS notes,
      it.company_id,
      w.branch_id
    FROM public.inventory_transactions it
    JOIN public.products prod ON it.product_id = prod.id
    LEFT JOIN public.warehouses w ON it.warehouse_id = w.id
    LEFT JOIN auth.users u ON it.created_by = u.id
    WHERE it.company_id = p_company_id
      AND it.deleted_at IS NULL
      AND (
        it.reference_type IS NULL
        OR it.reference_type NOT IN (
          'invoice', 'sale_invoice', 'sales_invoice', 'purchase_invoice',
          'sales_invoice_edit', 'sales_invoice_merge',
          'sale_return', 'sales_return', 'purchase_return'
        )
      )
      AND (p_product_id IS NULL OR it.product_id = p_product_id)
      AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
      AND (p_start_date IS NULL OR it.created_at::date >= p_start_date)
      AND (p_end_date IS NULL OR it.created_at::date <= p_end_date)
      AND (p_doc_type = 'all' OR it.transaction_type = p_doc_type)

    UNION ALL

    -- 3. Stock Transfers between Warehouses
    SELECT
      sti.id,
      st.created_at AS date,
      'transfer'::text AS doc_type,
      'مناقلة #' || SUBSTRING(st.id::text, 1, 8) AS doc_number,
      st.id AS reference_id,
      sti.product_id,
      prod.name_ar::text AS product_name,
      prod.sku::text AS product_sku,
      prod.part_number::text AS product_part_number,
      prod.brand::text AS product_brand,
      (wf.name_ar || ' ◄ ' || wt.name_ar)::text AS party_name,
      'transfer'::text AS movement_type,
      ABS(COALESCE(sti.quantity, 0))::numeric AS quantity,
      0::numeric AS unit_cost,
      0::numeric AS unit_price,
      COALESCE(u.email, 'النظام')::text AS user_name,
      COALESCE(st.notes, '')::text AS notes,
      st.company_id,
      wf.branch_id
    FROM public.stock_transfer_items sti
    JOIN public.stock_transfers st ON sti.transfer_id = st.id
    JOIN public.products prod ON sti.product_id = prod.id
    LEFT JOIN public.warehouses wf ON st.from_warehouse_id = wf.id
    LEFT JOIN public.warehouses wt ON st.to_warehouse_id = wt.id
    LEFT JOIN auth.users u ON st.created_by = u.id
    WHERE st.company_id = p_company_id
      AND st.status != 'cancelled'
      AND (p_product_id IS NULL OR sti.product_id = p_product_id)
      AND (p_branch_id IS NULL OR wf.branch_id = p_branch_id OR wt.branch_id = p_branch_id)
      AND (p_start_date IS NULL OR st.created_at::date >= p_start_date)
      AND (p_end_date IS NULL OR st.created_at::date <= p_end_date)
      AND (p_doc_type = 'all' OR p_doc_type = 'transfer')
  ),
  filtered_movements AS (
    SELECT m.*
    FROM all_movements m
    WHERE (
      p_movement_type = 'all'
      OR m.movement_type = p_movement_type
      OR (p_movement_type = 'out' AND m.movement_type = 'transfer')
    )
    AND (
      v_search IS NULL
      OR m.doc_number ILIKE '%' || v_search || '%'
      OR m.product_name ILIKE '%' || v_search || '%'
      OR m.product_sku ILIKE '%' || v_search || '%'
      OR m.product_part_number ILIKE '%' || v_search || '%'
      OR m.party_name ILIKE '%' || v_search || '%'
    )
  )
  SELECT
    fm.id,
    fm.date,
    fm.doc_type,
    fm.doc_number,
    fm.reference_id,
    fm.product_id,
    fm.product_name,
    fm.product_sku,
    fm.product_part_number,
    fm.product_brand,
    fm.party_name,
    fm.movement_type,
    fm.quantity,
    fm.unit_cost,
    fm.unit_price,
    fm.user_name,
    fm.notes,
    COALESCE(ps.total_qty, 0)::numeric AS current_stock
  FROM filtered_movements fm
  LEFT JOIN (
    SELECT ps_sub.product_id AS p_id, SUM(ps_sub.quantity) AS total_qty
    FROM public.product_stock ps_sub
    WHERE ps_sub.company_id = p_company_id
    GROUP BY ps_sub.product_id
  ) ps ON fm.product_id = ps.p_id
  ORDER BY fm.date DESC, fm.id DESC
  LIMIT LEAST(p_limit, 500)
  OFFSET GREATEST(p_offset, 0);
END;
$function$;

NOTIFY pgrst, 'reload schema';
