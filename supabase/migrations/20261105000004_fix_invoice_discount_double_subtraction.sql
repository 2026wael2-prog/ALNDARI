-- =====================================================================
-- 20261105000004_fix_invoice_discount_double_subtraction.sql
-- ---------------------------------------------------------------------
-- 🔴 ترحيل يصحّح **مبالغ دفتر الأستاذ** للفواتير الجديدة فقط، ولا يمسّ أي
--    فاتورة أو قيد قائم. راجعه واعتمد قيود التصحيح التاريخية قبل التطبيق.
--
-- المشكلة (P0-4): خصم الفاتورة يُخصم مرتين من القيد المحاسبي.
--   • commit_sales_invoice_v2 يحسب الصافي لكل بند:
--         line_net = qty*unit_price - discount_amount
--     ويخزّن  subtotal = Σline_net  و  total_amount = subtotal + tax
--     و discount_amount = Σdiscount  (إفصاحي — مخصوم أصلاً من subtotal).
--   • commit_purchase_invoice يخزّن subtotal = Σ(qty*cost - discount) (صافي)
--     و total_amount = subtotal + tax، مع tax_amount منفصلة.
--   ⇒ في الحالتين: total_amount = (الصافي) + الضريبة.
--
--   لكن fn_auto_post_invoice_journal كان يحسب:
--         v_net_amount     := (total_amount - tax) - discount_amount
--         v_net_receivable :=  total_amount - discount_amount
--   أي يخصم الخصم مرة ثانية ⇒ الإيرادات/المخزون/الذمم أقل من الحقيقة بمقدار
--   الخصم في كل فاتورة discount_amount > 0.
--
--   فواتير البيع كانت تُخفي الأثر لأن الخصم يُدمج في unit_price للبند، أما
--   فواتير الشراء (discount_amount > 0) فترحّل مخزوناً وذمماً ناقصة فعلاً.
--
-- الإصلاح: إزالة خصم الخصم فقط. لا نغيّر مصدر الصافي إطلاقاً:
--     v_net_amount     := (total_amount - tax)      -- صافي البضاعة/الخدمة
--     v_net_receivable :=  total_amount             -- إجمالي الفاتورة شامل الضريبة
--   النتيجة: الذمة = الصافي + الضريبة = total_amount في البيع والشراء، وهو
--   بالضبط المبلغ المطبوع على الفاتورة والمسجَّل في شاشة المبيعات.
--   لا أثر على أي فاتورة discount_amount = 0 (أغلب البيانات).
--
-- ⚠️ أمان التشغيل الحي:
--   * لا يُعدّل بيانات، يعدّل تعريف التريجر فقط ⇒ يستخدم من الفاتورة التالية.
--   * إن لم يوجد أحد النمطين المتوقعين يُلغى الترحيل (لا استبدال صامت بلا أثر).
--   * بعد التعديل نتحقق أن التعبيرين الخاطئين اختفيا فعلاً من التعريف.
--   * يمكن التراجع بإعادة تعريف الدالة من
--     supabase/migrations/20260919000008_fix_sales_returns_and_security_hardening.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) تقرير مسبق: حجم الفواتير المتأثرة والمبالغ (للتسوية اليدوية)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_all int;
  v_all_sum numeric;
  v_posted int;
  v_posted_sum numeric;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(discount_amount), 0)
    INTO v_all, v_all_sum
  FROM public.invoices
  WHERE deleted_at IS NULL AND COALESCE(discount_amount, 0) > 0.009;

  SELECT COUNT(*), COALESCE(SUM(discount_amount), 0)
    INTO v_posted, v_posted_sum
  FROM public.invoices
  WHERE deleted_at IS NULL
    AND status IN ('posted', 'paid', 'partially_paid')
    AND COALESCE(discount_amount, 0) > 0.009;

  RAISE NOTICE 'P0-4 preflight: % فاتورة تحمل خصماً (منها % مُرحّلة) — إجمالي الخصم: % (المُرحّل فقط: %)',
    v_all, v_posted, ROUND(v_all_sum, 2), ROUND(v_posted_sum, 2);
  RAISE NOTICE 'P0-4: هذه المبالغ هي الفرق الناقص في القيود القديمة (تصحيح: مدين ذمة العميل/المورد، دائن الإيراد/المخزون)';
END $$;

-- ---------------------------------------------------------------------
-- 2) تعديل تعريف fn_auto_post_invoice_journal (كل النسخ إن تعددت)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_oids oid[];
  v_oid oid;
  v_def text;
  v_new text;
  v_patched int := 0;
  v_missing int := 0;
  c_pat_net constant text := '(new.total_amount - COALESCE(new.tax_amount, 0)) - COALESCE(new.discount_amount, 0)';
  c_fix_net constant text := '(new.total_amount - COALESCE(new.tax_amount, 0))';
  c_pat_rec constant text := 'new.total_amount - COALESCE(new.discount_amount, 0)';
  c_fix_rec constant text := 'new.total_amount';
