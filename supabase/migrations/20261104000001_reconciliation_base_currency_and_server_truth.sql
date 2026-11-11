-- ==============================================================================
-- Migration: 20261104000001_reconciliation_base_currency_and_server_truth.sql
-- Description: إقفال الثغرات الخادمية المتبقية في المطابقة اليومية (بعد إصلاح
--              طبقة الواجهة في 2026-11-03). لا تغيير سلوكي في عقد PostgREST:
--              الوسيط الجديد لـ commit_daily_reconciliation له قيمة افتراضية.
--
--   1) (P0) عملة الأساس في التحويل: كانت كل مجاميع المطابقة تمرّ عبر النسخة
--      الثلاثية من fn_to_base_amount التي تفترض SAR أساساً. لمنشأة أساسها YER
--      تُسجَّل مبيعات SAR بقيمتها الاسمية (نقص حتى 410×) فيتضخّم فارق الدرج.
--      الآن كل تحويل يمرّ عبر النسخة الرباعية بعملة companies.base_currency،
--      ونفس الثغرة في commit_expense_v2 (مسار كل المصروفات) تُصلَح معها.
--
--   2) (P1) تفصيل الحركة لكل عملة tx_by_currency: صافي الكاش المتوقع لكل عملة
--      (مبيعات/مرتجعات/سندات/نثريات) بالمبلغ الأصلي وبمعادل الأساس، لعرض جرد
--      متعدد العملات بلا تجميع خام يُخفي انحراف عملة واحدة.
--
--   3) (P1) الحقيقة الخادمية للمعدود: يُعاد حساب actual_cash_counted من الفئات
--      نفسها (fn_cash_counts_to_base) لا من رقم يرسله العميل؛ ويُرفض الاعتماد
--      عند وجود عملة بلا سعر صرف صالح بدل احتسابها صفراً بصمت.
--
--   4) (P1) لقطة عملة الأساس وأسعار الجرد داخل الصف (base_currency,
--      cash_count_rates, counted_from_denominations) حتى يبقى المستند قابلاً
--      للتفسير لو تغيّرت أسعار الصرف أو عملة المنشأة لاحقاً.
--
--   5) (P1) حد التسامح من إعدادات المنشأة (companies.reconciliation_variance_
--      tolerance) وإلا الافتراضي المناسب لعملة الأساس، بدل ثابت 10 وحدات
--      (≈ 0.03 ر.س في YER و≈ 120 ر.س في KWD).
--
-- تشغيل: supabase db push أو CI. الفحوص المصاحبة: npm run test + tsc --noEmit.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0) الأعمدة الجديدة (إضافيّة وآمنة التكرار)
-- ------------------------------------------------------------------------------
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS reconciliation_variance_tolerance numeric(19,4);

COMMENT ON COLUMN public.companies.reconciliation_variance_tolerance IS
    'حد التسامح المسموح لفارق الدرج بعملة المنشأة الأساسية (NULL = الافتراضي حسب العملة)';

ALTER TABLE public.daily_reconciliations
    ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'SAR',
    ADD COLUMN IF NOT EXISTS cash_count_rates jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS counted_from_denominations boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.daily_reconciliations.base_currency IS
    'لقطة عملة المنشأة الأساسية لحظة الإقفال — كل الأعمدة النقدية معادلة إليها';
COMMENT ON COLUMN public.daily_reconciliations.cash_count_rates IS
    'أسعار الصرف المستخدمة في تحويل الفئات المعدودة إلى عملة الأساس';
COMMENT ON COLUMN public.daily_reconciliations.counted_from_denominations IS
    'true عندما اشتُق actual_cash_counted من الفئات على الخادم لا من رقم العميل';

-- تعبئة لقطة العملة للسجلات السابقة من عملة المنشأة الحالية
UPDATE public.daily_reconciliations dr
SET base_currency = COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
FROM public.companies c
WHERE c.id = dr.company_id
  AND dr.base_currency = 'SAR'
  AND COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR') <> 'SAR';

-- ------------------------------------------------------------------------------
-- 1) دوال مساعدة: تحويل آمن + أسعار المنشأة + حد التسامح + حساب الفئات
-- ------------------------------------------------------------------------------

-- 1-أ) قراءة رقم من نصّ بحذر (بلا استثناء عند نصّ غير رقمي)
CREATE OR REPLACE FUNCTION public.fn_safe_numeric(p_value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
BEGIN
    IF p_value IS NULL THEN
        RETURN NULL;
    END IF;
    IF TRIM(p_value) !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
        RETURN NULL;
    END IF;
    RETURN TRIM(p_value)::numeric;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- 1-ب) حد التسامح: إعداد المنشأة ← الافتراضي المناسب لعملة الأساس
