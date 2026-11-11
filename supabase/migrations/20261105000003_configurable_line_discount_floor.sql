-- =====================================================================
-- 20261105000003_configurable_line_discount_floor.sql
-- ---------------------------------------------------------------------
-- P0-2: حد السعر الأدنى كان ثابتاً في الكود (v_db_price * 0.7 = 70% من سعر
--   القائمة) داخل commit_sales_invoice_v2، فيستحيل منح خصم أكبر من 30% لأي
--   مستخدم غير owner/admin، ولا توجد طريقة لإدارته من الإعدادات.
--
-- الإصلاح: السقف صار مقروءاً من companies.max_line_discount_pct
--   (الافتراضي 30 = نفس السلوك القديم حرفياً ⇒ صفر تغيير سلوكي عند التطبيق).
--   مثال: 60 ⇒ أدنى سعر بيع = 40% من قائمة السعر.
--
-- ⚠️ أمان التشغيل الحي:
--   * الترحيل يمرّ على كل نسخ (overloads) commit_sales_invoice_v2 الموجودة
--     فعلياً في قاعدة البيانات (تعريفات pg_proc) لا على نص ملف ترحيل بعينه.
--   * أي نسخة لا تحتوي متغيّر v_company_id تُترك كما هي (تُسجَّل Notice) بدل
--     إدخال نص لا يُترجم ⇒ لا يمكن أن نُعطّل إنشاء الفواتير.
--   * إن لم تُعدَّل أي نسخة يُلغى الترحيل بالكامل (لا إصلاح صامت بلا أثر).
--   * عند سقف 30 الناتج = v_db_price * 0.7 بالضبط ⇒ لا تغيير في القيود أو
--     الأسعار المسجّلة سابقاً، التغيير يقتصر على قابلية الضبط.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) سقف الخصم لكل بند على مستوى المنشأة
--    ADD COLUMN IF NOT EXISTS ... DEFAULT 30 = نفس السلوك القديم
-- ---------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS max_line_discount_pct numeric(5,2) NOT NULL DEFAULT 30;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_max_line_discount_pct_check'
      AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_max_line_discount_pct_check
      CHECK (max_line_discount_pct >= 0 AND max_line_discount_pct <= 95);
  END IF;
END $$;

COMMENT ON COLUMN public.companies.max_line_discount_pct IS
  'أقصى خصم مسموح لكل بند في فاتورة البيع (%). 30 = الحد الأدنى لسعر البيع 70% من سعر القائمة (السلوك القديم). 0 = يمنع أي خصم. 95 = خصومات شبه مفتوحة.';

-- ---------------------------------------------------------------------
-- 2) دالة داخلية لقراءة السقف (تفادي تكرار الاستعلام داخل حلقة البنود)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_max_line_discount_pct(p_company_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    (SELECT c.max_line_discount_pct FROM public.companies c WHERE c.id = p_company_id),
    30
  );
$function$;

COMMENT ON FUNCTION public.fn_max_line_discount_pct(uuid) IS
  'سقف الخصم المسموح لكل بند (%) للمنشأة — 30 افتراضياً (الحد الأدنى للسعر = 70% من القائمة).';

REVOKE ALL ON FUNCTION public.fn_max_line_discount_pct(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_max_line_discount_pct(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_max_line_discount_pct(uuid) FROM authenticated;

-- ---------------------------------------------------------------------
-- 3) استبدال الرقم الثابت داخل كل نسخ commit_sales_invoice_v2
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_oids oid[];
  v_oid oid;
  v_def text;
  v_new text;
  v_patched int := 0;
  v_skipped int := 0;
  v_no_match int := 0;
BEGIN
  -- نجمع المعرّفات أولاً: تنفيذ DDL أثناء مؤشر مفتوح على pg_proc غير آمن
  SELECT array_agg(p.oid) INTO v_oids
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'commit_sales_invoice_v2';

  FOREACH v_oid IN ARRAY COALESCE(v_oids, '{}'::oid[]) LOOP
    v_def := pg_get_functiondef(v_oid);

    IF position('v_db_price * 0.7' IN v_def) = 0 THEN
      v_no_match := v_no_match + 1;
      CONTINUE;
    END IF;

    -- شرط السلامة: الاستبدال يحتاج v_company_id داخل نفس الدالة
    IF position('v_company_id' IN v_def) = 0 THEN
      v_skipped := v_skipped + 1;
      RAISE NOTICE 'P0-2: تم تخطي نسخة من commit_sales_invoice_v2 (oid=%) لعدم وجود v_company_id — سقفها بقي 30%%', v_oid;
      CONTINUE;
    END IF;

    v_new := replace(
      v_def,
      'v_db_price * 0.7',
      'v_db_price * (1 - public.fn_max_line_discount_pct(v_company_id) / 100.0)'
    );

    EXECUTE v_new;
    v_patched := v_patched + 1;
  END LOOP;

  IF v_patched = 0 THEN
    RAISE EXCEPTION
      'P0-2 verification failed: لم يُعثر على أي نسخة من commit_sales_invoice_v2 تحتوي (v_db_price * 0.7) و v_company_id — راجع التعريف الحالي قبل تطبيق هذا الترحيل';
  END IF;

  RAISE NOTICE 'P0-2: تم ربط حد السعر بـ companies.max_line_discount_pct في % نسخة (مُهملة % بدون الرقم الثابت، % بلا v_company_id)',
    v_patched, v_no_match, v_skipped;
END $$;

-- ---------------------------------------------------------------------
-- 4) فحص بعدي: تقرير بالنسخ التي بقيت على الرقم الثابت (المتخطاة فقط)
--    ملاحظة: التخطي مقصود وآمن (سقفها يبقى 30% = السلوك القديم)، لكن نُظهرها
--    دائماً كي لا يكون هناك إصلاح صامت بلا أثر.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_left int;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'commit_sales_invoice_v2'
    AND position('v_db_price * 0.7' IN pg_get_functiondef(p.oid)) > 0;

  IF v_left > 0 THEN
    RAISE WARNING 'P0-2 verify: % نسخة ما زالت على السقف الثابت 30%% (لم تحتوِ v_company_id) — السقف القابل للضبط فعّال في بقية النسخ',
      v_left;
  ELSE
    RAISE NOTICE 'P0-2 verify: لم يبقَ أي سقف ثابت 0.7 — السقف الآن من companies.max_line_discount_pct';
  END IF;
END $$;

COMMIT;
