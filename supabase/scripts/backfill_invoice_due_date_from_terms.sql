-- ============================================================================
-- إصلاح تاريخ الاستحقاق للفواتير القائمة (§18) — سكربت بيانات ي Runs يدوياً
-- ============================================================================
-- مُشغّل الهجرة 20261103000003 يُصلح الفواتير الجديدة فقط. هذا السكربت يعالج
-- الـ61 فاتورة القائمة التي أُنشئت بـ due_date = issue_date (صفر يوم سماح).
--
-- ⚠️ هذا تغيير بيانات يغيّر أرقاماً معروضة (تقادم الأعمار / «متأخر») ⇒
--    شغّله فقط بعد موافقة صريحة على الأرقام التي يُظهرها التقرير أدناه.
--
-- القاعدة (مطابقة للمُشغّل حرفياً):
--   type ∈ ('sale','purchase') AND payment_method = 'credit'
--   AND party_id IS NOT NULL AND payment_terms_days > 0
--   AND (due_date IS NULL OR due_date = issue_date)
--   ⇒ due_date := issue_date + payment_terms_days
--
-- طريقة التنفيذ:
--   1) شغّل القسم (1) للقراءة فقط واعرض الأرقام.
--   2) شغّل القسم (2) — محاكاة تنتهي بـ ROLLBACK تلقائياً.
--   3) بعد الموافقة: انسخ القسم (2)، واستبدل ROLLBACK بـ COMMIT.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- (1) تقرير ما قبل التغيير — للقراءة فقط، لا يكتب شيئاً
-- ─────────────────────────────────────────────────────────────
SELECT
  i.company_id,
  COUNT(*)                                            AS affected_invoices,
  COUNT(DISTINCT i.party_id)                          AS affected_parties,
  SUM(i.total_amount - i.paid_amount)                 AS affected_open_amount,
  MIN(i.issue_date)                                   AS oldest_issue,
  MAX(i.issue_date)                                   AS newest_issue
FROM public.invoices i
JOIN public.parties p
  ON p.id = i.party_id AND p.company_id = i.company_id
WHERE i.deleted_at IS NULL
  AND i.type IN ('sale', 'purchase')
  AND lower(COALESCE(i.payment_method, 'cash')) = 'credit'
  AND p.payment_terms_days > 0
  AND (i.due_date IS NULL OR i.due_date = i.issue_date)
GROUP BY i.company_id
ORDER BY i.company_id;

-- عيّنة تفصيلية (أول 25 صفاً) لمراجعة الأثر قبل/بعد
SELECT
  i.invoice_number,
  i.type,
  i.issue_date,
  i.due_date                       AS due_before,
  i.issue_date + p.payment_terms_days AS due_after,
  p.name                           AS party_name,
  p.payment_terms_days,
  (i.total_amount - i.paid_amount) AS open_amount
FROM public.invoices i
JOIN public.parties p
  ON p.id = i.party_id AND p.company_id = i.company_id
WHERE i.deleted_at IS NULL
  AND i.type IN ('sale', 'purchase')
  AND lower(COALESCE(i.payment_method, 'cash')) = 'credit'
  AND p.payment_terms_days > 0
  AND (i.due_date IS NULL OR i.due_date = i.issue_date)
ORDER BY i.issue_date
LIMIT 25;

-- ─────────────────────────────────────────────────────────────
-- (2) محاكاة التطبيق — تنتهي بـ ROLLBACK (لا تُغيّر شيئاً)
--     لاعتماد التغيير: استبدل ROLLBACK في آخر السكربت بـ COMMIT.
-- ─────────────────────────────────────────────────────────────
BEGIN;

-- منع التداخل: قفل الصفوف المتأثرة خلال المعاملة
WITH fixed AS (
  UPDATE public.invoices i
     SET due_date = i.issue_date + p.payment_terms_days
    FROM public.parties p
   WHERE p.id = i.party_id
     AND p.company_id = i.company_id
     AND i.deleted_at IS NULL
     AND i.type IN ('sale', 'purchase')
     AND lower(COALESCE(i.payment_method, 'cash')) = 'credit'
     AND p.payment_terms_days > 0
     AND (i.due_date IS NULL OR i.due_date = i.issue_date)
  RETURNING i.id
)
SELECT COUNT(*) AS simulated_rows_updated FROM fixed;

-- التحقق بعد المحاكاة: يجب أن تصبح المديونية «المتأخرة» أصغر مما كانت
SELECT
  COUNT(*) FILTER (WHERE due_date > CURRENT_DATE)                AS not_yet_due_invoices,
  COUNT(*) FILTER (WHERE due_date = CURRENT_DATE)                AS due_today_invoices,
  COUNT(*) FILTER (WHERE due_date < CURRENT_DATE)                AS overdue_invoices,
  SUM(total_amount - paid_amount) FILTER (WHERE due_date > CURRENT_DATE) AS not_yet_due_amount,
  SUM(total_amount - paid_amount) FILTER (WHERE due_date < CURRENT_DATE) AS overdue_amount
FROM public.invoices
WHERE deleted_at IS NULL
  AND type = 'sale'
  AND lower(COALESCE(payment_method, 'cash')) = 'credit';

ROLLBACK;
