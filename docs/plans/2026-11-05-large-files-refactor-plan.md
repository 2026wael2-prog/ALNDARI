# خطة إعادة هيكلة الملفات الضخمة — 2026-11-05

> نطاق: `alzhraERP/src` (الملفات المولّدة مثل `database.types.ts` مستثناة).
> المبدأ: **إعادة هيكلة خالصة بلا تغيير سلوك**، موجة واحدة في كل مرة، وبوابة جودة كاملة بعد كل موجة.

## 1. خط الأساس (W0) — مقيس فعلياً على هذا الفرع

| المؤشر | القيمة |
| --- | --- |
| ملفات TS/TSX في `src` | 1,346 |
| ملفات ≥ 300 سطر | 216 |
| ملفات ≥ 500 سطر | 32 |
| ملفات ≥ 800 سطر | 2 |
| أكبر ملف غير مولّد | `QuotationDetailsModal.tsx` (819) |
| إجمالي أخطاء ESLint | 9,158 (تحذيرات 206) |
| أخطاء TypeScript | 0 |
| الاختبارات | 164 ملف |

> تنبيه: تقرير `DEEP-AUDIT-LARGE-FILES-2026-11-04.md` أصبح **متقادماً جزئياً**
> (ادّعى «0 ملف ≥ 800» وأن `ExcelTable` = 791 سطراً؛ الواقع اليوم 819 و482). لا يُعتمد
> كمرجع قياس؛ المرجع هو `scripts/audit-file-complexity.mjs` + عدّ ESLint الفعلي.

## 2. العيوب المؤكدة (أعلى قيمة)

1. **`PrintableInvoice.tsx` (585 سطراً، 173 خطأ lint)**: `return` مبكر قبل الـhooks
   (8 انتهاكات `react-hooks/rules-of-hooks`) + `invoice: any`.
2. **`PriorityQueueCard.tsx` (613 سطراً، عمق JSX 34)**: سبعة مكوّنات محلية داخل ملف واحد.
   (تصحيح للافتراض السابق: الصفوف **مُدوّلة افتراضياً** عبر `useVirtualizer` داخل
   `ExcelTableBody` — لا حاجة لإضافة تدويل جديد.)
3. **`PurchasesPage.tsx` (466)**: 16 `useState` وتمرير بيانات غير مُنمّط.
4. **`EntityShareModal.tsx` (619)**: 5 انتهاكات a11y (`no-static-element-interactions`).
5. **`QuotationBuilderDrawer.tsx` (599)**: 3 × `security/detect-object-injection`.

## 3. الموجات

| الموجة | الملفات | الحالة |
| --- | --- | --- |
| W0 | خط الأساس + هذه الوثيقة | ✅ منجز |
| W1 | `PrintableInvoice` + `PriorityQueueCard` | ✅ منجز (انظر §4) |
| W2 | `QuotationDetailsModal` + `QuotationBuilderDrawer` + `EntityShareModal` | متبقٍ |
| W3 | `ReconciliationPageView` + `CashCountBoard` | متبقٍ |
| W4 | صفحات/قوائم: `InvoiceListView`، `InvoiceMeta`، `PurchaseMeta`، `PublicSupplierPortalPage`، `CreatePaymentModal`، `AdhanSettingsBar` | متبقٍ |
| W5 | طبقة الخدمات: `supplierPortalService`، `debtApi`، `productService`، `adminService` | متبقٍ |
| W6 | الإغلاق: 0 ملف ≥ 500 سطر، وتغطية الاختبارات 30% → 40% | متبقٍ |

## 4. W1 — ما نُفّذ فعلياً

### 4.1 `PrintableInvoice` (585 → 59 سطراً للمكوّن + وحدات صغيرة)

```
print/invoice/
├── invoicePrintModel.ts        منطق خالص: البنود، الإجماليات، عنوان المستند، ZATCA
├── invoicePrintModel.test.ts   13 اختباراً
├── companyHeader.ts            حل رأس المنشأة + دمجه
├── companyHeader.test.ts       4 اختبارات
├── invoicePrintStyles.ts       CSS الطباعة (قالب ثابت + استبدال اللون)
├── useInvoicePrintState.ts     حالة الأدوات (hooks كلها قبل أي return)
├── InvoicePrintChrome.tsx      الأنماط + شريط الأدوات
├── InvoicePrintDocument.tsx    صفحة A4 (تركيب)
├── InvoicePrintMetaCards.tsx   بطاقتا العميل والعملية
├── InvoiceItemsPrintTable.tsx  جدول البنود
├── InvoicePrintSummary.tsx     QR + المبلغ كتابةً + الإجماليات
├── InvoicePrintQrAndWords.tsx
├── InvoicePrintTotalsTable.tsx
├── InvoicePrintTerms.tsx       الشروط القابلة للتحرير + الختم
└── InvoicePrintPlaceholder.tsx
```

