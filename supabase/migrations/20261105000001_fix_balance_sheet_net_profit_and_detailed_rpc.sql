-- =====================================================================
-- 20261105000001_fix_balance_sheet_net_profit_and_detailed_rpc.sql
-- ---------------------------------------------------------------------
-- المشكلة (P0-1): الميزانية العمومية لا تتزن.
--   report_balance_sheet كانت تُرجع 3 صفوف فقط (asset/liability/equity)
--   و"حقوق الملكية" تُحسب من الحسابات 3xxx فقط، فلا تشمل صافي أرباح الفترة
--   الحالية غير المُقفلة (4xxx - 5xxx). النتيجة:
--        الأصول ≠ الالتزامات + حقوق الملكية + صافي ربح الفترة
--   فتظهر "يوجد فرق محاسبي" بقيمة صافي الربح في كل مرة.
--   كما أن الواجهة كانت تبحث عن صف type='retained_earnings' لا يُرجع أبداً،
--   وتطرح منه رصيد 3200 فيُلغي الأرباح المبقاة المرحّلة فعلاً.
--
--   كذلك: report_balance_sheet_detailed مُستدعاة من الواجهة لكنها غير موجودة
--   في مجلد الـ migrations إطلاقاً (موجودة في database.types.ts فقط) → انحراف
--   مخطط (schema drift). هنا نُنشئها رسمياً.
--
-- ⚠️ ملاحظات أمان التشغيل الحي (Production):
--   1. نُبقي حارس المنشأة كما هو في التعريف الحيّ تماماً
--      (public.verify_company_access) → صفر تغيير في سلوك التحقق/الرسائل.
--   2. كل تعريفات (overloads) الاسمين تُحذف أولاً ثم يُنشأ تعريف واحد فقط
--      توقيعه (uuid, date, uuid)، مع إعادة منح EXECUTE لـ authenticated صراحةً.
--      السبب: وجود تعريفين بنفس الاسم يُسبب PGRST203، ونوع إرجاع مختلف يمنع
--      CREATE OR REPLACE. الحذف داخل نفس المعاملة ⇒ لا نافذة انقطاع.
--   3. بعد الإنشاء: فحصان إلزاميان داخل الترحيل نفسه:
--        (أ) وجود تعريف واحد فقط بالاسم (منع الغموض).
--        (ب) تشغيل فعلي للدالتين على شركات نشطة حقيقية — لأن PL/pgSQL لا
--            يتحقق من أسماء الأعمدة إلا عند أول تنفيذ؛ فلو كان المخطط منحرفاً
--            (عمود مفقود) سنكتشف ذلك الآن ونتراجع بدل أن تتعطل الشاشة لاحقاً.
--      أي فشل في الفحصين يُلغي الترحيل بالكامل (ROLLBACK) ويبقى التطبيق
--      يعمل على التعريف القديم.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) تنظيف كل تعريفات أسماء تقارير الميزانية قبل إعادة إنشائها
--    السبب: (أ) وجود أكثر من تعريف بنفس الاسم يجعل PostgREST يرفض النداء
--             بالوسائط المسمّاة (PGRST203 ambiguous function) → الشاشة تُعطّل.
--          (ب) إن كان التعريف الحيّ بنوع إرجاع مختلف، فإن CREATE OR REPLACE
--             يفشل بـ «cannot change return type». الحذف أولاً يضمن نجاح الإنشاء.
--    نُعيد المنح صراحةً بعد الإنشاء (GRANT ... TO authenticated) لأن الحذف
--    يُصفّر الصلاحيات. كل ذلك داخل معاملة واحدة ⇒ لا نافذة زمنية بلا دالة.
--    إن كان أي تعريف قديم مرتبطاً بكائن آخر (view/function) سيفشل DROP
--    ويُلغى الترحيل كله ⇒ يبقى التطبيق يعمل على التعريف القديم بلا أي ضرر.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid AS fn_oid, p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('report_balance_sheet', 'report_balance_sheet_detailed')
  LOOP
    EXECUTE format('DROP FUNCTION %s', r.signature);
    RAISE NOTICE 'P0-1: أُزيل تعريف قديم %', r.signature;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 1) المصدر الوحيد لصافي ربح/خسارة الفترة غير المُقفلة
--    دالة داخلية (لا تُمنح لـ authenticated) لأنها تجميع على مستوى الشركة
--    وتُستدعى فقط من دوال SECURITY DEFINER بعد التحقق من الوصول.
--    الإشارة: إيراد 4xxx (دائن - مدين) + مصروف 5xxx (دائن - مدين سالب)
--            = الإيرادات − المصروفات. تصبح صفراً تلقائياً بعد إغلاق السنة.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_balance_sheet_net_profit(
  p_company_id uuid,
  p_as_of_date date DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0)
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.type IN ('revenue', 'expense')
    AND je.company_id = p_company_id
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date <= COALESCE(p_as_of_date, CURRENT_DATE)
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id);
$function$;