--      (نفس خريطة الواجهة في reconciliationService.DEFAULT_TOLERANCE_BY_CURRENCY)
CREATE OR REPLACE FUNCTION public.fn_reconciliation_tolerance(p_company_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_currency text := 'SAR';
    v_configured numeric;
BEGIN
    SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR'),
           c.reconciliation_variance_tolerance
      INTO v_currency, v_configured
      FROM public.companies c
     WHERE c.id = p_company_id
     LIMIT 1;

    IF v_configured IS NOT NULL AND v_configured >= 0 THEN
        RETURN ROUND(v_configured, 4);
    END IF;

    RETURN CASE UPPER(COALESCE(v_currency, 'SAR'))
        WHEN 'YER' THEN 500
        WHEN 'SAR' THEN 10
        WHEN 'AED' THEN 20
        WHEN 'QAR' THEN 20
        WHEN 'EGP' THEN 25
        WHEN 'USD' THEN 3
        WHEN 'CNY' THEN 10
        WHEN 'OMR' THEN 1
        WHEN 'KWD' THEN 1
        WHEN 'BHD' THEN 1
        ELSE 10
    END;
END;
$$;

-- 1-ج) أسعار الصرف المعتمدة للمنشأة حتى تاريخ معيّن (أحدث سعر لكل عملة)
CREATE OR REPLACE FUNCTION public.fn_reconciliation_rates(
    p_company_id uuid,
    p_date date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT COALESCE(jsonb_object_agg(t.currency_code, t.rate_to_base), '{}'::jsonb)
    FROM (
        SELECT DISTINCT ON (UPPER(TRIM(er.currency_code)))
               UPPER(TRIM(er.currency_code)) AS currency_code,
               er.rate_to_base
          FROM public.exchange_rates er
         WHERE er.company_id = p_company_id
           AND er.effective_date <= COALESCE(p_date, CURRENT_DATE)
           AND er.rate_to_base > 0
         ORDER BY UPPER(TRIM(er.currency_code)), er.effective_date DESC, er.created_at DESC
    ) t;
$$;


-- 1-د) تحويل عدّ الفئات إلى عملة الأساس — مصدر الحقيقة للمبلغ المعدود.
--      يقبل الشكل المتداخل (عملة → فئة → عدد) والشكل المسطّح القديم.
--      يعيد: { rows: [...], total_base, missing_rates: [...], has_counts }
CREATE OR REPLACE FUNCTION public.fn_cash_counts_to_base(
    p_counts jsonb,
    p_rates jsonb,
    p_base_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
    v_base text := UPPER(COALESCE(NULLIF(TRIM(p_base_currency), ''), 'SAR'));
    v_rows jsonb := '[]'::jsonb;
    v_missing jsonb := '[]'::jsonb;
    v_total numeric := 0;
    v_has_counts boolean := false;
    v_nested_count integer := 0;
    v_currency text;
    v_counts jsonb;
    v_currency_total numeric := 0;
    v_rate numeric;
    v_base_total numeric;
BEGIN
    IF p_counts IS NULL OR jsonb_typeof(p_counts) <> 'object' THEN
        RETURN jsonb_build_object(
            'rows', '[]'::jsonb, 'total_base', 0, 'missing_rates', '[]'::jsonb, 'has_counts', false
        );
    END IF;

    SELECT COUNT(*)::integer INTO v_nested_count
      FROM jsonb_each(p_counts) e
     WHERE jsonb_typeof(e.value) = 'object';

    IF v_nested_count > 0 THEN
        FOR v_currency, v_counts IN
            SELECT UPPER(TRIM(e.key)), e.value
              FROM jsonb_each(p_counts) e
             WHERE jsonb_typeof(e.value) = 'object'
        LOOP
            SELECT COALESCE(SUM(
                       CASE WHEN d.key ~ '^[0-9]+(\.[0-9]+)?$'
                                 AND d.value ~ '^-?[0-9]+(\.[0-9]+)?$'
                            THEN (d.key)::numeric * (d.value)::numeric
                            ELSE 0 END
                   ), 0)
              INTO v_currency_total
              FROM jsonb_each_text(v_counts) d;

            IF v_currency_total <= 0 THEN
                CONTINUE;
            END IF;

            v_has_counts := true;

            IF v_currency = v_base THEN
                v_rate := 1;
            ELSE
                v_rate := COALESCE(public.fn_safe_numeric(p_rates ->> v_currency), 0);
            END IF;

            IF v_rate > 0 THEN
                v_base_total := public.fn_to_base_amount(
                    v_currency, v_currency_total, v_rate, v_base
                );
            ELSE
                v_base_total := 0;
                v_missing := v_missing || to_jsonb(v_currency);
            END IF;

            v_total := v_total + v_base_total;
            v_rows := v_rows || jsonb_build_object(
                'currency', v_currency,
                'total', ROUND(v_currency_total, 4),
                'rate', COALESCE(v_rate, 0),
                'base_total', ROUND(v_base_total, 4)
            );
        END LOOP;
    ELSE
        -- شكل مسطّح قديم: الفئات محسوبة بعملة الأساس نفسها
        SELECT COALESCE(SUM(
                   CASE WHEN d.key ~ '^[0-9]+(\.[0-9]+)?$'
                             AND d.value ~ '^-?[0-9]+(\.[0-9]+)?$'
                        THEN (d.key)::numeric * (d.value)::numeric
                        ELSE 0 END
               ), 0)
          INTO v_currency_total
          FROM jsonb_each_text(p_counts) d;

        IF v_currency_total > 0 THEN
            v_has_counts := true;
            v_total := v_currency_total;
            v_rows := jsonb_build_array(jsonb_build_object(
                'currency', v_base,
                'total', ROUND(v_currency_total, 4),
                'rate', 1,
                'base_total', ROUND(v_currency_total, 4)
            ));
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'rows', v_rows,
        'total_base', ROUND(v_total, 4),
        'missing_rates', v_missing,
        'has_counts', v_has_counts
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_safe_numeric(text) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_tolerance(uuid) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_rates(uuid, date) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_cash_counts_to_base(jsonb, jsonb, text) FROM anon, PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_reconciliation_tolerance(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reconciliation_rates(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_cash_counts_to_base(jsonb, jsonb, text) TO service_role;
-- لا منح لـ authenticated: هذه دوال داخلية تُستدعى من دوال SECURITY DEFINER،
-- ومنحها للمستخدم يسمح بقراءة أسعار أي منشأة عبر معرّفها.
-- تنبيه مُتحقَّق منه عملياً: Supabase يمنح EXECUTE على دوال schema public
-- لـ authenticated عبر ALTER DEFAULT PRIVILEGES، فسحب anon/PUBLIC وحده
-- لا يكفي — لذلك يجب سحبها صريحاً من authenticated (كما أعلاه).

-- ------------------------------------------------------------------------------
-- 2) get_daily_drawer_summary — تحويل بعملة المنشأة + tx_by_currency + أسعار
--    (نفس التوقيع: CREATE OR REPLACE)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_daily_drawer_summary(
    p_company_id uuid,
    p_date date,
    p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id uuid;
    v_base_currency text := 'SAR';
    v_branch_count integer := 0;
    v_last_petty_currency text;
    v_opening_float numeric(19,4) := 0;
    v_total_sales numeric(19,4) := 0;
    v_cash_sales numeric(19,4) := 0;
    v_card_sales numeric(19,4) := 0;
    v_transfer_sales numeric(19,4) := 0;
    v_credit_sales numeric(19,4) := 0;
    v_other_sales numeric(19,4) := 0;
    v_returns_cash numeric(19,4) := 0;
    v_returns_card numeric(19,4) := 0;
    v_cash_receipts numeric(19,4) := 0;
    v_cash_disbursements numeric(19,4) := 0;
    v_card_receipts numeric(19,4) := 0;
    v_petty_expenses numeric(19,4) := 0;
    v_expected_cash numeric(19,4) := 0;
    v_expected_card numeric(19,4) := 0;
    v_sales_by_currency jsonb := '[]'::jsonb;
    v_tx_by_currency jsonb := '[]'::jsonb;
    v_employee_breakdown jsonb := '[]'::jsonb;
    v_existing_reconciliation jsonb := NULL;
    v_cash_rates jsonb := '{}'::jsonb;
    v_tolerance numeric(19,4) := 10;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'عذراً، يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
    END IF;

    PERFORM public.verify_company_access(p_company_id);

    -- 0) مصدر الحقيقة للعملة: companies.base_currency
    SELECT COALESCE(NULLIF(TRIM(c.base_currency), ''), 'SAR')
    INTO v_base_currency
    FROM public.companies c
    WHERE c.id = p_company_id
    LIMIT 1;
    v_base_currency := COALESCE(v_base_currency, 'SAR');

    -- 0-ب) أسعار الصرف المعتمدة وحد التسامح من الخادم (لا ثابت SAR)
    v_cash_rates := public.fn_reconciliation_rates(p_company_id, p_date);
    v_tolerance := public.fn_reconciliation_tolerance(p_company_id);

    -- عدد فروع المنشأة (للتنبيه عند العرض على نطاق المنشأة كاملة)
    SELECT COUNT(*)::integer INTO v_branch_count
    FROM public.branches br
    WHERE br.company_id = p_company_id;

    -- 1) العهدة الافتتاحية (فكة الأمس المرحّلة لنفس نطاق الفرع بالضبط)
    SELECT r.float_retained_for_tomorrow INTO v_opening_float
    FROM public.daily_reconciliations r
    WHERE r.company_id = p_company_id
      AND r.branch_id IS NOT DISTINCT FROM p_branch_id
      AND r.reconciliation_date < p_date
    ORDER BY r.reconciliation_date DESC, r.shift_number DESC
    LIMIT 1;
    v_opening_float := COALESCE(v_opening_float, 0);
    -- 2) مبيعات ومرتجعات اليوم — محوّلة إلى عملة الأساس (كانت تجمع YER+SAR خامًا)
    SELECT
        COALESCE(SUM(CASE WHEN i.type = 'sale' THEN public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.type = 'sale' AND i.payment_method = 'cash' THEN public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.type = 'sale' AND i.payment_method IN ('card', 'network', 'mada') THEN public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.type = 'sale' AND i.payment_method IN ('transfer', 'bank') THEN public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.type = 'sale' AND i.payment_method = 'credit' THEN public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.type = 'sale' AND COALESCE(i.payment_method, '') NOT IN ('cash', 'card', 'network', 'mada', 'transfer', 'bank', 'credit') THEN public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.type = 'sale_return' AND i.payment_method = 'cash' THEN public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.type = 'sale_return' AND i.payment_method IN ('card', 'network', 'mada') THEN public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency) ELSE 0 END), 0)
    INTO
        v_total_sales,
        v_cash_sales,
        v_card_sales,
        v_transfer_sales,
        v_credit_sales,
        v_other_sales,
        v_returns_cash,
        v_returns_card
    FROM public.invoices i
    WHERE i.company_id = p_company_id
      AND i.branch_id IS NOT DISTINCT FROM p_branch_id
      AND i.issue_date = p_date
      AND i.status NOT IN ('draft', 'cancelled', 'void')
      AND i.deleted_at IS NULL;

    -- 3) السندات (مقبوضات ومدفوعات نقدية/شبكة) — محوّلة إلى عملة الأساس
    SELECT
        COALESCE(SUM(CASE WHEN pay.type = 'receipt' AND pay.payment_method = 'cash' THEN public.fn_to_base_amount(pay.currency_code, pay.amount, pay.exchange_rate, v_base_currency) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pay.type IN ('payment', 'disbursement') AND pay.payment_method = 'cash' THEN public.fn_to_base_amount(pay.currency_code, pay.amount, pay.exchange_rate, v_base_currency) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pay.type = 'receipt' AND pay.payment_method IN ('card', 'network', 'mada') THEN public.fn_to_base_amount(pay.currency_code, pay.amount, pay.exchange_rate, v_base_currency) ELSE 0 END), 0)
    INTO
        v_cash_receipts,
        v_cash_disbursements,
        v_card_receipts
    FROM public.payments pay
    WHERE pay.company_id = p_company_id
      AND pay.branch_id IS NOT DISTINCT FROM p_branch_id
      AND pay.payment_date = p_date
      AND pay.status NOT IN ('draft', 'void', 'cancelled')
      AND pay.deleted_at IS NULL;
    -- 4) المصروفات النثرية النقدية من الدرج — محوّلة إلى عملة الأساس
    SELECT COALESCE(SUM(public.fn_to_base_amount(e.currency_code, e.amount, e.exchange_rate, v_base_currency)), 0)
    INTO v_petty_expenses
    FROM public.expenses e
    WHERE e.company_id = p_company_id
      AND e.branch_id IS NOT DISTINCT FROM p_branch_id
      AND e.expense_date = p_date
      AND e.payment_method = 'cash'
      AND e.status NOT IN ('draft', 'void', 'cancelled')
      AND e.deleted_at IS NULL;

    -- 4ب) آخر عملة استُخدمت في مصروفات الدرج (تذكّر التفضيل — AGENTS §6)
    SELECT e.currency_code INTO v_last_petty_currency
    FROM public.expenses e
    WHERE e.company_id = p_company_id
      AND e.payment_method = 'cash'
      AND e.currency_code IS NOT NULL
      AND e.deleted_at IS NULL
    ORDER BY e.created_at DESC
    LIMIT 1;

    -- 5) النقد والشبكة المتوقعان في الدرج (بعملة الأساس)
    v_expected_cash := v_opening_float + v_cash_sales - v_returns_cash + v_cash_receipts - v_cash_disbursements - v_petty_expenses;
    v_expected_card := v_card_sales - v_returns_card + v_card_receipts;

    -- 6) تفصيل المبيعات حسب العملة (شفافية على المبالغ الخام قبل التحويل)
    SELECT COALESCE(jsonb_agg(row_to_json(sc) ORDER BY sc.base_total DESC), '[]'::jsonb)
    INTO v_sales_by_currency
    FROM (
        SELECT COALESCE(NULLIF(TRIM(i.currency_code), ''), v_base_currency) AS currency_code,
               COUNT(*)::integer AS invoice_count,
               ROUND(SUM(i.total_amount), 4) AS raw_total,
               ROUND(SUM(public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency)), 4) AS base_total
        FROM public.invoices i
        WHERE i.company_id = p_company_id
          AND i.branch_id IS NOT DISTINCT FROM p_branch_id
          AND i.issue_date = p_date
          AND i.type = 'sale'
          AND i.status NOT IN ('draft', 'cancelled', 'void')
          AND i.deleted_at IS NULL
        GROUP BY 1
    ) sc;

    -- 7) تفصيل مبيعات كل موظف — بلا تضخيم JOIN على user_profiles متعدد الصفوف
    SELECT COALESCE(jsonb_agg(emp_row), '[]'::jsonb)
    INTO v_employee_breakdown
    FROM (
        SELECT
            i.created_by AS user_id,
            COALESCE(NULLIF(TRIM(pr.full_name), ''), 'موظف') AS employee_name,
            COUNT(*)::integer AS invoice_count,
            ROUND(SUM(public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency)), 4) AS total_sales,
            ROUND(SUM(CASE WHEN i.payment_method = 'cash' THEN public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency) ELSE 0 END), 4) AS cash_sales,
            ROUND(SUM(CASE WHEN i.payment_method IN ('card', 'network', 'mada') THEN public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency) ELSE 0 END), 4) AS card_sales,
            ROUND(SUM(CASE WHEN i.payment_method IN ('transfer', 'bank') THEN public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency) ELSE 0 END), 4) AS transfer_sales,
            ROUND(SUM(CASE WHEN i.payment_method = 'credit' THEN public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency) ELSE 0 END), 4) AS credit_sales,
            ROUND(SUM(CASE WHEN COALESCE(i.payment_method, '') NOT IN ('cash', 'card', 'network', 'mada', 'transfer', 'bank', 'credit') THEN public.fn_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate, v_base_currency) ELSE 0 END), 4) AS other_sales
        FROM public.invoices i
        LEFT JOIN public.profiles pr ON pr.id = i.created_by
        WHERE i.company_id = p_company_id
          AND i.branch_id IS NOT DISTINCT FROM p_branch_id
          AND i.issue_date = p_date
          AND i.type = 'sale'
          AND i.status NOT IN ('draft', 'cancelled', 'void')
          AND i.deleted_at IS NULL
        GROUP BY i.created_by, pr.full_name
        ORDER BY total_sales DESC
    ) emp_row;

    v_employee_breakdown := COALESCE(v_employee_breakdown, '[]'::jsonb);
    -- 7-ب) تفصيل الحركة لكل عملة (tx_by_currency): يكشف انحراف عملة واحدة
    --      بدل تجميع خام يُخفي الفرق، ويعطي صافي الكاش المتوقع لكل عملة.
    SELECT COALESCE(jsonb_agg(row_to_json(tx) ORDER BY tx.is_base_currency DESC, tx.net_cash_base DESC), '[]'::jsonb)
    INTO v_tx_by_currency
    FROM (
        SELECT
            m.currency_code,
            (m.currency_code = v_base_currency) AS is_base_currency,
            ROUND(SUM(m.cash_in), 4) AS cash_sales,
            ROUND(SUM(m.card_in), 4) AS card_sales,
            ROUND(SUM(m.cash_returns), 4) AS returns_cash,
            ROUND(SUM(m.card_returns), 4) AS returns_card,
            ROUND(SUM(m.cash_receipts), 4) AS cash_receipts,
            ROUND(SUM(m.cash_disbursements), 4) AS cash_disbursements,
            ROUND(SUM(m.petty_expenses), 4) AS petty_expenses,
            ROUND(SUM(m.cash_in - m.cash_returns + m.cash_receipts - m.cash_disbursements - m.petty_expenses), 4) AS net_cash,
            ROUND(
                SUM(public.fn_to_base_amount(m.currency_code, m.cash_in, m.exchange_rate, v_base_currency))
              - SUM(public.fn_to_base_amount(m.currency_code, m.cash_returns, m.exchange_rate, v_base_currency))
              + SUM(public.fn_to_base_amount(m.currency_code, m.cash_receipts, m.exchange_rate, v_base_currency))
              - SUM(public.fn_to_base_amount(m.currency_code, m.cash_disbursements, m.exchange_rate, v_base_currency))
              - SUM(public.fn_to_base_amount(m.currency_code, m.petty_expenses, m.exchange_rate, v_base_currency))
            , 4) AS net_cash_base
        FROM (
            SELECT COALESCE(NULLIF(TRIM(i.currency_code), ''), v_base_currency) AS currency_code,
                   i.exchange_rate AS exchange_rate,
                   CASE WHEN i.type = 'sale' AND i.payment_method = 'cash' THEN i.total_amount ELSE 0 END AS cash_in,
                   CASE WHEN i.type = 'sale' AND i.payment_method IN ('card', 'network', 'mada') THEN i.total_amount ELSE 0 END AS card_in,
                   CASE WHEN i.type = 'sale_return' AND i.payment_method = 'cash' THEN i.total_amount ELSE 0 END AS cash_returns,
                   CASE WHEN i.type = 'sale_return' AND i.payment_method IN ('card', 'network', 'mada') THEN i.total_amount ELSE 0 END AS card_returns,
                   0::numeric AS cash_receipts,
                   0::numeric AS cash_disbursements,
                   0::numeric AS petty_expenses
            FROM public.invoices i
            WHERE i.company_id = p_company_id
              AND i.branch_id IS NOT DISTINCT FROM p_branch_id
              AND i.issue_date = p_date
              AND i.type IN ('sale', 'sale_return')
              AND i.status NOT IN ('draft', 'cancelled', 'void')
              AND i.deleted_at IS NULL
            UNION ALL
            SELECT COALESCE(NULLIF(TRIM(pay.currency_code), ''), v_base_currency),
                   pay.exchange_rate,
                   0, 0, 0, 0,
                   CASE WHEN pay.type = 'receipt' AND pay.payment_method = 'cash' THEN pay.amount ELSE 0 END,
                   CASE WHEN pay.type IN ('payment', 'disbursement') AND pay.payment_method = 'cash' THEN pay.amount ELSE 0 END,
                   0
            FROM public.payments pay
            WHERE pay.company_id = p_company_id
              AND pay.branch_id IS NOT DISTINCT FROM p_branch_id
              AND pay.payment_date = p_date
              AND pay.type IN ('receipt', 'payment', 'disbursement')
              AND pay.status NOT IN ('draft', 'void', 'cancelled')
              AND pay.deleted_at IS NULL
            UNION ALL
            SELECT COALESCE(NULLIF(TRIM(e.currency_code), ''), v_base_currency),
                   e.exchange_rate,
                   0, 0, 0, 0, 0, 0,
                   CASE WHEN e.payment_method = 'cash' THEN e.amount ELSE 0 END
            FROM public.expenses e
            WHERE e.company_id = p_company_id
              AND e.branch_id IS NOT DISTINCT FROM p_branch_id
              AND e.expense_date = p_date
              AND e.status NOT IN ('draft', 'void', 'cancelled')
              AND e.deleted_at IS NULL
        ) m
        GROUP BY m.currency_code
    ) tx;

    -- 8) سجل الإقفال الحالي إن وجد (بنفس نطاق الفرع بالضبط)
    SELECT row_to_json(r)::jsonb INTO v_existing_reconciliation
    FROM public.daily_reconciliations r
    WHERE r.company_id = p_company_id
      AND r.branch_id IS NOT DISTINCT FROM p_branch_id
      AND r.reconciliation_date = p_date
    ORDER BY r.shift_number DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'date', p_date,
        'base_currency', v_base_currency,
        'currency', v_base_currency,
        'scope_branch_id', p_branch_id,
        'scope_is_company', (p_branch_id IS NULL),
        'company_branch_count', v_branch_count,
        'variance_tolerance', v_tolerance,
        'last_petty_expense_currency', COALESCE(v_last_petty_currency, v_base_currency),
        'opening_float', v_opening_float,
        'total_sales', v_total_sales,
        'cash_sales', v_cash_sales,
        'card_sales', v_card_sales,
        'transfer_sales', v_transfer_sales,
        'credit_sales', v_credit_sales,
        'other_sales', v_other_sales,
        'sales_buckets_total', ROUND(v_cash_sales + v_card_sales + v_transfer_sales + v_credit_sales + v_other_sales, 4),
        'returns_cash', v_returns_cash,
        'returns_card', v_returns_card,
        'cash_receipts', v_cash_receipts,
        'cash_disbursements', v_cash_disbursements,
        'card_receipts', v_card_receipts,
        'petty_expenses_cash', v_petty_expenses,
        'expected_cash_in_drawer', v_expected_cash,
        'expected_card_terminal', v_expected_card,
        'sales_by_currency', v_sales_by_currency,
        'tx_by_currency', v_tx_by_currency,
        'cash_rates', v_cash_rates,
        'employee_breakdown', v_employee_breakdown,
        'existing_reconciliation', v_existing_reconciliation,
        'is_already_closed', (
            v_existing_reconciliation IS NOT NULL
            AND COALESCE(v_existing_reconciliation->>'is_locked', 'false') = 'true'
        )
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- 3) commit_daily_reconciliation — المعدود من الفئات + لقطة العملة والأسعار
--    (يُعاد الإنشاء لأنّ الوسيط الجديد p_cash_rates يتطلب توقيعاً موسّعاً؛
--     له قيمة افتراضية فيبقى أي نداء بـ 11 وسيطاً عاملاً كما هو.)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.commit_daily_reconciliation(
    uuid, date, uuid, numeric, numeric, jsonb, numeric, numeric, numeric, text, text
);

