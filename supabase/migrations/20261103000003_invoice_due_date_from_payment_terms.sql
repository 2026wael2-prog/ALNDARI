-- ============================================================================
-- 20261103000003 — تاريخ استحقاق الفواتير من مدة سماح الطرف
-- ============================================================================
-- العيب (§18 من تقرير إصلاح الديون 2026-11-03):
--   كل الفواتير الآجلة كانت تُنشأ بـ due_date = issue_date (صفر يوم سماح)
--   بينما كل الأطراف لديها payment_terms_days = 30. النتيجة: 100% من
--   المديونية (635,345) تُصنَّف «متأخرة» ⇒ تقرير الأعمار والتصعيد والتنبيهات
--   كلها بلا معنى، وأي فرز بالأهمية يولّد طابوراً عشوائياً.
--
-- الحل: مُشغّل BEFORE INSERT على invoices يملأ الاستحقاق من مدة سماح الطرف
--       عندما لا يقدّم المستدعي تاريخاً ذا معنى.
--
-- لماذا في قاعدة البيانات وليس في الواجهة فقط؟
--   * RPC `commit_sales_invoice_v2` و`commit_purchase_invoice` و
--     `convert_quotation_to_invoice` جميعها تُدخل الفواتير مباشرة، وأي مسار
--     جديد يُنسى. القاعدة هي المصدر المرجعي الوحيد لمدة السماح.
--   * الواجهة ترسل NULL الآن (انظر src/features/sales/utils/dueDate.ts)،
--     والقاعدة تحسم القيمة من `parties.payment_terms_days`.
--
-- قاعدة التغطية (مقصودة ومُوثَّقة):
--   يُملأ الاستحقاق في حالتين فقط:
--     ① due_date IS NULL                    → لم يُقدَّم تاريخ إطلاقاً.
--     ② due_date = issue_date AND terms > 0 → التاريخ «المنهار» الذي كان
--        ينتجه العميل القديم أو أي مسار ينسخ الإصدار. لا توجد واجهة تسمح
--        اليوم باختيار استحقاق صريح يساوي الإصدار، لذا لا نُلغي نية مستخدم.
--   أي تاريخ صريح مختلف يُحترم كما هو.
--
-- الأثر: فواتير جديدة فقط. البيانات القائمة تحتاج تشغيلاً منفصلاً بموافقة:
--        supabase/scripts/backfill_invoice_due_date_from_terms.sql
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_invoice_due_date_from_payment_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
-- SECURITY DEFINER مقصودة: القراءة من `parties` يجب أن تُعيد النتيجة نفسها
-- مهما كانت سياسات RLS للمستخدم المُدخِل. بدونها قد يعود الاستعلام فارغاً
-- بصمت (مستخدم بلا صلاحية قراءة على الأطراف) فيُكتب استحقاق خاطئ بدل أن يُرفض.
-- القراءة مقيّدة بـ company_id الخاص بالصف نفسه ⇒ لا تسريب بين المنشآت.
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_days integer;
BEGIN
  -- فقط الفواتير التجارية ذات الطرف وبطريقة دفع آجلة.
  IF NEW.type NOT IN ('sale', 'purchase') THEN
    RETURN NEW;
  END IF;
  IF NEW.party_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF lower(COALESCE(NEW.payment_method, 'cash')) <> 'credit' THEN
    RETURN NEW;
  END IF;

  SELECT p.payment_terms_days
    INTO v_days
    FROM public.parties p
   WHERE p.id = NEW.party_id
     AND p.company_id = NEW.company_id;

  -- مدة غير محددة أو سالبة ⇒ صفر (الاستحقاق = الإصدار) بدل NULL غامض.
  v_days := GREATEST(COALESCE(v_days, 0), 0);

  IF NEW.due_date IS NULL THEN
    NEW.due_date := COALESCE(NEW.issue_date, CURRENT_DATE) + v_days;
    RETURN NEW;
  END IF;

  -- الحالة المنهارة: الاستحقاق نُسخ من الإصدار رغم وجود مدة سماح.
  -- NEW.due_date < NEW.issue_date مستحيل هنا (chk_due_after_issue)، فالمقارنة
  -- بالمساواة تكفي وتتجنّب إعادة كتابة تاريخ صريح لاحقاً عندما تكون المدة 0.
  IF v_days > 0 AND NEW.due_date = NEW.issue_date THEN
    NEW.due_date := NEW.issue_date + v_days;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_invoice_due_date_from_payment_terms() IS
'يملأ invoices.due_date من parties.payment_terms_days للفواتير الآجلة عندما لا يقدّم المستدعي تاريخاً صريحاً ذا معنى (NULL أو مساوٍ لتاريخ الإصدار). إصلاح §18: كان الاستحقاق = الإصدار لكل فاتورة آجلة.';

-- دالة مُشغّل: لا تحتاج صلاحية تنفيذ لأي دور، والمنح الافتراضي إلى PUBLIC خطر.
REVOKE ALL ON FUNCTION public.fn_invoice_due_date_from_payment_terms() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_invoice_due_date_from_payment_terms ON public.invoices;
CREATE TRIGGER trg_invoice_due_date_from_payment_terms
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_invoice_due_date_from_payment_terms();

-- PostgREST: أعِد تحميل كاش المخطط (عُرف المشروع في الهجرات السابقة).
NOTIFY pgrst, 'reload schema';

COMMIT;
