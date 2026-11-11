-- Migration: 20261104201421_fix_bond_allocation_and_paid_amount_integrity.sql
-- Description: معالجة أخطاء الإنتاج الحرجة المسجّلة بتاريخ 2026-11-04:
--   [23514] chk_invoices_paid_not_exceed_total  -> تضاعف paid_amount في create_financial_bond
--   [23505] idx_invoices_company_idem_key       -> تسابق فحص idempotency في commit_sales_invoice_v2
--
--   1) create_financial_bond: إزالة الـ UPDATE اليدوي على paid_amount (كان يضيف المبلغ
--      مرة ثانية فوق trigger trg_sync_paid_amount)، وإضافة حارس FOR UPDATE للمتبقي مع رسالة عربية (22003).
--   2) commit_sales_invoice_v2: قفل استشاري لمفتاح idempotency + تثبيت advance_payment.
--   3) الفهارس الداعمة (57014) ودالة التدقيق: المهاجرة 20261104201547.
--
-- طريقة التنفيذ: تعديل موضعي (anchored patch) على التعريفات المطبّقة فعلياً عبر
--   pg_get_functiondef + replace، لأن تعريف commit_sales_invoice_v2 في الإنتاج يتقدّم على نسخة المستودع
--   (~2300 حرف منطق إضافي)، وإحلال نسخة المستودع كان سيتراجع عن إصلاحات إنتاجية.
--   إن لم تُطابق المراسي بالضبط يُلغى التعديل بأمان (دون أي كتابة).
--
-- Idempotent: يمكن إعادة تنفيذه بأمان.
BEGIN;

-- ============================================================================
-- 1) create_financial_bond — مصدر واحد للحقيقة في paid_amount
--
--    الجسم المطبَّق حالياً على الإنتاج مطابق لنسخة المستودع (20261103000008)،
--    فيُعدَّل موضعياً (anchored patch) بدل إعادة كتابته:
--      - حذف UPDATE اليدوي على paid_amount (كان يضيف المبلغ مرتين فوق
--        trigger trg_sync_paid_amount -> خرق 23514 على أي دفع كامل).
--      - حارس FOR UPDATE يرفض تجاوز المتبقي برسالة عربية (22003) بدل خطأ القيد
--        الخام، ويرفض الفاتورة غير الموجودة/غير التابعة للمنشأة (22023).
-- ============================================================================
DO $patch_create_financial_bond$
DECLARE
  v_oid oid := 'public.create_financial_bond(uuid,text,numeric,text,numeric,numeric,date,uuid,uuid,text,text,uuid,uuid,text,uuid)'::regprocedure;
  v_before text;
  v_after  text;

  v_a_alloc constant text := $a$    INSERT INTO payment_allocations(payment_id, invoice_id, amount, company_id)
    VALUES (v_payment_id, p_invoice_id, v_foreign_amount, p_company_id) ON CONFLICT DO NOTHING;
    UPDATE invoices SET paid_amount = GREATEST(0, COALESCE(paid_amount,0) + v_foreign_amount), updated_at = now()
    WHERE id = p_invoice_id AND company_id = p_company_id;$a$;

  v_f_alloc constant text := $b$    DECLARE
      v_locked_id uuid;
      v_remaining numeric;
    BEGIN
      SELECT i.id INTO v_locked_id FROM public.invoices i
      WHERE i.id = p_invoice_id AND i.company_id = p_company_id AND i.deleted_at IS NULL
      FOR UPDATE;

      IF v_locked_id IS NULL THEN
        RAISE EXCEPTION 'الفاتورة المحددة غير موجودة أو لا تتبع هذه المنشأة.' USING ERRCODE = '22023';
      END IF;

      SELECT ROUND(i.total_amount - COALESCE(i.paid_amount, 0), 4) INTO v_remaining
      FROM public.invoices i WHERE i.id = p_invoice_id;

      IF ROUND(v_foreign_amount, 4) > v_remaining + 0.01 THEN
        RAISE EXCEPTION 'المبلغ المخصص (%) يتجاوز المتبقي على الفاتورة (%); عدّل المبلغ أو أزل ربط الفاتورة.',
          ROUND(v_foreign_amount, 2), ROUND(v_remaining, 2) USING ERRCODE = '22003';
      END IF;

      INSERT INTO payment_allocations(payment_id, invoice_id, amount, company_id)
      VALUES (v_payment_id, p_invoice_id, v_foreign_amount, p_company_id) ON CONFLICT DO NOTHING;

      -- تحديث updated_at فقط: paid_amount مسؤولية trigger المزامنة
      UPDATE public.invoices SET updated_at = now()
      WHERE id = p_invoice_id AND company_id = p_company_id;
    END;$b$;
