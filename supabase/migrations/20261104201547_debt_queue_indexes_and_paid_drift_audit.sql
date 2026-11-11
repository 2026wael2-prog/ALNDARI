-- Migration: 20261104201547_debt_queue_indexes_and_paid_drift_audit.sql
-- Description:
--   [57014] statement timeout -> فهارس داعمة لطابور المديونية (due_date) ولتجميعات المتابعة.
--   4) fn_audit_invoice_paid_drift: تدقيق انحراف paid_amount = advance_payment + Σ allocations
--      (dry-run افتراضياً؛ والإصلاح يتطلب owner/admin و p_apply = true).
--
-- Idempotent: يمكن إعادة تنفيذه بأمان.
BEGIN;

-- ============================================================================
-- 3) فهارس داعمة (طابور المديونية / تخصيصات الدفع)
--    get_debt_priority_queue يجمع كل فواتير البيع المتأخرة حسب due_date،
--    والفهرس القائم يغطي issue_date فقط -> مسح كامل + تحويل عملة لكل صف.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_invoices_company_sale_due_open
  ON public.invoices (company_id, due_date)
  WHERE deleted_at IS NULL
    AND type = 'sale'
    AND status IN ('posted', 'confirmed', 'partially_paid');

CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice_active
  ON public.payment_allocations (invoice_id)
  WHERE deleted_at IS NULL;

-- آخر تواصل فعلي (last_contact) يجمع MAX حسب الطرف — فهارس جزئية تغطي التجميع.
CREATE INDEX IF NOT EXISTS idx_debt_message_log_company_party_sent
  ON public.debt_message_log (company_id, party_id)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_customer_activities_company_customer_done
  ON public.customer_activities (company_id, customer_id)
  WHERE status = 'completed';

-- ============================================================================
-- 4) تدقيق/إصلاح انحراف paid_amount
--    القاعدة: paid_amount = advance_payment + SUM(payment_allocations غير المحذوفة)
--    - p_apply = false (الافتراضي): عرض فقط بلا كتابة.
--    - p_apply = true: تصحيح الحالات القابلة للإثبات فقط (owner/admin).
--    - الصفوف التي مُحيت دفعتُها الأولى (advance = 0 مع تخصيصات) تُعرَض للمراجعة
--      ولا تُعدَّل تلقائياً لأن قيمتها الصحيحة غير قابلة للاستنتاج من الجداول.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_audit_invoice_paid_drift(
  p_company_id uuid,
  p_apply boolean DEFAULT false
)
RETURNS TABLE (
  out_invoice_id uuid,
  out_invoice_number text,
  out_party text,
  out_status text,
  out_total numeric,
  out_paid numeric,
  out_advance numeric,
  out_allocations numeric,
  out_expected numeric,
  out_drift numeric,
  out_action text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  PERFORM public.verify_company_access(p_company_id);

  IF p_apply THEN
    IF NOT (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
         WHERE ucr.user_id = v_uid
           AND ucr.company_id = p_company_id
           AND ucr.role IN ('owner', 'admin')
      )
    ) THEN
      RAISE EXCEPTION 'عذراً، لا تمتلك صلاحية تنفيذ الإصلاح المالي (owner/admin فقط)'
        USING ERRCODE = '42501';
    END IF;

    -- 4.1) فواتير بلا تخصيصات: paid_amount هو الدفعة الأولى -> ثبّتها كـ advance_payment
    --      قبل أن يمحوها أي تخصيص لاحق.
    UPDATE public.invoices i
       SET advance_payment = i.paid_amount
     WHERE i.company_id = p_company_id
       AND i.deleted_at IS NULL
       AND COALESCE(i.advance_payment, 0) = 0
       AND COALESCE(i.paid_amount, 0) > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.payment_allocations pa
          WHERE pa.invoice_id = i.id AND pa.deleted_at IS NULL
       );

    -- 4.2) فواتير لها advance مثبت: أعِد حساب paid_amount من المصادر.
    --      نتجاهل الصفوف التي سيتجاوز تصحيحها total_amount (ستخرق القيد 23514)
    --      ونتركها للمراجعة اليدوية.
    WITH alloc AS (
      SELECT pa.invoice_id, SUM(pa.amount) AS s
        FROM public.payment_allocations pa
       WHERE pa.deleted_at IS NULL
       GROUP BY 1
    )
    UPDATE public.invoices i
       SET paid_amount = i.advance_payment + a.s,
           updated_at = now()
      FROM alloc a
     WHERE a.invoice_id = i.id
       AND i.company_id = p_company_id
       AND i.deleted_at IS NULL
       AND COALESCE(i.advance_payment, 0) > 0
       AND ABS(COALESCE(i.paid_amount, 0) - (i.advance_payment + a.s)) > 0.01
       AND (i.advance_payment + a.s) <= i.total_amount + 0.01;
  END IF;

  RETURN QUERY
  WITH alloc AS (
    SELECT pa.invoice_id, SUM(pa.amount) AS s
      FROM public.payment_allocations pa
     WHERE pa.deleted_at IS NULL
     GROUP BY 1
  ),
  base AS (
    SELECT i.id AS inv_id,
           COALESCE(i.invoice_number, '')::text AS inv_no,
           COALESCE(p.name, '')::text AS p_name,
           COALESCE(i.status, '')::text AS st,
           COALESCE(i.total_amount, 0) AS tot,
           COALESCE(i.paid_amount, 0) AS paid,
           COALESCE(i.advance_payment, 0) AS adv,
           COALESCE(a.s, 0) AS alloc_sum
      FROM public.invoices i
      LEFT JOIN alloc a ON a.invoice_id = i.id
      LEFT JOIN public.parties p ON p.id = i.party_id
     WHERE i.company_id = p_company_id
       AND i.deleted_at IS NULL
  ),
  calc AS (
    SELECT b.*,
           CASE
             WHEN b.alloc_sum = 0 THEN GREATEST(b.paid, b.adv)
             WHEN b.adv > 0 THEN b.adv + b.alloc_sum
             ELSE NULL
           END AS expected
      FROM base b
  )
  SELECT c.inv_id,
         c.inv_no,
         c.p_name,
         c.st,
         c.tot,
         c.paid,
         c.adv,
         c.alloc_sum,
         -- القيمة المتوقعة؛ وفي الحالات الغامضة نعرض الفرضية (مجموع التخصيصات)
         -- للمراجع دون تطبيقها.
         COALESCE(c.expected, c.alloc_sum) AS exp_paid,
         c.paid - COALESCE(c.expected, c.alloc_sum) AS diff_paid,
         CASE
           WHEN c.expected IS NULL
             THEN 'يتطلب مراجعة: الدفعة الأولى غير مثبتة (advance = 0) مع وجود تخصيصات'
           WHEN c.expected > c.tot + 0.01
             THEN 'يتطلب مراجعة: التصحيح يتجاوز إجمالي الفاتورة'
           WHEN ABS(c.paid - c.expected) > 0.01
             THEN CASE WHEN p_apply THEN 'تم التصحيح' ELSE 'قابل للتصحيح (أعِد التشغيل بـ p_apply = true)' END
           ELSE 'مطابق'
         END::text AS verdict
    FROM calc c
   WHERE c.expected IS NULL
      OR c.expected > c.tot + 0.01
      OR ABS(c.paid - c.expected) > 0.01
   ORDER BY c.inv_no;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_audit_invoice_paid_drift(uuid, boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_audit_invoice_paid_drift(uuid, boolean) TO authenticated;

COMMIT;
