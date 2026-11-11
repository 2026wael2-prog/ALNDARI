# استقرار وتسريع شاشة «الجرد الميداني» — 2026-11-04

## المشكلة (الأعراض)

1. **اهتزاز الحقول أثناء الكتابة**: مؤشر الحقل يقفز ويُعاد ضبط النموذج (`reset`) بين الضغطات.
2. **«اتصال غير مستقر» يظهر ويتكرر** مع دورات إعادة اتصال Realtime متتابعة.
3. **بحث بطيء** في شاشة الجرد (يصل إلى ~0.5 ثانية للاستعلام الواحد)، وبحث متعدد الكلمات لا يعيد نتائج.

## الجذر (مُثبَت بالقياس)

### أ) حلقة حفظ ↔ Realtime ↔ إعادة جلب
- `audit_items` عضو في نشر `supabase_realtime` ⇒ أي `UPDATE` (ولو بنفس القيمة) يُطلق حدثاً.
- `save_audit_progress` كانت تنفّذ `UPDATE` على كل بند في **كل** نداء حفظ تلقائي، بلا فحص «هل تغيّر شيء؟».
- طبقة العميل: `useAuditProgressPersistence` كانت تعيد إنشاء `prepareProgressItems` مع كل تغيّر في `displayItems` / `serverItems`، وهي في مصفوفة تبعيات effect تنفّذ **حفظاً في دالة التنظيف** ⇒ كل رسم = طلب حفظ ⇒ حدث Realtime ⇒ إبطال `['audit_session']` ⇒ إعادة جلب ⇒ مصفوفة أصناف جديدة ⇒ حفظ مجدداً… حلقة مغلقة.

### ب) البحث: Seq Scan بدل فهرس trgm
- الطبعة القديمة من `search_inventory_paginated` كانت تستخدم
  `normalized_search_text LIKE ALL(ARRAY[...])` على تعبير محسوب ⇒ مُخطِّط الاستعلام لا يستطيع استخدام
  `idx_products_normalized_trgm` ⇒ `Seq Scan` على `products` (~523 ms).
- كما أن مُجزِّئ الكلمات كان مكتوباً `\\s+` (نمط حرفي، ليس مسافة بيضاء) ⇒ البحث متعدد الكلمات لم يكن يُقسَّم أصلاً.

## التغييرات

### قاعدة البيانات — `supabase/migrations/20261104204658_optimize_audit_search_and_progress_writes.sql`
| الدالة | التغيير |
|---|---|
| `search_inventory_paginated` | تقسيم بـ `[[:space:]]+`، شروط `LIKE` مفصولة بـ **AND** (فهرس trgm)، تجريد محارف البدل `%` و `_`، قائمة بيضاء لمفتاح واتجاه الترتيب، تقييد `p_limit` بين 1 و1000، تصفير الصلاحيات (`anon`/`PUBLIC` مسحوبة، `authenticated` ممنوحة) |
| `save_audit_progress` | حارس «لا تغيير = لا كتابة» (`skipped: true`)، تحديث صف لكل بند فقط عند `IS DISTINCT FROM`، كتابة المسودة عبر `ON CONFLICT … WHERE IS DISTINCT FROM`، حدود منطقية للكميات (0–1,000,000 ورفض `NaN`/`Infinity`) |

### الواجهة
| الملف | التغيير |
|---|---|
| `useAuditProgressPersistence.ts` | دوال ثابتة الهوية تقرأ أحدث القيم من `latestRef`، وحفظ المغادرة في هوك مستقل `usePersistOnUnload` يعمل مرة واحدة (لا حفظ عند كل ضغطة مفتاح) |
| `useInventorySession.ts` | تركيب-مرة واحدة لمستمع `beforeunload`، `itemsRef`/`buildDraftRef`، حارس `areAuditItemsEquivalent`، و`mergeWithServer` بلا عملية إذا لم يُضف صنف (`didAdd`)، واستخراج `mergeDraftIntoBase` + `identifierOf` |
| `useStockAudit.ts` | إبطال Realtime مُهدَّأ 600 ms، `staleTime: 30s`، ومنع إعادة الجلب عند التركيز |
| `useProducts.ts` | `keepPreviousData` + `enabled` + `gcTime` (بلا وميض نتائج) |
| `AuditItemsTable.tsx` | `filteredFields` + `stats` بمرور واحد داخل `useMemo`، `discrepancyCount` مشتق، وتصدير `React.memo` |
| `AuditSessionHeader.tsx` | حالة الحفظ/الاستعادة داخل خانة ثابتة `w-14` (بلا تغيّر عرض ⇒ بلا إزاحة أفقية) |
| `MainLayout.tsx` | شريط الاتصال/عدم الاتصال طبقة `fixed inset-x-0 bottom-24` (لا يتسبب في إعادة تدفّق/اهتزاز) |