BEGIN
  SELECT pg_get_functiondef(v_oid) INTO v_before;

  IF position('v_remaining' in v_before) > 0
     AND position('paid_amount = GREATEST(0, COALESCE(paid_amount,0) + v_foreign_amount)' in v_before) = 0 THEN
    RAISE NOTICE 'create_financial_bond: مطبَّق مسبقاً — لا تغيير.';
    RETURN;
  END IF;

  IF (length(v_before) - length(replace(v_before, v_a_alloc, ''))) <> length(v_a_alloc) THEN
    RAISE EXCEPTION 'create_financial_bond: مرساة كتلة التخصيص غير فريدة (أو غائبة) — أُلغي التعديل حفاظاً على منطق الإنتاج.';
  END IF;

  v_after := replace(v_before, v_a_alloc, v_f_alloc);
  EXECUTE v_after;

  SELECT pg_get_functiondef(v_oid) INTO v_after;
  IF position('paid_amount = GREATEST(0, COALESCE(paid_amount,0) + v_foreign_amount)' in v_after) > 0
     OR position('v_remaining' in v_after) = 0 THEN
    RAISE EXCEPTION 'create_financial_bond: فشل التحقق بعد التعديل.';
  END IF;

  RAISE NOTICE 'create_financial_bond: تم التعديل الموضعي بنجاح (md5=%).', md5(v_after);
END;
$patch_create_financial_bond$;

-- ============================================================================
-- 2) commit_sales_invoice_v2 — تسابق idempotency + تثبيت advance_payment
--
--    ⚠️ ملاحظة معمارية مهمة: التعريف المطبَّق على قاعدة الإنتاج يحتوي منطقاً
--    إضافياً غير محفوظ في المستودع (أطول بـ ~2300 حرف من نسخة المهاجرات)، لذلك
--    لا نستبدله بنسخة المستودع (كان سيتراجع عن إصلاحات إنتاجية فعلية)، بل نُطبّق
--    تعديلاً موضعياً (anchored patch) على التعريف المطبَّق فعلياً عبر
--    pg_get_functiondef، مع رفض آمن إن تغيّرت نصوص المراسي.
--
--    (أ) pg_advisory_xact_lock على (company_id + idempotency_key) قبل الفحص
--        والـINSERT: يمنع إدراج فاتورتين بنفس المفتاح عند النقر المزدوج (23505).
--    (ب) PHASE 5 تكتب advance_payment = v_actual_paid:
--        fn_sync_invoice_paid_amount يعيد حساب paid_amount = advance_payment +
--        Σ payment_allocations، فبقاء advance_payment = 0 يمحو الدفعة الأولى
--        المحصّلة عند أول سند يُخصَّص على الفاتورة (فقدان مبلغ بصمت).
-- ============================================================================
DO $patch_commit_sales_invoice_v2$
DECLARE
  v_oid oid := 'public.commit_sales_invoice_v2(uuid,date,date,jsonb,text,text,text,numeric,text,uuid,uuid,numeric)'::regprocedure;
  v_before text;
  v_after  text;
  v_cnt    integer;

  v_a_idem constant text := $a$  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_invoice_id FROM public.invoices
    WHERE company_id = v_company_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_invoice_id;
    END IF;
  END IF;$a$;

  v_f_idem constant text := $b$  -- قفل استشاري على مفتاح عدم التكرار قبل فحصه: يمنع نقرتين
  -- متزامنتين من إدراج فاتورتين بنفس المفتاح (23505 idx_invoices_company_idem_key)
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('idem:' || v_company_id::text || ':' || p_idempotency_key)::bigint
    );

    SELECT id INTO v_invoice_id FROM public.invoices
    WHERE company_id = v_company_id AND idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_invoice_id IS NOT NULL THEN
      RETURN v_invoice_id;
    END IF;
  END IF;$b$;

  v_a_p5 constant text := $c$  -- === PHASE 5: POST INVOICE ===
  UPDATE public.invoices
  SET status = v_status,
      paid_amount = v_actual_paid
  WHERE id = v_invoice_id;$c$;

  v_f_p5 constant text := $d$  -- === PHASE 5: POST INVOICE ===
  -- advance_payment هو مصدر الحقيقة للدفعة الأولى: trigger trg_sync_paid_amount
  -- يعيد حساب paid_amount = advance_payment + Σ التخصيصات، فبقاء القيمة 0 هنا
  -- يمحو المبلغ المحصّل فعلياً عند أول سند يُخصَّص على الفاتورة.
  UPDATE public.invoices
  SET status = v_status,
      paid_amount = v_actual_paid,
      advance_payment = v_actual_paid
  WHERE id = v_invoice_id;$d$;
