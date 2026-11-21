-- ============================================================================
-- Wave 12: Chart of Accounts Scientific Reclassification, Missing System
--          Accounts, Accounting Integrity Triggers & RPC Hardening
-- ----------------------------------------------------------------------------
-- Applied live on dagfjncoullstrhbjssr across:
--   * wave12a_coa_reclassification_and_system_accounts
--   * wave12b_coa_governance_triggers_and_rpcs
-- ============================================================================

-- 1. Harden prevent_system_account_modification to ALSO block soft-delete on system accounts
CREATE OR REPLACE FUNCTION public.prevent_system_account_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system = true THEN
      RAISE EXCEPTION 'لا يمكن حذف الحسابات الأساسية للنظام';
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_system = true THEN
      IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        RAISE EXCEPTION 'لا يمكن حذف الحسابات الأساسية للنظام';
      END IF;
      IF NEW.code <> OLD.code
         OR NEW.type <> OLD.type
         OR NEW.company_id <> OLD.company_id
         OR NEW.currency_code <> OLD.currency_code
         OR NEW.is_system = false
      THEN
        RAISE EXCEPTION 'لا يمكن تعديل خصائص الحسابات الأساسية للنظام';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 2. Enforce scientific accounting integrity on public.accounts
CREATE OR REPLACE FUNCTION public.enforce_account_accounting_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_parent_type text;
  v_parent_company uuid;
  v_parent_deleted timestamptz;
  v_has_posted_lines boolean;
  v_has_children boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id IS NOT NULL AND (
    TG_OP = 'INSERT'
    OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
    OR NEW.type IS DISTINCT FROM OLD.type
  ) THEN
    SELECT a.type, a.company_id, a.deleted_at
      INTO v_parent_type, v_parent_company, v_parent_deleted
    FROM public.accounts a
    WHERE a.id = NEW.parent_id;

    IF NOT FOUND OR v_parent_deleted IS NOT NULL THEN
      RAISE EXCEPTION 'الحساب الرئيسي المحدد غير موجود أو محذوف';
    END IF;

    IF v_parent_company <> NEW.company_id THEN
      RAISE EXCEPTION 'لا يمكن ربط الحساب بحساب رئيسي يتبع شركة أخرى';
    END IF;

    IF v_parent_type <> NEW.type THEN
      RAISE EXCEPTION 'يجب أن يطابق نوع الحساب الفرعي (%) نوع الحساب الرئيسي (%)', NEW.type, v_parent_type;
    END IF;

    IF TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entry_lines jel
        JOIN public.journal_entries je ON je.id = jel.journal_entry_id
        WHERE jel.account_id = NEW.parent_id
          AND jel.deleted_at IS NULL
          AND je.deleted_at IS NULL
          AND je.status = 'posted'
      ) INTO v_has_posted_lines;

      IF v_has_posted_lines THEN
        RAISE EXCEPTION 'لا يمكن إضافة حساب فرعي تحت حساب يحتوي بالفعل على قيود محاسبية مرحَّلة';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.type IS DISTINCT FROM OLD.type THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.journal_entry_lines jel
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      WHERE jel.account_id = NEW.id
        AND jel.deleted_at IS NULL
        AND je.deleted_at IS NULL
        AND je.status = 'posted'
    ) INTO v_has_posted_lines;

    IF v_has_posted_lines THEN
      RAISE EXCEPTION 'لا يمكن تغيير نوع حساب محاسبي يحتوي على قيود مرحَّلة';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.accounts ch
      WHERE ch.parent_id = NEW.id
        AND ch.deleted_at IS NULL
    ) INTO v_has_children;

    IF v_has_children THEN
      RAISE EXCEPTION 'لا يمكن تغيير نوع حساب رئيسي له حسابات فرعية مرتبطة';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE TRIGGER trg_enforce_account_accounting_integrity
BEFORE INSERT OR UPDATE OF parent_id, type, deleted_at ON public.accounts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_account_accounting_integrity();

-- 3. Keep allow_posting synchronized in both directions
CREATE OR REPLACE FUNCTION public.sync_allow_posting_on_parent_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.parent_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE public.accounts
      SET allow_posting = false
      WHERE id = NEW.parent_id AND allow_posting = true;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.parent_id IS NOT NULL AND (
    NEW.parent_id IS DISTINCT FROM OLD.parent_id
    OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.accounts ch
      WHERE ch.parent_id = OLD.parent_id AND ch.deleted_at IS NULL
    ) THEN
      UPDATE public.accounts
      SET allow_posting = true
      WHERE id = OLD.parent_id AND allow_posting = false;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE TRIGGER trg_sync_allow_posting
AFTER INSERT OR UPDATE OF parent_id, deleted_at ON public.accounts
FOR EACH ROW
EXECUTE FUNCTION public.sync_allow_posting_on_parent_change();

