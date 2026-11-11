-- ============================================================
-- إصلاح ترتيب ترحيل قيد المصروف في commit_expense_v2 (posted-first → draft-first)
-- 2026-11-04
-- ============================================================
-- العرض:
--   إنشاء أي مصروف من الواجهة يفشل بـ HTTP 400 على rpc/commit_expense_v2،
--   والخطأ الحقيقي في سجل Postgres:
--     23514: Cannot add lines to a posted journal entry (Entry: <uuid>). Use reversal.
--     CONTEXT: prevent_posted_journal_line_modification() line 13
--              commit_expense_v2(uuid,uuid,jsonb) line 198
--
-- السبب الجذري (نفس نمط ADR-005/006/007: posted-first):
--   إعادة إنشاء الدالة في 20261104000001 (تصحيح عملة الأساس) انطلقت من نسخة أقدم
--   من الجسم (20261001000001) كانت تُدرج رأس journal_entries بحالة 'posted'
--   **قبل** إدراج بنود journal_entry_lines، فيمنعه trigger
--   trg_journal_entry_lines_immutability بالكود 23514 وترتد المعاملة كاملة —
--   أي أن إصلاح 20260907000005 (draft-first) قد ضاع.
--
-- الإصلاح:
--   الرأس يُدرج 'draft' → تُضاف البنود → UPDATE status='posted'
--   (نفس نمط 20260907000005 و fn_auto_post_payment_journal في 20261103000008).
--   جسم الدالة مأخوذ حرفياً من التعريف الحي في القاعدة (pg_get_functiondef)
--   مع تعديل ترتيب الترحيل فقط، حتى لا تُفقد أي تحسينات سابقة (عملة الأساس،
--   المعاملة الذرية، حفظ المبلغ الأجنبي، branch_id، السنة المالية).
--
-- ملاحظة حماية من الانحدار:
--   أي هجرة تعيد تعريف دالة قائمة يجب أن تنطلق من التعريف الحي، لا من ملف هجرة أقدم.
--
-- التوقيع والصلاحيات لم تتغيّر: (uuid, uuid, jsonb) — authenticated + service_role فقط.
-- الهجرة idempotent (CREATE OR REPLACE + REVOKE/GRANT).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.commit_expense_v2(p_company_id uuid, p_user_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();   -- لا نأتمن p_user_id القادم من العميل على created_by
  v_expense_id uuid;
  v_voucher_number text;
  v_category_id uuid;
  v_amount numeric;
  v_base_amount numeric;
  v_base_currency text;
  v_currency_code text;
  v_exchange_rate numeric;
  v_date date;
  v_description text;
  v_payment_method text;
  v_branch_id uuid;
  v_fiscal_year_id uuid;
  v_cash_account_id uuid;
  v_expense_account_id uuid;
  v_entry_id uuid;
  v_raw_cat text;
  v_raw_branch text;
  v_raw_amount text;
  v_raw_rate text;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id_required: معرف المنشأة مطلوب';
  END IF;

  PERFORM public.verify_company_access(p_company_id);

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'عذراً، يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
  END IF;

  -- مصدر الحقيقة للعملة: عملة المنشأة الأساسية (كانت SAR مفترضة قسراً)
  SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency
    FROM public.companies c
   WHERE c.id = p_company_id
   LIMIT 1;
  v_base_currency := COALESCE(v_base_currency, 'SAR');

  -- 1) تصفية معرف التصنيف (UUID سليم + ملكية المنشأة)
  v_raw_cat := TRIM(COALESCE(p_data->>'category_id', ''));
  IF v_raw_cat <> '' AND v_raw_cat ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_category_id := v_raw_cat::uuid;
  ELSE
    v_category_id := NULL;
  END IF;

  IF v_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.expense_categories ec
    WHERE ec.id = v_category_id AND ec.company_id = p_company_id AND ec.deleted_at IS NULL
  ) THEN
    v_category_id := NULL;
  END IF;

  IF v_category_id IS NULL THEN
    SELECT ec.id INTO v_category_id FROM public.expense_categories ec
    WHERE ec.company_id = p_company_id AND ec.deleted_at IS NULL
    ORDER BY ec.is_system DESC, ec.created_at ASC
    LIMIT 1;

    IF v_category_id IS NULL THEN
      INSERT INTO public.expense_categories (company_id, name, is_system)
      VALUES (p_company_id, 'مصروفات عامة', true)
      RETURNING id INTO v_category_id;
    END IF;
  END IF;

  -- 2) تصفية المبلغ
  v_raw_amount := REPLACE(REPLACE(COALESCE(p_data->>'amount', '0'), ',', '.'), ' ', '');
  v_amount := COALESCE(NULLIF(v_raw_amount, '')::numeric, 0);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: مبلغ المصروف يجب أن يكون أكبر من الصفر';
  END IF;

  -- 3) العملة وسعر الصرف (استرجاع أحدث سعر مسجل عند غياب السعر)
  v_currency_code := UPPER(COALESCE(NULLIF(TRIM(p_data->>'currency_code'), ''), NULLIF(TRIM(p_data->>'currency'), ''), v_base_currency));

  v_raw_rate := REPLACE(TRIM(COALESCE(p_data->>'exchange_rate', '')), ',', '.');
  IF v_raw_rate <> '' AND v_raw_rate ~ '^[0-9]+(\.[0-9]+)?$' THEN
    v_exchange_rate := v_raw_rate::numeric;
  ELSE
    v_exchange_rate := NULL;
  END IF;

  IF v_currency_code = v_base_currency THEN
    v_exchange_rate := 1;
  ELSIF v_exchange_rate IS NULL OR v_exchange_rate <= 0 THEN
    SELECT er.rate_to_base INTO v_exchange_rate
    FROM public.exchange_rates er
    WHERE er.company_id = p_company_id AND er.currency_code = v_currency_code
    ORDER BY er.effective_date DESC, er.created_at DESC
    LIMIT 1;
    v_exchange_rate := COALESCE(NULLIF(v_exchange_rate, 0), 1);
  END IF;

  -- 4) تحويل المبلغ إلى عملة الأساس (المُسند المعتمد fn_to_base_amount)
  v_base_amount := public.fn_to_base_amount(v_currency_code, v_amount, v_exchange_rate, v_base_currency);
  -- 5) تصفية التاريخ والفرع
  BEGIN
    v_date := COALESCE(
      NULLIF(p_data->>'expense_date', '')::date,
      NULLIF(p_data->>'date', '')::date,
      CURRENT_DATE
    );
  EXCEPTION WHEN OTHERS THEN
    v_date := CURRENT_DATE;
  END;

  v_description := COALESCE(NULLIF(TRIM(p_data->>'description'), ''), 'مصروف نثري');
  v_payment_method := COALESCE(NULLIF(TRIM(p_data->>'payment_method'), ''), 'cash');

  v_raw_branch := TRIM(COALESCE(p_data->>'branch_id', ''));
  IF v_raw_branch <> '' AND v_raw_branch ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_branch_id := v_raw_branch::uuid;
  ELSE
    v_branch_id := NULL;
  END IF;

  -- 6) السنة المالية المفتوحة
  SELECT fy.id INTO v_fiscal_year_id FROM public.fiscal_years fy
  WHERE fy.company_id = p_company_id AND fy.is_closed = false
    AND v_date BETWEEN fy.start_date AND fy.end_date
  LIMIT 1;

  -- 7) رقم إيصال المصروف (نمط EXP-YYYYMMDD-XXXX المتبع في النظام)
  v_voucher_number := TRIM(COALESCE(p_data->>'voucher_number', ''));
  IF v_voucher_number = '' THEN
    v_voucher_number := 'EXP-' || to_char(v_date, 'YYYYMMDD') || '-' ||
      UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 4));
  END IF;

  -- 8) إدراج المصروف (entry_number في القيود يولّده trg_generate_entry_number تلقائيًا)
  INSERT INTO public.expenses (
    company_id, category_id, voucher_number, description,
    amount, currency_code, exchange_rate, expense_date,
    status, payment_method, created_by, branch_id
  ) VALUES (
    p_company_id, v_category_id, v_voucher_number, v_description,
    v_amount, v_currency_code, v_exchange_rate, v_date,
    'posted', v_payment_method, v_uid, v_branch_id
  ) RETURNING id INTO v_expense_id;

  -- 9) حساب المصروف القابل للترحيل
  SELECT a.id INTO v_expense_account_id
  FROM public.expense_categories ec
  JOIN public.accounts a ON a.id = ec.account_id
  WHERE ec.id = v_category_id
    AND a.company_id = p_company_id
    AND a.allow_posting = true
    AND a.is_active = true
    AND a.deleted_at IS NULL;

  IF v_expense_account_id IS NULL THEN
    SELECT a.id INTO v_expense_account_id FROM public.accounts a
    WHERE a.company_id = p_company_id
      AND (a.type = 'expense' OR a.code LIKE '5%')
      AND a.allow_posting = true
      AND a.is_active = true
      AND a.deleted_at IS NULL
    ORDER BY CASE WHEN a.code LIKE '5%' THEN 0 ELSE 1 END, a.code
    LIMIT 1;
  END IF;

  -- 10) حساب الصندوق/النقد القابل للترحيل (يفضّل نفس عملة المصروف)
  SELECT a.id INTO v_cash_account_id FROM public.accounts a
  WHERE a.company_id = p_company_id
    AND (a.code LIKE '101%' OR a.code LIKE '1101%' OR (a.type = 'asset' AND (a.name_ar LIKE '%صندوق%' OR a.name_ar LIKE '%نقد%' OR a.name_ar LIKE '%كاش%')))
    AND a.allow_posting = true
    AND a.is_active = true
    AND a.deleted_at IS NULL
  ORDER BY CASE WHEN a.currency_code = v_currency_code THEN 0 ELSE 1 END, a.code
  LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    SELECT a.id INTO v_cash_account_id FROM public.accounts a
    WHERE a.company_id = p_company_id
      AND a.type = 'asset'
      AND a.allow_posting = true
      AND a.is_active = true
      AND a.deleted_at IS NULL
    ORDER BY a.code
    LIMIT 1;
  END IF;

  -- 11) القيد: مدين مصروف / دائن نقدية — بعملة الأساس مع حفظ المبلغ الأجنبي
  --     ملاحظة حرجة: الرأس يُدرج كمسودة (draft) ثم تُضاف البنود ثم يُرحَّل إلى posted،
  --     لأن trigger trg_journal_entry_lines_immutability (prevent_posted_journal_line_modification)
  --     يمنع إضافة بنود إلى قيد حالته posted ويُسقط المعاملة بالكود 23514.
  IF v_cash_account_id IS NOT NULL AND v_expense_account_id IS NOT NULL THEN
    INSERT INTO public.journal_entries (
      company_id, entry_date, description,
      reference_type, reference_id, status, created_by, branch_id, fiscal_year_id
    ) VALUES (
      p_company_id, v_date, v_description,
      'expense', v_expense_id, 'draft', v_uid, v_branch_id, v_fiscal_year_id
    ) RETURNING id INTO v_entry_id;

    INSERT INTO public.journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount,
      description, currency_code, exchange_rate, foreign_amount, company_id, branch_id
    ) VALUES (
      v_entry_id, v_expense_account_id, v_base_amount, 0,
      v_description, v_currency_code, v_exchange_rate, v_amount, p_company_id, v_branch_id
    );

    INSERT INTO public.journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount,
      description, currency_code, exchange_rate, foreign_amount, company_id, branch_id
    ) VALUES (
      v_entry_id, v_cash_account_id, 0, v_base_amount,
      v_description, v_currency_code, v_exchange_rate, v_amount, p_company_id, v_branch_id
    );

    -- ترحيل القيد بعد إدراج بنوده (draft → posted)
    UPDATE public.journal_entries
    SET status = 'posted'
    WHERE id = v_entry_id;
  END IF;

  -- 12) إرجاع عقد متوافق للأمام (id/voucher_number كما كانت) + بيانات التحويل
  RETURN jsonb_build_object(
    'id', v_expense_id,
    'expense_id', v_expense_id,
    'voucher_number', v_voucher_number,
    'journal_entry_id', v_entry_id,
    'amount', v_amount,
    'base_amount', v_base_amount,
    'currency_code', v_currency_code,
    'exchange_rate', v_exchange_rate,
    'status', 'posted'
  );
END;
$function$;

-- الصلاحيات: لا anon/PUBLIC (تحصين 20260916000014)، authenticated + service_role فقط.
REVOKE EXECUTE ON FUNCTION public.commit_expense_v2(uuid, uuid, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_expense_v2(uuid, uuid, jsonb) TO authenticated, service_role;

COMMIT;