CREATE OR REPLACE FUNCTION public.commit_daily_reconciliation(
    p_company_id uuid,
    p_date date,
    p_branch_id uuid,
    p_opening_float numeric,
    p_actual_cash_counted numeric,
    p_cash_denominations jsonb,
    p_card_terminal_receipt_total numeric,
    p_float_retained_for_tomorrow numeric,
    p_cash_handed_to_owner numeric,
    p_variance_reason text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_cash_rates jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id uuid;
    v_user_role text;
    v_summary jsonb;
    v_opening_float numeric(19,4);
    v_expected_cash numeric(19,4);
    v_cash_variance numeric(19,4);
    v_expected_card numeric(19,4);
    v_card_variance numeric(19,4);
    v_tolerance numeric(19,4) := 10;
    v_branch_count integer := 0;
    v_reconciliation_id uuid;
    v_existing_locked boolean := false;
    v_base_currency text := 'SAR';
    v_counts jsonb;
    v_counted_server numeric(19,4) := 0;
    v_has_counts boolean := false;
    v_missing_rates text;
    v_actual_cash numeric(19,4) := 0;
    v_count_rates jsonb := '{}'::jsonb;
    v_rate_key text;
    v_rate_value numeric;
BEGIN
    -- ملاحظة: p_opening_float يُقبل للتوافق مع الواجهة لكن لا يُحتسب؛
    -- العهدة الافتتاحية تُشتق من الخادم (فكة اليوم السابق) لمنع تلاعب العميل بها.
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'عذراً، يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
    END IF;

    PERFORM public.verify_company_access(p_company_id);

    SELECT ucr.role INTO v_user_role
    FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_user_id AND ucr.company_id = p_company_id
    LIMIT 1;

    IF v_user_role = 'viewer' THEN
        RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية لإقفال يومية الصندوق والمطابقة'
            USING ERRCODE = '42501';
    END IF;

    -- (P1) قفل استشاري ذرّي: يمنع إقفالين متزامنين لنفس (منشأة + فرع + يوم) فيولّد صفوفًا مكررة
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            p_company_id::text || ':' || COALESCE(p_branch_id::text, 'company-scope') || ':' || p_date::text,
            0
        )
    );

    -- (P0) منع الإقفال على نطاق المنشأة كاملة عند تعدد الفروع (كان يجمع كل الفروع في صف واحد)
    SELECT COUNT(*)::integer INTO v_branch_count
    FROM public.branches br
    WHERE br.company_id = p_company_id;

    IF p_branch_id IS NULL AND v_branch_count > 1 THEN
        RAISE EXCEPTION 'عذراً، يجب تحديد الفرع قبل إقفال اليومية (هذه المنشأة بها % فروع). اختر الفرع ثم أعد المحاولة', v_branch_count
            USING ERRCODE = '22023';
    END IF;

    -- وجود إقفال سابق لنفس اليوم والفرع (مطابقة صارمة IS NOT DISTINCT FROM)
    SELECT dr.id, dr.is_locked INTO v_reconciliation_id, v_existing_locked
    FROM public.daily_reconciliations dr
    WHERE dr.company_id = p_company_id
      AND dr.branch_id IS NOT DISTINCT FROM p_branch_id
      AND dr.reconciliation_date = p_date
      AND dr.shift_number = 1
    LIMIT 1;

    -- حارس المالك الصارم: اليومية المقفلة لا تُعدّل إلا من المالك
    IF v_reconciliation_id IS NOT NULL AND v_existing_locked = true THEN
        IF v_user_role <> 'owner' THEN
            RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية لتعديل إقفال يومية مقفلة بالفعل. هذا الإجراء مقتصر على المالك فقط'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    v_summary := public.get_daily_drawer_summary(p_company_id, p_date, p_branch_id);

    v_base_currency := COALESCE(v_summary->>'base_currency', 'SAR');
    v_expected_cash := COALESCE((v_summary->>'expected_cash_in_drawer')::numeric, 0);
    v_expected_card := COALESCE((v_summary->>'expected_card_terminal')::numeric, 0);
    v_tolerance := COALESCE((v_summary->>'variance_tolerance')::numeric, 10);
    v_opening_float := COALESCE((v_summary->>'opening_float')::numeric, 0);

    -- (P1) الحقيقة الخادمية للمبلغ المعدود: يُشتق من الفئات لا من رقم العميل.
    --      الأسعار المعتمدة من exchange_rates أولاً، ثم أسعار الواجهة كاحتياط
    --      (نفس السعر الذي رآه المستخدم على الشاشة) لتفادي اختلاف التجميع.
    v_count_rates := COALESCE(v_summary->'cash_rates', '{}'::jsonb);
    IF p_cash_rates IS NOT NULL AND jsonb_typeof(p_cash_rates) = 'object' THEN
        FOR v_rate_key, v_rate_value IN
            SELECT UPPER(TRIM(kv.key)), COALESCE(public.fn_safe_numeric(kv.value), 0)
              FROM jsonb_each_text(p_cash_rates) kv
        LOOP
            -- أسعار الخادم تسبق أسعار الواجهة (الواجهة تكمل الناقص فقط)
            IF COALESCE(v_count_rates ->> v_rate_key, '') = '' THEN
                v_count_rates := v_count_rates || jsonb_build_object(v_rate_key, v_rate_value);
            END IF;
        END LOOP;
    END IF;
    v_count_rates := COALESCE(v_count_rates, '{}'::jsonb);

    v_counts := public.fn_cash_counts_to_base(p_cash_denominations, v_count_rates, v_base_currency);
    v_has_counts := COALESCE((v_counts->>'has_counts')::boolean, false);
    v_counted_server := COALESCE((v_counts->>'total_base')::numeric, 0);

    SELECT string_agg(value, '، ') INTO v_missing_rates
      FROM jsonb_array_elements_text(COALESCE(v_counts->'missing_rates', '[]'::jsonb));

    IF v_missing_rates IS NOT NULL THEN
        RAISE EXCEPTION 'عذراً، لا يوجد سعر صرف صالح للعملات المعدودة (%): اضبط سعر الصرف قبل اعتماد الإقفال',
            v_missing_rates
            USING ERRCODE = '22023';
    END IF;

    v_actual_cash := CASE WHEN v_has_counts THEN v_counted_server
                          ELSE COALESCE(p_actual_cash_counted, 0) END;

    -- حارس توزيع النقد: الفكة المستبقاة + المسلَّم للمالك لا يجوز أن يتجاوز
    -- المعدود فعلياً (نقص الكاش مرفوض حتى لو كان بسبب الفارق المسموح).
    IF COALESCE(p_float_retained_for_tomorrow, 0) + COALESCE(p_cash_handed_to_owner, 0)
       > v_actual_cash + v_tolerance THEN
        RAISE EXCEPTION 'عذراً، توزيع النقد يتجاوز المبلغ المعدود: الفكة (%) + المسلَّم للمالك (%) أكبر من المعدود (%) بعملة %',
            COALESCE(p_float_retained_for_tomorrow, 0),
            COALESCE(p_cash_handed_to_owner, 0),
            v_actual_cash,
            v_base_currency
            USING ERRCODE = '22023';
    END IF;

    v_cash_variance := ROUND(v_actual_cash - v_expected_cash, 4);
    v_card_variance := ROUND(COALESCE(p_card_terminal_receipt_total, 0) - v_expected_card, 4);
    -- (P1) إلزام مبرر الفارق خارج حد التسامح
    --      كان p_variance_reason اختياريًا تمامًا فلا يوجد أي حارس فعلي للفروقات.
    --      ERRCODE 22023 لأن 42501 تُترجم في errorUtils إلى رسالة صلاحيات عامة فتُبتلع الرسالة.
    IF ABS(v_cash_variance) > v_tolerance
       AND COALESCE(NULLIF(TRIM(p_variance_reason), ''), '') = '' THEN
        RAISE EXCEPTION 'عذراً، يجب كتابة سبب (مبرر) فارق الكاش % عندما يتجاوز حد التسامح %',
            v_cash_variance, v_tolerance
            USING ERRCODE = '22023';
    END IF;

    IF ABS(v_card_variance) > v_tolerance
       AND COALESCE(NULLIF(TRIM(p_variance_reason), ''), '') = '' THEN
        RAISE EXCEPTION 'عذراً، يجب كتابة سبب (مبرر) فارق الشبكة % عندما يتجاوز حد التسامح %',
            v_card_variance, v_tolerance
            USING ERRCODE = '22023';
    END IF;

    IF v_reconciliation_id IS NOT NULL THEN
        UPDATE public.daily_reconciliations SET
            opening_float = v_opening_float,
            float_retained_for_tomorrow = COALESCE(p_float_retained_for_tomorrow, 0),
            cash_handed_to_owner = COALESCE(p_cash_handed_to_owner, 0),
            total_sales = COALESCE((v_summary->>'total_sales')::numeric, 0),
            cash_sales = COALESCE((v_summary->>'cash_sales')::numeric, 0),
            card_sales = COALESCE((v_summary->>'card_sales')::numeric, 0),
            transfer_sales = COALESCE((v_summary->>'transfer_sales')::numeric, 0),
            credit_sales = COALESCE((v_summary->>'credit_sales')::numeric, 0),
            returns_cash = COALESCE((v_summary->>'returns_cash')::numeric, 0),
            returns_card = COALESCE((v_summary->>'returns_card')::numeric, 0),
            cash_receipts = COALESCE((v_summary->>'cash_receipts')::numeric, 0),
            cash_disbursements = COALESCE((v_summary->>'cash_disbursements')::numeric, 0),
            petty_expenses_cash = COALESCE((v_summary->>'petty_expenses_cash')::numeric, 0),
            expected_cash_in_drawer = v_expected_cash,
            actual_cash_counted = v_actual_cash,
            cash_denominations = COALESCE(p_cash_denominations, '{}'::jsonb),
            base_currency = v_base_currency,
            cash_count_rates = v_count_rates,
            counted_from_denominations = v_has_counts,
            card_terminal_receipt_total = COALESCE(p_card_terminal_receipt_total, 0),
            cash_variance = v_cash_variance,
            card_variance = v_card_variance,
            variance_reason = p_variance_reason,
            employee_breakdown = COALESCE(v_summary->'employee_breakdown', '[]'::jsonb),
            notes = p_notes,
            closed_by = v_user_id,
            closed_at = now(),
            is_locked = true,
            updated_at = now()
        WHERE id = v_reconciliation_id;
    ELSE
        INSERT INTO public.daily_reconciliations (
            company_id,
            branch_id,
            reconciliation_date,
            shift_number,
            status,
            opening_float,
            float_retained_for_tomorrow,
            cash_handed_to_owner,
            total_sales,
            cash_sales,
            card_sales,
            transfer_sales,
            credit_sales,
            returns_cash,
            returns_card,
            cash_receipts,
            cash_disbursements,
            petty_expenses_cash,
            expected_cash_in_drawer,
            actual_cash_counted,
            cash_denominations,
            base_currency,
            cash_count_rates,
            counted_from_denominations,
            card_terminal_receipt_total,
            cash_variance,
            card_variance,
            variance_reason,
            employee_breakdown,
            notes,
            closed_by,
            closed_at,
            is_locked
        ) VALUES (
            p_company_id,
            p_branch_id,
            p_date,
            1,
            'closed',
            v_opening_float,
            COALESCE(p_float_retained_for_tomorrow, 0),
            COALESCE(p_cash_handed_to_owner, 0),
            COALESCE((v_summary->>'total_sales')::numeric, 0),
            COALESCE((v_summary->>'cash_sales')::numeric, 0),
            COALESCE((v_summary->>'card_sales')::numeric, 0),
            COALESCE((v_summary->>'transfer_sales')::numeric, 0),
            COALESCE((v_summary->>'credit_sales')::numeric, 0),
            COALESCE((v_summary->>'returns_cash')::numeric, 0),
            COALESCE((v_summary->>'returns_card')::numeric, 0),
            COALESCE((v_summary->>'cash_receipts')::numeric, 0),
            COALESCE((v_summary->>'cash_disbursements')::numeric, 0),
            COALESCE((v_summary->>'petty_expenses_cash')::numeric, 0),
            v_expected_cash,
            v_actual_cash,
            COALESCE(p_cash_denominations, '{}'::jsonb),
            v_base_currency,
            v_count_rates,
            v_has_counts,
            COALESCE(p_card_terminal_receipt_total, 0),
            v_cash_variance,
            v_card_variance,
            p_variance_reason,
            COALESCE(v_summary->'employee_breakdown', '[]'::jsonb),
            p_notes,
            v_user_id,
            now(),
            true
        ) RETURNING id INTO v_reconciliation_id;
    END IF;
    RETURN jsonb_build_object(
        'success', true,
        'reconciliation_id', v_reconciliation_id,
        'base_currency', v_base_currency,
        'cash_rates', v_count_rates,
        'actual_cash_counted', v_actual_cash,
        'counted_from_denominations', v_has_counts,
        'counted_rows', COALESCE(v_counts->'rows', '[]'::jsonb),
        'opening_float', v_opening_float,
        'expected_cash_in_drawer', v_expected_cash,
        'expected_card_terminal', v_expected_card,
        'cash_variance', v_cash_variance,
        'card_variance', v_card_variance,
        'variance_tolerance', v_tolerance,
        'is_within_tolerance', (ABS(v_cash_variance) <= v_tolerance AND ABS(v_card_variance) <= v_tolerance),
        'cash_handed_to_owner', COALESCE(p_cash_handed_to_owner, 0),
        'float_retained_for_tomorrow', COALESCE(p_float_retained_for_tomorrow, 0),
        'message', 'تم إقفال يومية المحل واعتماد المطابقة بنجاح'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4) commit_expense_v2 — تصحيح التحويل إلى عملة المنشأة الأساسية