-- 4. Close privilege escalation in soft_delete_account_guarded (owner/admin/super_admin ONLY)
CREATE OR REPLACE FUNCTION public.soft_delete_account_guarded(p_company_id uuid, p_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_lines     integer;
  v_children  integer;
  v_is_system boolean;
BEGIN
  IF NOT (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_company_roles ucr
      WHERE ucr.user_id = auth.uid()
        AND ucr.company_id = p_company_id
        AND ucr.role IN ('owner', 'admin')
    )
  ) THEN
    RAISE EXCEPTION 'access_denied: حذف الحسابات من دليل الحسابات مقتصر على المالك أو المدير العام فقط'
      USING ERRCODE = '42501';
  END IF;

  SELECT a.is_system INTO v_is_system
  FROM public.accounts a
  WHERE a.id = p_account_id
    AND a.company_id = p_company_id
    AND a.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'account_not_found: الحساب غير موجود أو تم حذفه مسبقاً';
  END IF;

  IF v_is_system THEN
    RAISE EXCEPTION 'is_system: لا يمكن حذف حساب نظام';
  END IF;

  SELECT count(*) INTO v_lines
  FROM public.journal_entry_lines jel
  WHERE jel.account_id = p_account_id
    AND jel.deleted_at IS NULL;

  IF v_lines > 0 THEN
    RAISE EXCEPTION 'has_journal_entries: لا يمكن حذف حساب له قيود محاسبية مرتبطة. قم بتصفير الرصيد أولاً.';
  END IF;

  SELECT count(*) INTO v_children
  FROM public.accounts c
  WHERE c.parent_id = p_account_id
    AND c.company_id = p_company_id
    AND c.deleted_at IS NULL;

  IF v_children > 0 THEN
    RAISE EXCEPTION 'has_children: لا يمكن حذف حساب رئيسي له حسابات فرعية مرتبطة.';
  END IF;

  UPDATE public.accounts
     SET deleted_at = now()
   WHERE id = p_account_id
     AND company_id = p_company_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'account_not_found: الحساب غير موجود أو تم حذفه مسبقاً';
  END IF;

  RETURN jsonb_build_object('ok', true, 'account_id', p_account_id);
END;
$function$;