BEGIN
  SELECT array_agg(p.oid) INTO v_oids
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'fn_auto_post_invoice_journal';

  IF v_oids IS NULL THEN
    RAISE EXCEPTION 'fn_auto_post_invoice_journal غير موجودة — تحقق من المخطط قبل التطبيق';
  END IF;

  FOREACH v_oid IN ARRAY v_oids LOOP
    v_def := pg_get_functiondef(v_oid);

    IF position(c_pat_net IN v_def) = 0 AND position(c_pat_rec IN v_def) = 0 THEN
      -- إما أُصلحت مسبقاً أو تغيّر التعريف
      IF position('COALESCE(new.discount_amount, 0)' IN v_def) = 0 THEN
        RAISE NOTICE 'P0-4: نسخة (oid=%) لا تحتوي خصماً مزدوجاً — لا تغيير', v_oid;
      ELSE
        RAISE NOTICE 'P0-4: نسخة (oid=%) تستخدم discount_amount بصيغة مختلفة — تحتاج مراجعة يدوية', v_oid;
        v_missing := v_missing + 1;
      END IF;
      CONTINUE;
    END IF;

    -- (1) صافي البضاعة/الخدمة: إزالة خصم الخصم
    v_new := replace(v_def, c_pat_net, c_fix_net);

    -- (2) إجمالي الذمة المستحقة: total_amount شامل الضريبة والخصم مرة واحدة
    v_new := replace(v_new, c_pat_rec, c_fix_rec);

    IF position(c_pat_net IN v_new) > 0 OR position(c_pat_rec IN v_new) > 0 THEN
      RAISE EXCEPTION 'فشل استبدال خصم الفاتورة المزدوج — لم يُعدّل التعريف، راجع النص يدوياً';
    END IF;

    EXECUTE v_new;
    v_patched := v_patched + 1;
  END LOOP;

  IF v_patched = 0 THEN
    IF v_missing > 0 THEN
      RAISE EXCEPTION 'لم يُعدّل أي تعريف: % نسخة تستخدم discount_amount بصيغة غير معروفة — راجع fn_auto_post_invoice_journal يدوياً', v_missing;
    END IF;
    RAISE NOTICE 'P0-4: الدالة سليمة مسبقاً — لا تغيير';
  ELSE
    RAISE NOTICE 'P0-4: تم تصحيح حساب صافي القيد وذمته في % تعريف (إزالة الخصم المزدوج)', v_patched;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) فحص بعدي: اختفاء التعبيرين الخاطئين من كل التعريفات
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_left int;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'fn_auto_post_invoice_journal'
    AND (
      position('(new.total_amount - COALESCE(new.tax_amount, 0)) - COALESCE(new.discount_amount, 0)' IN pg_get_functiondef(p.oid)) > 0
      OR position('new.total_amount - COALESCE(new.discount_amount, 0)' IN pg_get_functiondef(p.oid)) > 0
    );

  IF v_left > 0 THEN
    RAISE EXCEPTION 'P0-4 verification failed: ما زالت % نسخة تخصم الخصم مرتين', v_left;
  END IF;

  RAISE NOTICE 'P0-4 verify: لا يوجد خصم مزدوج في fn_auto_post_invoice_journal';
END $$;

-- ---------------------------------------------------------------------
-- 4) عرض عيّنة من الفواتير التاريخية التي تحتاج قيد تصحيح يدوي (قراءة فقط)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_row record;
  v_shown int := 0;
BEGIN
  FOR v_row IN
    SELECT i.invoice_number, i.type, i.status, i.discount_amount,
           i.total_amount, i.tax_amount, i.issue_date
    FROM public.invoices i
    WHERE i.deleted_at IS NULL
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND COALESCE(i.discount_amount, 0) > 0.009
    ORDER BY i.issue_date DESC
    LIMIT 10
  LOOP
    RAISE NOTICE 'P0-4 تاريخي: % [%/%] % → خصم % | إجمالي % | ضريبة %',
      v_row.invoice_number, v_row.type, v_row.status, v_row.issue_date,
      ROUND(v_row.discount_amount, 2), ROUND(v_row.total_amount, 2), ROUND(v_row.tax_amount, 2);
    v_shown := v_shown + 1;
  END LOOP;

  IF v_shown > 0 THEN
    RAISE NOTICE 'P0-4: عُرض % فاتورة (أحدث 10) — راجع الاستعلام الكامل في نهاية الملف', v_shown;
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- استعلام التسوية اليدوية (شغّله بعد الترحيل لبناء قيود التصحيح):
--
--   SELECT id, invoice_number, type, status, issue_date,
--          discount_amount AS correction_amount,
--          total_amount, tax_amount, payment_method, payment_account_id
--   FROM public.invoices
--   WHERE deleted_at IS NULL
--     AND status IN ('posted','paid','partially_paid')
--     AND COALESCE(discount_amount, 0) > 0.009
--   ORDER BY issue_date;
--
-- اتجاه القيد لكل فاتورة (بمبلغ discount_amount):
--   • فاتورة بيع  : مدين 1100 (ذمم العملاء) / دائن 4100 (الإيرادات)
--   • فاتورة شراء : مدين 1200 (المخزون)     / دائن 2100 (الدائنون)
--     وإن كانت مدفوعة نقداً فاستخدم حساب النقد/البنك الفعلي بدل 2100.
--   ملاحظة: ضريبة 2200 لم تتأثر بالخطأ فلا تُستخدم في قيد التصحيح.
-- =====================================================================