## التحقق

### قاعدة البيانات
- `EXPLAIN ANALYZE` على `'زيت فلتر'`: `Bitmap Index Scan on idx_products_normalized_trgm` (~0.3 ms على الفهرس، 36 صفاً) — **لا Seq Scan**.
- `'%زيت فلتر%'` بالنمط القديم = **0 صف**، وبالشروط المفصولة = **36 صفاً** ⇒ تأكيد إصلاح خطأ الكلمات المتعددة.
- فحص عبر الدالة نفسها (بمطالبات JWT لمستخدم `owner`): `'زيت فلتر'` ⇒ 20 صفاً في الصفحة و`total_count = 36`، مع `p_sort_key='bogus'` و`p_sort_dir='sideways'` ⇒ تراجع آمن للقائمة البيضاء.
- مصفوفة دخان: مصطلح فارغ ⇒ 20/7351، `'%_%'` ⇒ 7351 (محارف البدل مُجرَّدة)، `'فلتر'` ⇒ 193، صفحة 2 (offset 20) ⇒ 16/36، محاولة حقن `name_ar; DROP TABLE products--` ⇒ رجوع آمن، `limit 99999` ⇒ مقصوص إلى 1000.

### حارس «لا تغيير = لا كتابة» (داخل معاملة ثم `ROLLBACK`)
| النداء | النتيجة | صفوف `audit_items` المكتوبة |
|---|---|---|
| نفس الحمولة (أول مرة) | `skipped: null`, `updated_count: 0` (كتابة المسودة فقط) | 0 |
| نفس الحمولة مرة أخرى | `skipped: true`, `updated_count: 0` | 0 |
| تغيير كمية واحدة (+5) | `skipped: null`, `updated_count: 1` | 1 |
| تكرار النداء السابق | `skipped: true`, `updated_count: 0` | 0 |

⇒ إجمالي الصفوف المتغيرة عبر النداءات الأربعة = صف واحد فقط (سابقاً: كل بند في الجلسة في كل حفظ ⇒ عشرات الأحداث).

### الجودة
- `npm run type-check` ✅ (0 أخطاء)
- `npm run build` ✅ (27 ثانية)
- `npm test -- --run` ✅ (156 ملفاً / 1188 اختباراً)
- `check:encoding` / `check:classes` / `check:fonts` / `check:layers` ✅
- دَين ESLint في الملفات المعدّلة **انخفض**: `AuditItemsTable` 142→117، `useInventorySession` 45→24، `useAuditProgressPersistence` 0→0، والبقية كما هي (لا زيادة).

## ملاحظات
- `inventory_session_drafts` **ليست** في نشر `supabase_realtime` ⇒ كتابات المسودة لا تولّد أحداثاً.
- ترقيم إصدار الترحيل في القاعدة (`20261104204658`) مطابق لاسم الملف بعد إعادة التسمية، حتى لا يُعاد تطبيقه بـ `supabase db push`.
- الاختبار المرئي المتبقي (يدويّ): تصفّح الجرد مع شبكة مُقيَّدة/مقطوعة للتأكد من: لا حفظ متكرر، لا إعادة ضبط للنموذج أثناء الكتابة، إعادة جلب واحدة لكل دفعة حفظ، ولا إزاحة رأسية عند ظهور شريط الاتصال.

---

# الموجة الثانية — صحة الكميات والأثر المالي (2026-11-04)

**القيد الحاكم:** لا مساس بأي كمية مجرودة أو قيد الجرد. لذلك لم تُغيَّر دلالة الحفظ
إطلاقاً: الفراغ ما زال يُرسل `null` كما كان، والأرقام الصالحة تمرّ كما هي، والفرق
الوحيد أن `NaN` لم يبقَ له وجود في أي مسار.

## 1) `NaN` كان يمحو كمية سبق جردها
- **السبب:** حقل الكمية `type="number"` مع `valueAsNumber` يعيد `NaN` عند الفراغ
  (تحقق فعلي باختبار RHF). ثم:
  - `AuditItemsTable` كان يعتبر `NaN !== ''` ⇒ «مجرود» ويعرض **`NaN`** في عمود الفرق والتذييل.
  - `calculateAuditStats` كانت تُدخل `NaN` في `discrepancyValue` (بلاطة الأثر المالي).
  - `buildProgressItems` كانت تحوّله `null`، و`save_audit_progress` تنفّذ
    `counted_quantity = NULL` ⇒ **مسح الكمية من القاعدة**.