COMMENT ON FUNCTION public.fn_balance_sheet_net_profit(uuid, date, uuid) IS
  'صافي ربح/خسارة الفترة غير المُقفلة (إيرادات 4xxx ومصروفات 5xxx بإشارتها الصحيحة) حتى تاريخ معين.';

REVOKE ALL ON FUNCTION public.fn_balance_sheet_net_profit(uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_balance_sheet_net_profit(uuid, date, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_balance_sheet_net_profit(uuid, date, uuid) FROM authenticated;

-- ---------------------------------------------------------------------
-- 2) ملخص الميزانية العمومية — الأصول = الالتزامات + حقوق الملكية
--    (نفس حارس التعريف الحيّ verify_company_access ونفس فلاتر الحالة)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_balance_sheet(
  p_company_id uuid,
  p_as_of_date date DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE(category text, amount numeric, type text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_date date := COALESCE(p_as_of_date, CURRENT_DATE);
  v_assets numeric := 0;
  v_liabilities numeric := 0;
  v_equity_base numeric := 0;
  v_net_profit numeric := 0;
BEGIN
  PERFORM public.verify_company_access(p_company_id);

  -- الأصول (1xxx): مدين - دائن
  SELECT COALESCE(SUM(jel.debit_amount) - SUM(jel.credit_amount), 0)
    INTO v_assets
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.code LIKE '1%'
    AND je.company_id = p_company_id
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date <= v_date
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id);

  -- الالتزامات (2xxx): دائن - مدين
  SELECT COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0)
    INTO v_liabilities
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.code LIKE '2%'
    AND je.company_id = p_company_id
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date <= v_date
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id);

  -- حقوق الملكية المُرحّلة (3xxx): دائن - مدين
  SELECT COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0)
    INTO v_equity_base
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.code LIKE '3%'
    AND je.company_id = p_company_id
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date <= v_date
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id);

  -- صافي ربح الفترة غير المُقفلة (يصبح صفراً تلقائياً بعد إغلاق السنة المالية)
  v_net_profit := public.fn_balance_sheet_net_profit(p_company_id, v_date, p_branch_id);

  -- ⚠️ 'equity' تشمل صافي ربح الفترة، وإلا لا تتزن المعادلة المحاسبية.
  --    إدراجه داخل equity يحافظ على توافق أي واجهة قديمة تتجاهل الصف الإفصاحي.
  category := 'الأصول';
  amount := v_assets;
  type := 'asset';
  RETURN NEXT;

  category := 'الالتزامات';
  amount := v_liabilities;
  type := 'liability';
  RETURN NEXT;

  category := 'حقوق الملكية';
  amount := v_equity_base + v_net_profit;
  type := 'equity';
  RETURN NEXT;

  category := 'صافي ربح/خسارة الفترة غير المُقفلة';
  amount := v_net_profit;
  type := 'retained_earnings';
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.report_balance_sheet(uuid, date, uuid) IS
  'ملخص الميزانية العمومية: asset / liability / equity (تشمل صافي ربح الفترة) / retained_earnings.';