--    (كان يفرض SAR أساساً: IF v_currency_code = 'SAR' THEN rate := 1
--     ويحوّل بالنسخة الثلاثية → مصروف SAR في منشأة YER يُقيَّد بقيمته الاسمية)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commit_expense_v2(p_company_id uuid, p_user_id uuid, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  IF v_cash_account_id IS NOT NULL AND v_expense_account_id IS NOT NULL THEN
    INSERT INTO public.journal_entries (
      company_id, entry_date, description,
      reference_type, reference_id, status, created_by, branch_id, fiscal_year_id
    ) VALUES (
      p_company_id, v_date, v_description,
      'expense', v_expense_id, 'posted', v_uid, v_branch_id, v_fiscal_year_id
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
$$;

-- ------------------------------------------------------------------------------
-- 5) الصلاحيات — الدوال الجديدة تحصل افتراضياً على EXECUTE لـ PUBLIC (ومنهم anon)،
--    لذا السحب إلزامي، وإعادة المنح صريحة لتفادي أي تلاعب سابق.
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_daily_drawer_summary(uuid, date, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.commit_daily_reconciliation(
    uuid, date, uuid, numeric, numeric, jsonb, numeric, numeric, numeric, text, text, jsonb
) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.commit_expense_v2(uuid, uuid, jsonb) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_daily_drawer_summary(uuid, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_daily_reconciliation(
    uuid, date, uuid, numeric, numeric, jsonb, numeric, numeric, numeric, text, text, jsonb
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_expense_v2(uuid, uuid, jsonb) TO authenticated, service_role;