- **الإصلاح:** مصدر حقيقة واحد `utils/auditQuantity.ts`:
  `toCountedQuantity` (أي قيمة غير منتهية = `null`) و`parseCountedInput` كـ`setValueAs`،
  وتُستخدم في الجدول + الإحصاءات + طلب الحفظ. الأرقام السالبة تبقى سالبة عمداً
  (يرفضها الخادم برسالة واضحة) بدل تحويلها إلى `null` الذي يمسح الكمية.
- **تحقق:** 10 اختبارات (`auditQuantity.test.ts` + `auditStats.test.ts`) + اختبار RHF
  مؤقت أثبت أن الفراغ ⇒ `null` لا `NaN` (حُذف بعد التحقق).

## 2) «صافي الأثر المالي» كان صفراً دائماً
- `getAuditSessionDetails` كانت تبني `products` بـ6 حقول بلا `cost_price/purchase_price`،
  و`buildOptimisticItem` كذلك ⇒ `unitCost = 0` لكل صنف ⇒ البلاطة تعرض `0 ر.ي` دائماً
  رغم وجود تكلفة لـ 3282 منتجاً من 7351.
- **الإصلاح (عرض فقط):** إضافة `id/cost_price/purchase_price` إلى كائن المنتج في
  mapping الخدمة وفي الصنف المتفائل. لا كتابة ولا تغيير في أي جدول.
- ملاحظة: جلسة الاختبار الحالية `f174dcd5…` أصنافها بتكلفة صفرية فعلياً، فسيبقى
  الرقم 0 فيها؛ الأثر يظهر في الأصناف ذات تكلفة.

## 3) الإحصاءات صارت حيّة أثناء الكتابة (بلا إعادة رسم الجدول)
- إضافة `statsItems` في `useAuditSessionForm`: دمج كميات `useWatch` على الأصناف
  **للعرض فقط** بمفتاح `product_id` (لا بالترتيب) ⇒ «المجرود/المتبقي/الفروقات/الأثر
  المالي» تتحدث مع كل ضغطة مفتاح.
- فُصلت عن `displayItems` عمداً: مصفوفة الجدول تبقى ثابتة الهوية أثناء الكتابة، فلا
  يُعاد رسم 1161 صفاً (أسوأ حالة: «المستودع الرئيسي») مع كل حرف.

## 4) فلترة جدول الجرد صارت مطبَّعة عربياً
- كانت `toLowerCase` خاماً بينما بحث القاعدة مطبَّع ⇒ «لا توجد أصناف مطابقة» رغم وجود النتائج.
- الآن `normalizeSearch` (همزات/تاء مربوطة/أرقام) وبكل كلمة على `name/sku/part_number`.

## 5) تعبئة أصناف المستودع عبر الطبقات الصحيحة
- `AuditSessionPage` كانت تنادي `inventoryService.saveAuditProgress` مباشرة بلا `try/catch`؛
  عند الفشل تُنفّذ التعبئة وتضيع الكميات المكتوبة بصمت.
- الآن: `saveAuditProgressAsync` من `useInventoryMutations` (رسائل `parseError` + طابور
  عدم الاتصال)، وعند الفشل **تتوقف** التعبئة وتُبقى الكميات في المسودة/النموذج.

## 6) تحسينات صغيرة مرافقة
- `AuditStats` أصبح `React.memo` ويحصّن القيمة المالية ضد أي قيمة غير منتهية.
- حقل الكمية: `inputMode="numeric"` + `aria-label`، وزر الحذف له `aria-label` (a11y).

## بوابات الجودة بعد الموجة الثانية
- `npx tsc --noEmit` ✅ 0 أخطاء
- `npm run type-check:tests` ✅
- `npm test -- --run` ✅ **157 ملفاً / 1195 اختباراً**
- `npm run build` ✅ (24.79 ثانية)
- `check:encoding` / `check:layers` / `check:classes` / `check:fonts` ✅
- `check:lint-total` ✅ **9186** خطأ (baseline مُحدَّث 9205→9186، −19 بلا أي زيادة)