-- 5. Exact inverse of fn_to_base_amount + fix foreign_balance in report_account_balances
CREATE OR REPLACE FUNCTION public.fn_from_base_amount(
  p_currency_code text,
  p_base_amount numeric,
  p_exchange_rate numeric DEFAULT 1
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_base_amount IS NULL OR p_base_amount = 0 THEN 0::numeric
    WHEN UPPER(TRIM(COALESCE(p_currency_code, 'SAR'))) = 'SAR' THEN ROUND(p_base_amount, 4)
    WHEN COALESCE(p_exchange_rate, 1) <= 0 THEN ROUND(p_base_amount, 4)
    WHEN COALESCE(p_exchange_rate, 1) < 1 THEN ROUND(p_base_amount / p_exchange_rate, 4)
    WHEN UPPER(TRIM(p_currency_code)) = 'YER' THEN ROUND(p_base_amount * p_exchange_rate, 4)
    ELSE ROUND(p_base_amount / p_exchange_rate, 4)
  END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_from_base_amount(text, numeric, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.report_account_balances(
  p_company_id uuid,
  p_as_of_date date DEFAULT CURRENT_DATE,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  account_id uuid,
  balance numeric,
  total_debit numeric,
  total_credit numeric,
  foreign_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_base_currency text;
  v_as_of date;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  SELECT base_currency INTO v_base_currency
  FROM public.companies
  WHERE id = p_company_id;

  v_as_of := COALESCE(p_as_of_date, CURRENT_DATE);

  RETURN QUERY
  SELECT
    l.account_id,
    (SUM(l.debit_amount) - SUM(l.credit_amount))::numeric AS balance,
    SUM(l.debit_amount)::numeric AS total_debit,
    SUM(l.credit_amount)::numeric AS total_credit,
    CASE
      WHEN a.currency_code = v_base_currency OR a.currency_code IS NULL THEN
        SUM(l.debit_amount) - SUM(l.credit_amount)
      ELSE
        SUM(
          CASE
            WHEN l.foreign_amount IS NOT NULL AND l.foreign_amount <> 0 THEN
              CASE WHEN l.debit_amount >= l.credit_amount THEN ABS(l.foreign_amount) ELSE -ABS(l.foreign_amount) END
            WHEN COALESCE(l.exchange_rate, 0) > 0 THEN
              CASE
                WHEN l.debit_amount >= l.credit_amount THEN
                  public.fn_from_base_amount(COALESCE(l.currency_code, a.currency_code), l.debit_amount - l.credit_amount, l.exchange_rate)
                ELSE
                  -public.fn_from_base_amount(COALESCE(l.currency_code, a.currency_code), l.credit_amount - l.debit_amount, l.exchange_rate)
              END
            ELSE
              l.debit_amount - l.credit_amount
          END
        )
    END::numeric AS foreign_balance
  FROM public.journal_entry_lines l
  JOIN public.journal_entries j
    ON j.id = l.journal_entry_id
   AND j.company_id = p_company_id
   AND j.status = 'posted'
   AND j.deleted_at IS NULL
   AND j.entry_date <= v_as_of
  JOIN public.accounts a
    ON a.id = l.account_id
   AND a.company_id = p_company_id
  WHERE l.company_id = p_company_id
    AND l.deleted_at IS NULL
    AND (p_branch_id IS NULL OR COALESCE(l.branch_id, j.branch_id) = p_branch_id)
  GROUP BY l.account_id, a.currency_code
  ORDER BY l.account_id;
END;
$function$;

-- 6. Fix get_cash_account fallback for bank/transfer/wire (1020 OR 1030%)
CREATE OR REPLACE FUNCTION public.get_cash_account(p_currency text, p_method text, p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  IF p_method IN ('bank', 'transfer', 'wire') THEN
    SELECT id INTO v_id
    FROM public.accounts
    WHERE company_id = p_company_id
      AND deleted_at IS NULL
      AND allow_posting = true
      AND (code = '1020' OR code LIKE '1030%')
    ORDER BY (code = '1020') DESC, code ASC
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  SELECT id INTO v_id
  FROM public.accounts
  WHERE company_id = p_company_id
    AND deleted_at IS NULL
    AND allow_posting = true
    AND code = CASE p_currency
      WHEN 'SAR' THEN '101001'
      WHEN 'YER' THEN '101002'
      WHEN 'USD' THEN '101003'
      WHEN 'OMR' THEN '101004'
      WHEN 'CNY' THEN '101005'
      ELSE '101001'
    END
  LIMIT 1;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM public.accounts
    WHERE company_id = p_company_id
      AND deleted_at IS NULL
      AND allow_posting = true
      AND code LIKE '1010%'
    ORDER BY code ASC
    LIMIT 1;
  END IF;

  RETURN v_id;
END;
$function$;

-- 7. Fix report_profit_loss_detailed COGS classification (51%, 312%, MZ-51%)
CREATE OR REPLACE FUNCTION public.report_profit_loss_detailed(
  p_company_id uuid,
  p_from date,
  p_to date,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  total_debit numeric,
  total_credit numeric,
  balance numeric,
  is_cogs boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);

  RETURN QUERY
  SELECT
    a.id,
    a.code,
    a.name_ar,
    a.type,
    COALESCE(SUM(jel.debit_amount), 0),
    COALESCE(SUM(jel.credit_amount), 0),
    CASE
      WHEN a.type = 'revenue' THEN COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0)
      ELSE COALESCE(SUM(jel.debit_amount) - SUM(jel.credit_amount), 0)
    END,
    (a.code = '5100' OR a.code LIKE '51%' OR a.code LIKE '312%' OR a.code LIKE 'MZ-51%')
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.type IN ('revenue', 'expense')
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date BETWEEN p_from AND p_to
    AND (p_branch_id IS NULL OR COALESCE(jel.branch_id, je.branch_id) = p_branch_id)
  GROUP BY a.id, a.code, a.name_ar, a.type
  HAVING COALESCE(SUM(jel.debit_amount), 0) <> 0 OR COALESCE(SUM(jel.credit_amount), 0) <> 0
  ORDER BY a.code ASC;
END;
$function$;

-- 8. Tighten accounts_insert & accounts_update RLS to company-wide managers/owners/admins only
ALTER POLICY accounts_insert ON public.accounts
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      company_id IN (SELECT public.fn_auth_all_branch_companies())
      AND EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        WHERE ucr.user_id = (SELECT auth.uid())
          AND ucr.company_id = accounts.company_id
          AND ucr.role IN ('owner', 'admin', 'accountant', 'manager')
      )
    )
  );

ALTER POLICY accounts_update ON public.accounts
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id IN (SELECT public.fn_auth_all_branch_companies())
      AND EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        WHERE ucr.user_id = (SELECT auth.uid())
          AND ucr.company_id = accounts.company_id
          AND ucr.role IN ('owner', 'admin', 'accountant', 'manager')
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      company_id IN (SELECT public.fn_auth_all_branch_companies())
      AND EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        WHERE ucr.user_id = (SELECT auth.uid())
          AND ucr.company_id = accounts.company_id
          AND ucr.role IN ('owner', 'admin', 'accountant', 'manager')
      )
    )
  );