REVOKE ALL ON FUNCTION public.report_balance_sheet(uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_balance_sheet(uuid, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_balance_sheet(uuid, date, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) تفصيل الميزانية العمومية (بنود فعلية + سطر صافي ربح الفترة)
--    إشارة الرصيد: طبيعة مدينة للأصول، دائنة للالتزامات وحقوق الملكية.
--    لا نُصفّي is_active: حساب معطّل لكن له رصيد يجب أن يظهر (اكتمال مالي).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_balance_sheet_detailed(
  p_company_id uuid,
  p_as_of_date date DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE(
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  balance numeric,
  total_debit numeric,
  total_credit numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_date date := COALESCE(p_as_of_date, CURRENT_DATE);
  v_net_profit numeric := 0;
BEGIN
  PERFORM public.verify_company_access(p_company_id);

  RETURN QUERY
  WITH line_totals AS (
    SELECT
      l.account_id,
      SUM(l.debit_amount)  AS d1,
      SUM(l.credit_amount) AS c1
    FROM public.journal_entries j
    JOIN public.journal_entry_lines l
      ON l.journal_entry_id = j.id
     AND l.company_id = p_company_id
     AND l.deleted_at IS NULL
    WHERE j.company_id = p_company_id
      AND j.status = 'posted'
      AND j.deleted_at IS NULL
      AND j.entry_date <= v_date
      AND (p_branch_id IS NULL OR j.branch_id = p_branch_id)
    GROUP BY l.account_id
  )
  SELECT
    a.id,
    a.code,
    a.name_ar,
    a.type,
    CASE
      WHEN a.type IN ('liability', 'equity') THEN COALESCE(lt.c1, 0) - COALESCE(lt.d1, 0)
      ELSE COALESCE(lt.d1, 0) - COALESCE(lt.c1, 0)
    END,
    COALESCE(lt.d1, 0),
    COALESCE(lt.c1, 0)
  FROM public.accounts a
  LEFT JOIN line_totals lt ON lt.account_id = a.id
  WHERE a.company_id = p_company_id
    AND a.deleted_at IS NULL
    AND (a.code LIKE '1%' OR a.code LIKE '2%' OR a.code LIKE '3%')
    AND (COALESCE(lt.d1, 0) <> 0 OR COALESCE(lt.c1, 0) <> 0)
  ORDER BY a.code;

  -- سطر صافي ربح/خسارة الفترة غير المُقفلة (كود 3999 وهمي غير موجود في الدليل)
  v_net_profit := public.fn_balance_sheet_net_profit(p_company_id, v_date, p_branch_id);
  IF v_net_profit <> 0 THEN
    account_id   := NULL;
    account_code := '3999';
    account_name := 'صافي ربح/خسارة الفترة غير المُقفلة';
    account_type := 'equity';
    balance      := v_net_profit;
    total_debit  := CASE WHEN v_net_profit < 0 THEN -v_net_profit ELSE 0 END;
    total_credit := CASE WHEN v_net_profit > 0 THEN v_net_profit ELSE 0 END;
    RETURN NEXT;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.report_balance_sheet_detailed(uuid, date, uuid) IS
  'تفصيل بنود الميزانية العمومية (1xxx/2xxx/3xxx) + سطر 3999 لصافي ربح الفترة غير المُقفلة.';

REVOKE ALL ON FUNCTION public.report_balance_sheet_detailed(uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_balance_sheet_detailed(uuid, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_balance_sheet_detailed(uuid, date, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) فحص (أ): يجب أن يبقى تعريف واحد فقط بكل اسم (منع PGRST203 ambiguity)
--    أي تعريف شارد = إلغاء الترحيل تلقائياً وتبقى النسخة القديمة عاملة.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_bs_count int;
  v_bsd_count int;
BEGIN
  SELECT count(*) INTO v_bs_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'report_balance_sheet';

  SELECT count(*) INTO v_bsd_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'report_balance_sheet_detailed';

  IF v_bs_count <> 1 OR v_bsd_count <> 1 THEN
    RAISE EXCEPTION
      'P0-1 verification failed: عدد تعريفات report_balance_sheet=% (المطلوب 1) و report_balance_sheet_detailed=% (المطلوب 1) — ألغِ الترحيل ونظّف التواقيع الشاردة',
      v_bs_count, v_bsd_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5) فحص (ب): تشغيل فعلي للدالتين على شركات نشطة حقيقية (حتى 3 شركات).
--    PL/pgSQL لا يتحقق من الأعمدة إلا عند أول تنفيذ، لذا هذا هو الفحص الوحيد
--    الذي يُثبت أن الشاشة لن تتعطل. أي خطأ = ROLLBACK كامل.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_company uuid;
  v_checked int := 0;
  v_summary_rows int;
  v_detail_rows int;
  v_assets numeric;
  v_liab_equity numeric;
BEGIN
  -- نُعطي سياق service_role محلياً (transaction-local) كي يمرّ حارس المنشأة
  -- بغض النظر عن دور الجلسة الذي يشغّل الترحيل (سيُعاد تلقائياً عند COMMIT).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  FOR v_company IN
    SELECT c.id FROM public.companies c
    WHERE c.is_active = true
    ORDER BY c.created_at NULLS LAST
    LIMIT 3
  LOOP
    SELECT count(*), COALESCE(SUM(amount) FILTER (WHERE type = 'asset'), 0),
           COALESCE(SUM(amount) FILTER (WHERE type IN ('liability', 'equity')), 0)
      INTO v_summary_rows, v_assets, v_liab_equity
    FROM public.report_balance_sheet(v_company, CURRENT_DATE, NULL);

    SELECT count(*) INTO v_detail_rows
    FROM public.report_balance_sheet_detailed(v_company, CURRENT_DATE, NULL);

    IF v_summary_rows < 3 THEN
      RAISE EXCEPTION 'P0-1 verification failed: الملخص أعاد % صفاً فقط للشركة % (المتوقع 3 على الأقل)', v_summary_rows, v_company;
    END IF;

    RAISE NOTICE 'P0-1 verify [%]: ملخص=% صف / تفصيل=% صف / أصول=% / التزامات+ملكية=% / فرق=%',
      v_company, v_summary_rows, v_detail_rows,
      ROUND(v_assets, 2), ROUND(v_liab_equity, 2), ROUND(v_assets - v_liab_equity, 2);

    v_checked := v_checked + 1;
  END LOOP;

  IF v_checked = 0 THEN
    RAISE NOTICE 'P0-1 verify: لا توجد شركة نشطة بعد — تم تخطي اختبار التشغيل (الترحيل مطبّق بنجاح)';
  END IF;
END $$;

COMMIT;