## ما زال مفتوحاً (بالأولوية)
1. جدول 1161 صفاً: لا يوجد virtualization، و`getAuditSessionDetails` يجلب `products(*)`
   لكل صف. الحل: تقليص الـselect + جدول ظاهري أو تحميل تدريجي + دفعات في الحفظ.
2. اختيار التكلفة اللحظية للجرد: snapshot `unit_cost` في `audit_items` (يحتاج قراراً محاسبياً وترحيلاً).
3. اختبارات هوكس الحفظ/المزامنة (`useAuditProgressPersistence`، `useAuditSessionForm`).
4. تطبيع `any` في `AuditItemsTable` إلى `AuditItemRow` (دَين نوعي متبقٍ).
5. ترتيب الطابع الزمني للترحيل `20261104204658` مقابل ملفات `202609…` عند إعادة بناء قاعدة جديدة.

---

# الموجة الثالثة — مواءمة بوابة الـCI (2026-11-04)

بعد الدفع ظهر فشل في بوابة `check-lint-ratchet` على «الملفات المتغيّرة» فقط، إذ إن
الملفات التي لمسناها كانت تحمل دَيناً قديماً أعلى من سقفها المسجّل أو أضفنا أسطراً
جديدة رفعت التعقيد. لم نرفع أي سقف؛ بل خفضنا الدَين فعلياً:

| الملف | قبل | بعد | الإجراء |
|---|:--:|:--:|---|
| `AuditSessionHeader.tsx` | 2 | **0** | تفكيك الشريط إلى `SaveStatusHint` + `AddProductAction` + `BulkPopulateAction` + `SaveProgressAction` + `FinalizeAction` + `AuditHeaderActions` (كل مكوّن مسؤولية واحدة) |
| `AuditStats.tsx` | 5 | **0** | `formattedValue ?? …`، حقل `startedAt` صريح بدل شرط نص nullable، إبقاء `React.memo` والفحوص المنتهية |
| `useProducts.ts` | 3 | **0** | استخراج `enqueueProductSaveOffline` (نفس متغيّرات الطابور ونفس `metadata.last_updated_at`) فانخفض تعقيد `onError` دون تغيير السلوك |
| `useAuditSessionForm.ts` | 1 | **0** | حاوية `state.changed` بدل الوصول بالفهرس `base[index]` (تحذير `security/detect-object-injection`) |
| `useStockAudit.ts` | 23 | 23 | إزالة شروط `payload &&` / `variables &&` الصحيحة دائماً (تحذير نوعي فقط) |
| `auditService.ts` | 2 | 2 | إزالة تحويلات زائدة (`as`) في مسار الأصناف |
| `auditStats.ts` | 1 | **0** | استخراج `resolveProductRow` فأعاد تعقيد `calculateAuditStats` إلى 9 |
| `auditQuantity.test.ts` | 1 | **0** | حذف `as number` غير اللازم |

## بوابات الجودة بعد الموجة الثالثة
- `node scripts/check-lint-ratchet.mjs --files="…"` ✅ **19/19 ملفاً داخل السقف**
- `npm run check:lint-total` ✅ **9164** خطأ (baseline مُحدَّث 9186→9164، −22 بلا أي زيادة)
- `npx tsc --noEmit` ✅ 0 أخطاء — `npm run type-check:tests` ✅
- `npm test -- --run --coverage` ✅ **157 ملفاً / 1195 اختباراً**
- `npm run build` ✅ — `check:encoding` / `check:layers` / `check:classes` / `check:fonts` ✅

## ملاحظة CI قائمة قبل هذا العمل (تحتاج قرارك)
خطوة «Unit tests (with coverage gates)» في `.github/workflows/ci.yml` تفرض عتبات
`30%` عامة في `vitest.config.ts`، بينما التغطية الفعلية للمستودع **15.3%** (lines/statements)
و**60.4%** (branches) ⇒ الخطوة حمراء بغضّ النظر عن هذه الإصلاحات (الفارق 15 نقطة،
ولا علاقة له بالجرد الميداني). الحلول الممكنة — كلها تحتاج موافقتك لأنها تمسّ إعداد CI:
1. تقليص `coverage.include` إلى الطبقات المُختبَرة فعلاً (منطق `utils`/`services`/`hooks`)
   ثم رفع العتبة تدريجياً (الأنسب).
2. إبقاء التغطية تقريراً بلا `thresholds`، والاعتماد على ratchet للجودة.
3. خفض العتبة إلى القيمة الحالية (15%) كسقف أدنى لا يُنزل تحته مستقبلاً.
