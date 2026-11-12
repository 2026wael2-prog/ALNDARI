-- ==============================================================================
-- Al-Zahra Smart ERP — Strict Sales Invoice Currency & Rate Audit
-- تدقيق صارم لفواتير المبيعات: فحص تداخل وتناقض عملات الريال اليمني والسعودي
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. الفواتير اليمنية المسجلة بالخطأ كـ "ريال سعودي" (SAR)
-- الأعراض: عملة SAR ولكن إجمالي الفاتورة >= 5,000 ر.س أو سعر أي بند >= 1,000 ر.س
-- (في قطع الغيار والمبيعات، مبالغ مثل 20,000 أو 50,000 أو 150,000 هي يمني ودخلت كسعودي)
-- ------------------------------------------------------------------------------
SELECT 
    i.id,
    i.invoice_number AS "رقم الفاتورة",
    i.issue_date AS "تاريخ الإصدار",
    COALESCE(b.name, 'غير محدد') AS "الفرع",
    COALESCE(p.name, 'عميل نقدي') AS "العميل",
    i.currency_code AS "العملة المسجلة",
    i.total_amount AS "المبلغ المسجل بالسعودي",
    i.exchange_rate AS "سعر الصرف",
    '🔴 خطأ: فاتورة يمنية مسجلة كـ سعودي (SAR) - تضخم الإيراد بالسعودي' AS "نوع الخلل"
FROM public.invoices i
LEFT JOIN public.branches b ON b.id = i.branch_id
LEFT JOIN public.parties p ON p.id = i.party_id
WHERE i.deleted_at IS NULL
  AND i.type = 'sale'
  AND i.status NOT IN ('void', 'cancelled')
  AND i.currency_code = 'SAR'
  AND (
      i.total_amount >= 5000 
      OR EXISTS (
          SELECT 1 FROM public.invoice_items it 
          WHERE it.invoice_id = i.id AND it.unit_price >= 1000
      )
  )
ORDER BY i.total_amount DESC;


-- ------------------------------------------------------------------------------
-- 2. الفواتير السعودية المسجلة بالخطأ كـ "ريال يمني" (YER)
-- الأعراض: عملة YER ولكن إجمالي الفاتورة أقل من 1,000 ر.ي (مثل 50 أو 150 أو 300)
-- في اليمن لا توجد فواتير مبيعات كاملة بأقل من 1,000 ريال يمني، هذه مبالغ سعودية حقيقية سُجلت كـ YER!
-- ------------------------------------------------------------------------------
SELECT 
    i.id,
    i.invoice_number AS "رقم الفاتورة",
    i.issue_date AS "تاريخ الإصدار",
    COALESCE(b.name, 'غير محدد') AS "الفرع",
    COALESCE(p.name, 'عميل نقدي') AS "العميل",
    i.currency_code AS "العملة المسجلة",
    COALESCE(i.total_document_amount, i.total_amount) AS "المبلغ المدخل",
    i.total_amount AS "المعادل بالسعودي",
    i.exchange_rate AS "سعر الصرف",
    '🟡 خطأ: فاتورة سعودية مسجلة كـ يمني (YER) - المبالغ صغيرة جداً' AS "نوع الخلل"
FROM public.invoices i
LEFT JOIN public.branches b ON b.id = i.branch_id
LEFT JOIN public.parties p ON p.id = i.party_id
WHERE i.deleted_at IS NULL
  AND i.type = 'sale'
  AND i.status NOT IN ('void', 'cancelled')
  AND i.currency_code = 'YER'
  AND COALESCE(i.total_document_amount, i.total_amount) < 1000
ORDER BY COALESCE(i.total_document_amount, i.total_amount) ASC;