BEGIN
  SELECT pg_get_functiondef(v_oid) INTO v_before;
  v_after := v_before;

  -- (أ) قفل idempotency — يُطبَّق فقط إذا وُجدت المرساة مرة واحدة بالضبط
  IF position('idem:' in v_after) = 0 THEN
    v_cnt := (length(v_after) - length(replace(v_after, v_a_idem, ''))) / length(v_a_idem);
    IF v_cnt <> 1 THEN
      RAISE EXCEPTION 'commit_sales_invoice_v2: مرساة idempotency وُجدت % مرة (المتوقع 1) — أُلغي التعديل حفاظاً على منطق الإنتاج.', v_cnt;
    END IF;
    v_after := replace(v_after, v_a_idem, v_f_idem);
  END IF;

  -- (ب) advance_payment في PHASE 5
  IF position('advance_payment = v_actual_paid' in v_after) = 0 THEN
    v_cnt := (length(v_after) - length(replace(v_after, v_a_p5, ''))) / length(v_a_p5);
    IF v_cnt <> 1 THEN
      RAISE EXCEPTION 'commit_sales_invoice_v2: مرساة PHASE 5 وُجدت % مرة (المتوقع 1) — أُلغي التعديل حفاظاً على منطق الإنتاج.', v_cnt;
    END IF;
    v_after := replace(v_after, v_a_p5, v_f_p5);
  END IF;

  IF v_after = v_before THEN
    RAISE NOTICE 'commit_sales_invoice_v2: مطبَّق مسبقاً — لا تغيير.';
    RETURN;
  END IF;

  EXECUTE v_after;

  -- تحقّق نهائي على التعريف المطبَّق
  SELECT pg_get_functiondef(v_oid) INTO v_after;
  IF position('idem:' in v_after) = 0
     OR position('advance_payment = v_actual_paid' in v_after) = 0 THEN
    RAISE EXCEPTION 'commit_sales_invoice_v2: فشل التحقق بعد التعديل (الإصلاح لم يُثبَّت).';
  END IF;

  RAISE NOTICE 'commit_sales_invoice_v2: تم التعديل الموضعي بنجاح (md5=%).', md5(v_after);
END;
$patch_commit_sales_invoice_v2$;

COMMIT;