إصلاحات جوهرية:
- **`rules-of-hooks`**: كانت الفاتورة تُرجع مبكراً قبل `useCompany`/`useInvoiceSettings`/`useState`
  عندما تكون `invoice` فارغة. الآن كل الـhooks تُستدعى دائماً، والقرار البصري بعدها.
- **`invoice: any`** استُبدل بـ`PrintableInvoiceSource` (كل الحقول `| null | undefined`)،
  و`InvoiceDisplayItem`/`InvoicePrintTotals` أنواع صريحة.
- **الحسابات** خرجت من JSX إلى دوال نقية قابلة للاختبار (ضريبة السطر، الاشتقاق 15/115،
  منع `Math.abs`، الحفاظ على إشارة الخصم).
- **الشروط** صارت حالة محلية داخل `InvoicePrintTerms` فلا يُعاد تصيير الصفحة عند التحرير.
- نتيجة: **173 خطأ → 0** (ومنها 8 مخالفات hooks حقيقية).

### 4.2 `PriorityQueueCard` (613 → 82 سطراً)

```
components/queue/
├── queueCardConstants.ts     QUEUE_LIMIT / FOCUS_ROWS / ghostButton
├── queueCardHelpers.ts       baseCurrencyOf / rankOf / describeFilters
├── queueTypes.ts             QueueData / QueueHandlers / QueueSelection / QueueExportController
├── useQueueData.ts           استعلام + فلترة + تركيز (+ useMemo)
├── useQueueColumns.ts        بناء الأعمدة مرة واحدة لكل تغيير مؤثر
├── useQueueHandlers.ts       كل المعالجات
├── useQueueSelection.ts      اختيار الصف + اشتقاق نوافذ التذكير/الوعد
├── useQueueExport.ts         تصدير xlsx بحالة تحميل ورسالة فشل
├── usePriorityQueueCard.ts   تجميع الحالة للمكوّن
├── QueueHeader.tsx · QueueMobileList.tsx · QueueGridArea.tsx
├── QueueBulkArea.tsx · QueueScoreFormula.tsx · QueueModals.tsx
```

ملاحظات:
- التصيير الآن مقصور على الأجزاء المتغيرة (الترويسة/الشريط/الشبكة) بدل ملف واحد.
- التدويل موجود مسبقاً في `ExcelTableBody` (‏`useVirtualizer`) — لا تكرار.
- الاختبار الحالي `PriorityQueueCard.test.tsx` يمرّ كما هو (4 اختبارات) دون تعديل.

## 5. بوابة القبول بعد كل موجة

```
npm run type-check && npm run type-check:tests
npx vitest run
npm run check:encoding && npm run check:layers && npm run check:fonts && npm run check:classes
npm run validate:barrels && npm run scan:orphans
npm run check:lint-total && npm run build
```

معايير الملف الواحد: ≤ 300 سطر (≤ 400 للحاويات)، `tsc` = 0، lint = 0 للملفات الجديدة،
والواجهة العامة (default export) لا تتغير.

## 6. النتائج المقيسة بعد W1

- أخطاء ESLint: **9,158 → 8,985** (‏−173، صفر دين جديد).
- تحذيرات ESLint: **206 → 205**.
- `scripts/audit-file-complexity.mjs`: 1,376 ملفاً (‏+30 وحدة مفكّكة)، **214** ≥300 سطر
  (كانت 216)، **30** ≥500 سطر (كانت 32)، **2** ≥800 (بلا تغيير) — ولم يبق
  `PrintableInvoice` ولا `PriorityQueueCard` في قائمة أعلى 40 ملفاً.
- `tsc` (تطبيق + اختبارات): **0 أخطاء**.
- الاختبارات: **166 ملفاً / 1,235 اختباراً ناجحاً** (‏+2 ملف، +17 اختباراً جديداً في طبقة الطباعة).
- `build`: ناجح.
- `check:encoding` / `check:layers` / `check:fonts` / `check:classes` / `validate:barrels` / `scan:orphans`: كلها نظيفة.

## 7. الخطوة التالية

W2: `QuotationDetailsModal.tsx` (819) أولاً بفصل نماذج العرض (`quotationDetails.model.ts`)
ثم `QuotationBuilderDrawer.tsx` (إزالة `detect-object-injection` بجداول صريحة بدل الفهرسة)،
ثم `EntityShareModal.tsx` (تحويل عناصر النقر إلى `<button>` حقيقية).
