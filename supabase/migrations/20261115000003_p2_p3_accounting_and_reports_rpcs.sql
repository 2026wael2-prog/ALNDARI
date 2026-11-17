-- ==============================================================================
-- P2 & P3: Accounting Seeding/Migration RPCs & Server-Side Currency Diffs Report
-- ==============================================================================

-- 1. Atomic migrate_cashbox_balances_atomic (P2)
CREATE OR REPLACE FUNCTION public.migrate_cashbox_balances_atomic(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_main_id uuid;
  v_sar_id uuid;
  v_main_balance numeric := 0;
  v_amount numeric;
  v_is_debit boolean;
  v_journal_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_uid AND ucr.company_id = p_company_id
      AND ucr.role IN ('owner', 'admin', 'accountant')
  ) THEN
    RAISE EXCEPTION 'access_denied: لا تملك صلاحية ترحيل أرصدة الصناديق' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_main_id
  FROM public.accounts
  WHERE company_id = p_company_id AND code = '1010' AND deleted_at IS NULL
  LIMIT 1;
  IF v_main_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على الصندوق الرئيسي';
  END IF;

  SELECT id INTO v_sar_id
  FROM public.accounts
  WHERE company_id = p_company_id AND parent_id = v_main_id AND currency_code = 'SAR' AND deleted_at IS NULL
  LIMIT 1;
  IF v_sar_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على صندوق الكاش السعودي. قم بتقسيم الصندوق أولاً.';
  END IF;

  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
    INTO v_main_balance
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.company_id = p_company_id
    AND jel.account_id = v_main_id
    AND jel.deleted_at IS NULL
    AND je.status = 'posted'
    AND je.deleted_at IS NULL;

  IF v_main_balance = 0 THEN
    RETURN jsonb_build_object('migrated', false, 'message', 'لا يوجد رصيد لنقله في الصندوق الرئيسي.');
  END IF;

  v_amount := ABS(v_main_balance);
  v_is_debit := v_main_balance > 0;

  v_journal_id := public.post_manual_journal(
    p_company_id := p_company_id,
    p_user_id := v_uid,
    p_date := CURRENT_DATE,
    p_description := 'نقل رصيد الصندوق الرئيسي إلى صندوق الكاش السعودي',
    p_lines := jsonb_build_array(
      jsonb_build_object(
        'account_id', v_sar_id,
        'debit', CASE WHEN v_is_debit THEN v_amount ELSE 0 END,
        'credit', CASE WHEN v_is_debit THEN 0 ELSE v_amount END,
        'description', 'نقل رصيد الكاش - السعودي'
      ),
      jsonb_build_object(
        'account_id', v_main_id,
        'debit', CASE WHEN v_is_debit THEN 0 ELSE v_amount END,
        'credit', CASE WHEN v_is_debit THEN v_amount ELSE 0 END,
        'description', 'نقل رصيد الكاش - من الصندوق الرئيسي'
      )
    ),
    p_currency_code := 'SAR',
    p_exchange_rate := 1,
    p_reference_type := 'cashbox_split'
  );

  RETURN jsonb_build_object(
    'migrated', true,
    'journal_id', v_journal_id,
    'amount', v_amount,
    'message', 'تم نقل رصيد الصندوق الرئيسي إلى صندوق الكاش السعودي عبر قيد محاسبي متوازن.'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.migrate_cashbox_balances_atomic(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.migrate_cashbox_balances_atomic(uuid) TO authenticated, service_role;


-- 2. Atomic seed_sub_cashboxes_atomic & seed_yemeni_exchanges_atomic (P2)
CREATE OR REPLACE FUNCTION public.seed_sub_cashboxes_atomic(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_main_id uuid;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  IF NOT is_super_admin() AND NOT user_is_admin_or_manager(p_company_id) THEN
    RAISE EXCEPTION 'access_denied: يتطلب صلاحية مدير أو مالك' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_main_id
  FROM public.accounts
  WHERE company_id = p_company_id AND code = '1010' AND deleted_at IS NULL
  LIMIT 1;

  IF v_main_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على الصندوق الرئيسي (1010)';
  END IF;

  INSERT INTO public.accounts (company_id, code, name_ar, type, currency_code, parent_id, is_system)
  SELECT p_company_id, v.code, v.name_ar, 'asset', v.currency_code, v_main_id, true
  FROM (VALUES
    ('101001', 'صندوق الكاش - ريال سعودي', 'SAR'),
    ('101002', 'صندوق الكاش - ريال يمني', 'YER'),
    ('101003', 'صندوق الكاش - دولار أمريكي', 'USD'),
    ('101004', 'صندوق الكاش - ريال عماني', 'OMR'),
    ('101005', 'صندوق الكاش - يوان صيني', 'CNY')
  ) AS v(code, name_ar, currency_code)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.company_id = p_company_id
      AND a.parent_id = v_main_id
      AND a.currency_code = v.currency_code
      AND a.deleted_at IS NULL
  );

  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.seed_sub_cashboxes_atomic(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_sub_cashboxes_atomic(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.seed_yemeni_exchanges_atomic(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_id uuid;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  IF NOT is_super_admin() AND NOT user_is_admin_or_manager(p_company_id) THEN
    RAISE EXCEPTION 'access_denied: يتطلب صلاحية مدير أو مالك' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_parent_id
  FROM public.accounts
  WHERE company_id = p_company_id AND code = '1030' AND deleted_at IS NULL
  LIMIT 1;

  IF v_parent_id IS NULL THEN
    INSERT INTO public.accounts (company_id, code, name_ar, type, currency_code, is_system)
    VALUES (p_company_id, '1030', 'شركات الصرافة', 'asset', 'SAR', true)
    RETURNING id INTO v_parent_id;
  END IF;

  INSERT INTO public.accounts (company_id, code, name_ar, type, currency_code, parent_id, is_system)
  SELECT p_company_id, v.code, v.name_ar, 'asset', 'SAR', v_parent_id, false
  FROM (VALUES
    ('103001', 'شركة الكريمي للصرافة'),
    ('103002', 'النجم للصرافة والتحويلات'),
    ('103003', 'الامتياز للصرافة'),
    ('103004', 'الياباني للصرافة')
  ) AS v(code, name_ar)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.company_id = p_company_id
      AND a.code = v.code
      AND a.deleted_at IS NULL
  );

  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.seed_yemeni_exchanges_atomic(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_yemeni_exchanges_atomic(uuid) TO authenticated, service_role;


-- 3. Server-Side Currency Diffs & Unrealized FX Gain/Loss Report RPC (P3)
CREATE OR REPLACE FUNCTION public.get_currency_diffs_report(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  currency_code text,
  balance numeric,
  unrealized_gain numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base_currency text;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency
  FROM public.companies c
  WHERE c.id = p_company_id
  LIMIT 1;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  RETURN QUERY
  WITH latest_rates AS (
    SELECT DISTINCT ON (er.currency_code)
      er.currency_code,
      er.rate_to_base
    FROM public.exchange_rates er
    WHERE er.company_id = p_company_id
    ORDER BY er.currency_code, er.effective_date DESC NULLS LAST, er.created_at DESC NULLS LAST
  ),
  foreign_accounts AS (
    SELECT a.id, a.name_ar, a.currency_code
    FROM public.accounts a
    WHERE a.company_id = p_company_id
      AND a.deleted_at IS NULL
      AND a.currency_code IS NOT NULL
      AND a.currency_code <> v_base_currency
  ),
  line_aggs AS (
    SELECT
      jel.account_id,
      SUM(
        CASE WHEN COALESCE(jel.debit_amount, 0) >= COALESCE(jel.credit_amount, 0) THEN 1 ELSE -1 END *
        CASE
          WHEN COALESCE(jel.foreign_amount, 0) > 0 THEN jel.foreign_amount
          WHEN COALESCE(jel.exchange_rate, 1) > 0 AND COALESCE(jel.exchange_rate, 1) <> 1 THEN
            CASE
              WHEN COALESCE(sc.exchange_operator, CASE WHEN fa.currency_code IN ('YER','CNY') THEN 'divide' ELSE 'multiply' END) = 'divide'
                THEN ABS(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) *
                     CASE WHEN jel.exchange_rate < 1 THEN 1.0 / jel.exchange_rate ELSE jel.exchange_rate END
              ELSE ABS(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) / jel.exchange_rate
            END
          ELSE ABS(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0))
        END
      ) AS foreign_balance,
      SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) AS book_value_base
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN foreign_accounts fa ON fa.id = jel.account_id
    LEFT JOIN public.supported_currencies sc ON sc.code = fa.currency_code
    WHERE jel.company_id = p_company_id
      AND jel.deleted_at IS NULL
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
      AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id)
    GROUP BY jel.account_id
  )
  SELECT
    fa.id,
    fa.name_ar AS name,
    fa.currency_code,
    COALESCE(la.foreign_balance, 0)::numeric(14,2) AS balance,
    CASE
      WHEN lr.rate_to_base IS NOT NULL AND lr.rate_to_base > 0 THEN
        ROUND(
          public.fn_to_base_amount(fa.currency_code, COALESCE(la.foreign_balance, 0), lr.rate_to_base, v_base_currency)
          - COALESCE(la.book_value_base, 0),
          2
        )
      ELSE 0::numeric
    END AS unrealized_gain
  FROM foreign_accounts fa
  LEFT JOIN line_aggs la ON la.account_id = fa.id
  LEFT JOIN latest_rates lr ON lr.currency_code = fa.currency_code
  ORDER BY fa.currency_code, fa.name_ar;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_currency_diffs_report(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_currency_diffs_report(uuid, uuid) TO authenticated, service_role;