-- ------------------------------------------------------------------------------
-- 3. فواتير الريال اليمني التي حُفظت بمعادل صرف (1:1) أو دون سعر صرف حقيقي
-- الأعراض: عملة YER ولكن exchange_rate = 1 أو total_amount = total_document_amount
-- النتيجة: تحويل 100,000 ريال يمني إلى 100,000 ريال سعودي!
-- ------------------------------------------------------------------------------
SELECT 
    i.id,
    i.invoice_number AS "رقم الفاتورة",
    i.issue_date AS "تاريخ الإصدار",
    COALESCE(b.name, 'غير محدد') AS "الفرع",
    i.currency_code AS "العملة",
    COALESCE(i.total_document_amount, i.total_amount) AS "المبلغ باليمني",
    i.total_amount AS "المعادل الخاطئ بالسعودي",
    i.exchange_rate AS "سعر الصرف",
    '🟠 خطأ: سعر صرف 1:1 لليمني جعل المعادل مساوياً للمبلغ اليمني بالكامل' AS "نوع الخلل"
FROM public.invoices i
LEFT JOIN public.branches b ON b.id = i.branch_id
WHERE i.deleted_at IS NULL
  AND i.type = 'sale'
  AND i.status NOT IN ('void', 'cancelled')
  AND i.currency_code = 'YER'
  AND (i.exchange_rate IS NULL OR i.exchange_rate = 1 OR i.total_amount = i.total_document_amount);


-- ------------------------------------------------------------------------------
-- 4. فواتير الريال اليمني التي ضُرب فيها المعادل بالسعودي بدلاً من قسمته
-- الأعراض: total_amount أكبر من total_document_amount بمئات المرات
-- ------------------------------------------------------------------------------
SELECT 
    i.id,
    i.invoice_number AS "رقم الفاتورة",
    i.issue_date AS "تاريخ الإصدار",
    COALESCE(b.name, 'غير محدد') AS "الفرع",
    i.currency_code AS "العملة",
    COALESCE(i.total_document_amount, i.total_amount) AS "المبلغ باليمني",
    i.total_amount AS "المعادل المتضخم بالضرب",
    i.exchange_rate AS "سعر الصرف",
    '🟣 خطأ: معادل سعودي متضخم بالضرب بدلاً من القسمة' AS "نوع الخلل"
FROM public.invoices i
LEFT JOIN public.branches b ON b.id = i.branch_id
WHERE i.deleted_at IS NULL
  AND i.type = 'sale'
  AND i.status NOT IN ('void', 'cancelled')
  AND i.currency_code = 'YER'
  AND i.total_amount > COALESCE(i.total_document_amount, i.total_amount);


-- ==============================================================================
-- 5. أوامر التصحيح الآمنة المقترحة (Run in Transaction)
-- ==============================================================================

/*
-- أ. لتصحيح الفواتير اليمنية التي دخلت كـ SAR في فرع وائل (تعديلها إلى YER بمعادل 410):
BEGIN;
UPDATE public.invoices
SET 
    currency_code = 'YER',
    exchange_rate = 410,
    total_document_amount = total_amount, -- المبلغ الأصلي الذي كتبه الكاشير هو باليمني
    subtotal_document_amount = subtotal,
    total_amount = ROUND((total_amount / 410)::numeric, 2), -- المعادل الحقيقي بالسعودي
    subtotal = ROUND((subtotal / 410)::numeric, 2)
WHERE branch_id IN (SELECT id FROM public.branches WHERE name LIKE '%وائل%' OR name LIKE '%النظاري%')
  AND currency_code = 'SAR'
  AND total_amount >= 5000
  AND type = 'sale'
  AND status NOT IN ('void', 'cancelled');
COMMIT;

-- ب. لتصحيح فواتير YER التي تم حفظ سعر صرفها 1 أو بالعكس:
BEGIN;
UPDATE public.invoices
SET 
    exchange_rate = 410,
    total_amount = ROUND((COALESCE(total_document_amount, total_amount) / 410)::numeric, 2),
    total_document_amount = COALESCE(total_document_amount, total_amount)
WHERE currency_code = 'YER'
  AND (exchange_rate = 1 OR exchange_rate IS NULL OR total_amount >= total_document_amount)
  AND type = 'sale'
  AND status NOT IN ('void', 'cancelled');
COMMIT;
*/

