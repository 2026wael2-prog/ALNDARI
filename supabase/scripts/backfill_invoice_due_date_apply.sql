-- ============================================================================
-- تعبئة تاريخ الاستحقاق للفواتير القائمة — تنفيذ فعلي (2026-11-03)
-- ============================================================================
-- السياق: مُشغّل الهجرة 20261103000003 يُصلح الفواتير الجديدة فقط. الفواتير
-- القائمة أُنشئت بـ due_date = issue_date (عيب العميل القديم) بينما مدة سماح
-- الطرف payment_terms_days = 30 ⇒ 100% من المحفظة تظهر «متأخرة».
--
-- المحاكاة التي وافق عليها المستخدم (ROLLBACK، 2026-11-03):
--   فواتير متأخرة 82 → 17 | مبلغ متأخر 776,565 → 197,000
--   مبلغ لم يحن أجله 0 → 579,565
--
-- الضمانات في هذا السكربت:
--   1) نسخة احتياطية كاملة للتواريخ القديمة في جدول مستقل قبل أي تغيير.
--   2) التحديث مربوط بصف النسخة الاحتياطية (due_date_before) ⇒ إعادة التشغيل
--      لا تُغيّر شيئاً (idempotent) ولا تمسّ تاريخاً عُدّل يدوياً بعد النسخة.
--   3) الجدول الاحتياطي: RLS مفعّل بلا سياسات + سحب الصلاحيات من anon
--      و authenticated ⇒ لا يُرى عبر PostgREST إطلاقاً (service_role فقط).
--   4) كل شيء داخل معاملة واحدة: أي فشل ⇒ لا تغيير ولا نسخة جزئية.
--
-- الاسترجاع (إن لزم):
--   UPDATE public.invoices i
--      SET due_date = b.due_date_before
--     FROM public.backup_invoice_due_date_20261103 b
--    WHERE b.invoice_id = i.id;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.backup_invoice_due_date_20261103 (
    invoice_id          uuid        NOT NULL,
    company_id          uuid        NOT NULL,
    invoice_number      text,
    type                varchar(20),
    issue_date          date,
    due_date_before     date,
    due_date_after      date,
    payment_terms_days  integer,
    backed_up_at        timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT backup_invoice_due_date_20261103_pkey PRIMARY KEY (invoice_id)
);

ALTER TABLE public.backup_invoice_due_date_20261103 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backup_invoice_due_date_20261103 FROM anon, authenticated;

-- (1) النسخة الاحتياطية: تُسجّل الوضع «قبل» لكل صف مطابق للقاعدة.
INSERT INTO public.backup_invoice_due_date_20261103 (
    invoice_id, company_id, invoice_number, type, issue_date,
    due_date_before, due_date_after, payment_terms_days
)
SELECT i.id,
       i.company_id,
       i.invoice_number,
       i.type,
       i.issue_date,
       i.due_date,
       i.issue_date + p.payment_terms_days,
       p.payment_terms_days
  FROM public.invoices i
  JOIN public.parties p
    ON p.id = i.party_id
   AND p.company_id = i.company_id
 WHERE i.deleted_at IS NULL
   AND i.type IN ('sale', 'purchase')
   AND lower(COALESCE(i.payment_method, 'cash')) = 'credit'
   AND p.payment_terms_days > 0
   AND (i.due_date IS NULL OR i.due_date = i.issue_date)
ON CONFLICT (invoice_id) DO NOTHING;

-- (2) التحديث الفعلي — لا يُنفَّذ إلا على صفوفها الاحتياطية وبشرط تطابق «قبل».
UPDATE public.invoices i
   SET due_date = b.due_date_after
  FROM public.backup_invoice_due_date_20261103 b
 WHERE b.invoice_id = i.id
   AND i.due_date IS NOT DISTINCT FROM b.due_date_before
   AND b.due_date_after IS NOT NULL
   -- IS DISTINCT FROM وليس <> : الصفوف ذات due_date = NULL لم تكن تُحدَّث
   -- لأن مقارنة NULL بـ <> تُنتج NULL (شوهد فعلياً: 112 نسخة احتياطية مقابل
   -- 82 تحديثاً في التشغيل الأول).
   AND b.due_date_after IS DISTINCT FROM b.due_date_before;

-- (3) تحقق نهائي داخل نفس المعاملة.
SELECT
    (SELECT COUNT(*) FROM public.backup_invoice_due_date_20261103)            AS backed_up_rows,
    (SELECT COUNT(*) FROM public.invoices i
       JOIN public.backup_invoice_due_date_20261103 b ON b.invoice_id = i.id
      WHERE i.due_date = b.due_date_after)                                     AS updated_rows,
    (SELECT COUNT(*) FILTER (WHERE due_date > CURRENT_DATE)
       FROM public.invoices
      WHERE deleted_at IS NULL AND type = 'sale'
        AND lower(COALESCE(payment_method, 'cash')) = 'credit')                AS not_yet_due_invoices,
    (SELECT COUNT(*) FILTER (WHERE due_date < CURRENT_DATE)
       FROM public.invoices
      WHERE deleted_at IS NULL AND type = 'sale'
        AND lower(COALESCE(payment_method, 'cash')) = 'credit')                AS overdue_invoices,
    (SELECT COALESCE(SUM(total_amount - paid_amount) FILTER (WHERE due_date < CURRENT_DATE), 0)
       FROM public.invoices
      WHERE deleted_at IS NULL AND type = 'sale'
        AND lower(COALESCE(payment_method, 'cash')) = 'credit')                AS overdue_amount,
    (SELECT COALESCE(SUM(total_amount - paid_amount) FILTER (WHERE due_date >= CURRENT_DATE), 0)
       FROM public.invoices
      WHERE deleted_at IS NULL AND type = 'sale'
        AND lower(COALESCE(payment_method, 'cash')) = 'credit')                AS not_yet_due_amount;

COMMIT;
