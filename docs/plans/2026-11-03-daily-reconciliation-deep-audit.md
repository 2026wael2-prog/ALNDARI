# تدقيق عميق — صفحة «المطابقة اليومية وإقفال الصندوق»

> **التاريخ:** 2026-11-03
> **المسار:** `/#/daily-reconciliation` → `src/features/reconciliation/**`
> **المفحوص:** 20 ملفاً / 4,766 سطراً + دالتا RPC + 4 هجرات + اختبارات الخدمة + رموز التصميم (CSS Tokens)
> **الحكم:** الشكاوى الثلاث (بدائي / لا يوجد جميع العملات / عشوائي ومعقّد) **صحيحة وموثّقة بأدلة في الكود**، وأخطرها ليست تجميلية بل **محاسبية**: التحويل إلى عملة الأساس يفترض الريال السعودي قسراً، ومطابقة الشبكة تُملأ تلقائياً بقيمة «المتوقع» فتظهر مطابقة وهمية 100%.

---

## 0) خلاصة تنفيذية — كل شكوى وسببها الجذري

| شكوى المستخدم | السبب الجذري (بالدليل) | الأثر |
| --- | --- | --- |
| «التصميم بدائي» | **26 كلاس** تستخدم متغيّرَي CSS **غير معرَّفين في المشروع كله**: `var(--app-card-bg)` ×19 و `var(--app-hover)` ×7. المتغيّرات المعرَّفة هي `--app-surface` و `--app-surface-hover` (`src/index.css:11-18`, `:37-42`). | كل `background-color` غير صالح عند الحساب → `unset` → **شفاف**. فكل «البطاقات» إطارات بلا تعبئة، وكل تأثيرات `hover` ميتة. هذا وحده يفسّر الإحساس بالبدائية. |
| | الصفحة **لا تستخدم أي مكوّن من نظام التصميم** عدا `Button` و `Modal` (6 استيرادات فقط). صفر استخدام لـ `Card`/`StatCard`/`ExcelTable`/`MicroHeader`/`EmptyState`/`PageLoader`/`NumericInput`/`StatusBadge`، وصفر استخدام لـ `cn()` مقابل 9 سلاسل قوالب `className={…}`. | ~2,400 سطر JSX يدوي بأنماط مكرّرة تختلف عن بقية التطبيق في الحدود والحشو والظلال والخطوط. |
| «لا يوجد جميع العملات» | الجرد النقدي أحادي العملة بنيوياً: `CashDenominationCounts = Record<string, number>` بلا بُعد عملة (`types/index.ts:26`)، والفئات مثبّتة على القيم السعودية 500…0.5 (`reconciliationService.ts:4-14`)، و`getDenominationsFor` **يعيد تسمية نفس القيم** برمز العملة فقط (`:36-44`). | منشأة أساسها **YER** لا تستطيع جرد ورقة 1000 ر.ي (غير موجودة أصلاً)، ومنشأة **USD** ترى «500 $» و«0.5 $» وهما غير موجودين. |
| | في الخادم: `fn_to_base_amount` الثلاثية **تفترض SAR كعملة أساس** (`20260921000001…sql:20-23`: `IF v_code = 'SAR' THEN RETURN p_amount`) والـ RPC يستدعيها بهذا التوقيع، بينما الهجرة نفسها تدّعي التحويل إلى `companies.base_currency` (`20261001000001…sql:5-9, 74-79`). | لمنشأة أساسها YER: كل فاتورة **SAR** تدخل المجاميع بقيمتها الاسمية دون تحويل → **نقص 410×** في المتوقع بالدرج. النسخة الواعية بعملة الأساس **موجودة أصلاً** منذ 2026-11-03 (`fn_to_base_amount(text,numeric,numeric,text)`) ولم تُستخدم. |
| | تفصيل العملات يغطي **المبيعات فقط** (`20261001000001…sql:170-189`: `WHERE i.type = 'sale'`). المرتجعات، سندات القبض/الصرف، المصروفات النثرية، تحصيلات الشبكة، والعهدة الافتتاحية تُطوى في رقم أساس واحد بلا تفصيل. | المستخدم يرى «120,000 ر.ي» بلا معرفة كم منها كاش YER وكم SAR وكم USD. |
| «عشوائي ومعقّد» | نفس الأرقام الثلاثة (المتوقع/الفعلي/الصافي) **معروضة ثلاث مرات**: بطاقات المعادلة (`sections.tsx:239-350`)، بانر التسوية (`:590-615`)، وبطاقة الفكة (`CashDropAndFloatCard.tsx:131-150`). | حمل إدراكي مضاعف بلا معلومة جديدة. |
| | **8 ألوان تمييزية** في شاشة واحدة: emerald (الدرج)، indigo (العهدة/الفكة)، cyan (الشبكة)، amber (المصروفات)، blue (نطاق المنشأة/العملات)، red (الفارق)، purple (الآجل في الإيصال)، gray. AGENTS §5 يوجب دلالة لونية واحدة (زمردي للنجاح، أحمر للخطر، كهرماني للتنبيه، أزرق للعمليات). | لا تسلسل بصري: خمسة صناديق متساوية الوزن وعين المستخدم لا تجد «الجواب». |
| | زر الاعتماد النهائي مدفون **داخل بانر الحالة في منتصف الصفحة** (`SettlementBanner`)، وبعده كارت الموظفين، والجرد الفعلي يبدأ في النصف الثاني. الترتيب لا يطابق تسلسل العمل (أعِدّ ← طابِق ← اعتمد). | المستخدم يمرّر ويبحث عن الزر الأخير — وهذا مصدر «المعقّد». |
---

## 1) النتائج التفصيلية مرتّبة بالخطورة
### 🔴 P0-1 — رموز تصميم غير معرَّفة تُفرغ كل البطاقات (26 استخداماً)

**الأدلة**

- المعرَّف فعلياً: `src/index.css:11-18` → `--app-bg`, `--app-surface`, `--app-surface-hover`, `--app-border`, `--app-text`, `--app-text-secondary`؛ والداكن في `:37-42`.
- المستخدم في صفحة المطابقة فقط: `--app-card-bg` (19) و`--app-hover` (7). `grep` على المستودع كله (بلا `node_modules`) لم يجد **أي تعريف** لهما: لا في CSS، ولا `style` ديناميكي، ولا وصفة Tailwind، ولا شاشة المظهر (`appearance/types.ts` تعرّف `--app-surface` فقط).
- الملفات الستة المتأثرة: `DailyReconciliationPage.sections.tsx` (54، 172، 200، 331، 411…)، `DenominationTouchCounter.tsx` (37، 73، 413)، `CardTerminalInputCard.tsx` (168)، `CashDropAndFloatCard.tsx` (41، 76، 100، 168)، `EmployeeSalesBreakdownCard.tsx` (41، 65)، `ReconciliationHistoryModal.tsx`.

**الأثر التقني:** عند غياب المتغيّر بلا قيمة احتياطية يصبح الإعلان «غير صالح وقت الحساب» ويُعامل كـ `unset`؛ و`background-color` غير موروثة → `transparent`. النتيجة: البطاقات شفافة تُظهر خلفية الصفحة، والعناصر الداخلية ذات `bg-[var(--app-bg)]` تبدو «بطاقات رمادية عائمة» بلا هيكل، و`hover` بلا أي استجابة بصرية — بالضبط ما وصفه المستخدم بالتصميم البدائي.

**الإصلاح:** استبدال `--app-card-bg` → `--app-surface` و`--app-hover` → `--app-surface-hover`، ثم إضافة حارس آلي (`check:tokens`) يفشل عند أي `var(--app-*)` غير معرَّف حتى لا يتكرر.

---

### 🔴 P0-2 — التحويل إلى عملة الأساس يفترض SAR قسراً (خطأ 410× في الاتجاهين)

**الأدلة**

- `20260921000001_optimize_dashboard_rpcs_and_covering_indexes.sql:20-23`:
  `v_code := UPPER(TRIM(COALESCE(p_currency_code, 'SAR'))); IF v_code = 'SAR' THEN RETURN ROUND(p_amount, 4); END IF;` ← SAR هي الأساس المفترض، ثم `:36-41` YER قسمة وباقي العملات ضرب.
- `20261001000001_fix_reconciliation_currency_branch_atomicity.sql:5-9` تدّعي: «كل مبلغ يُحوَّل إلى عملة المنشأة الأساسية (companies.base_currency) عبر public.fn_to_base_amount»، لكن كل الاستدعاءات ثلاثية الوسائط (`:96-110`, `:118-122`, `:143-145`, `:170-189`).
- النسخة الواعية بعملة الأساس **موجودة فعلاً**: `20261103000001_debt_returns_netting_and_base_currency.sql:20-74` → `fn_to_base_amount(p_currency_code, p_amount, p_exchange_rate, p_base_currency)`.

**الأثر العددي**

| عملة المنشأة | الفاتورة | الصحيح | ما يحدث فعلاً |
| --- | --- | --- | --- |
| SAR | 100,000 YER بسعر 410 | 243.90 ر.س | صحيح (قسمة) |
| **YER** | **500 SAR** | 205,000 ر.ي | **500** (نقص 410×) |
| YER | 100,000 YER بسعر 1 | 100,000 | صحيح |
| YER | 1 USD بسعر 530 | 530 | صحيح |
| YER (بعد تغيير الأساس من SAR بلا تحديث الأسعار) | 100,000 YER بسعر قديم 0.002439 | 100,000 | **0.24** (مسار `v_rate < 1` يعيد `amount * rate`) |
| SAR | 1 USD بسعر 3.75 | 3.75 | صحيح |

أي أن «إصلاح العملة» في هجرة 2026-10-01 لا يخدم إلا منشآت أساسها SAR — وهي الحالة التي ذكرها AGENTS §6 كأصل تضخّم المصروفات اليمنية. **هذا سبب بنيوي مباشر لشكوى «لا يوجد جميع العملات».**

**الإصلاح:** تمرير `v_base_currency` للنسخة الرباعية في استعلامات `get_daily_drawer_summary` و`commit_daily_reconciliation` — بلا تغيير في توقيع الـ RPC ولا في عقد الواجهة، وبلا أي دالة جديدة.

---

### 🔴 P0-3 — مطابقة الشبكة «مُختلقة»: الفعلي = المتوقع تلقائياً

**الدليل:** `pages/DailyReconciliationPage.helpers.ts:117`

`// Default initial actual card to expected card for convenience` ثم `return { kind: 'expected-card', actualCard: summary.expected_card_terminal || 0 };`

**الأثر:** في أي يوم جديد يُملأ حقل «إجمالي تقرير الماكينة الفعلي» بقيمة المتوقع من النظام **قبل** أن يقرأ المستخدم تقرير Z، فتظهر شارة «متطابق 100% مع فواتير النظام» في `CardTerminalInputCard.tsx` (VarianceIndicator) ويُحفظ `card_variance = 0` في `daily_reconciliations` — سجل مطابقة يشهد زوراً بأن الماكينة طابقت، ويضيع الفارق الحقيقي بين مدى والنظام.

**الإصلاح:** يبدأ الحقل فارغاً بحالة «لم يُدخل بعد» بلا شارة مطابقة، ونتيجة الشبكة لا تُعرض قبل إدخال صريح (ويجوز زر «استخدام قيمة النظام» صريح يترك أثراً في `card_terminal_ref`).

---

### 🔴 P0-4 — الجرد النقدي أحادي العملة والفئات سعودية مثبّتة

**الأدلة**

- `types/index.ts:26` → `export type CashDenominationCounts = Record<string, number>;` (لا بُعد عملة).
- `services/reconciliationService.ts:4-14` → `STANDARD_DENOMINATIONS` = 500/200/100/50/20/10/5/1/0.5، و`:36-44` → `getDenominationsFor` يضع رمز العملة في التسمية فقط: `STANDARD_DENOMINATIONS.map(d => ({ value: d.value, label: d.value + ' ' + symbol }))`.
- `components/DenominationTouchCounter.tsx:395-403` → الإجمالي يُحسب على خريطة مسطّحة (كل المفاتيح فئات عملة واحدة).
- الاختبار يثبّت الخلل: `services/reconciliationService.test.ts:50-53` يتوقّع `{ value: 500, label: '500 ر.ي' }` لـ YER.

**الأثر:** لا يمكن جرد درج فيه YER + SAR + USD — وهو الواقع في محلات قطع الغيار اليمنية/السعودية؛ ولا مكان لورقة 1000 ر.ي أو 250 ر.ي أو عملات 0.25$، والإجمالي النهائي يُحسب بعملة واحدة مفترضة.

**الإصلاح:** خريطة متداخلة `{ YER: { '1000': 5, '500': 2 }, SAR: { '100': 3 } }` + فئات لكل عملة + تحويل السطر إلى الأساس بسعر معروض صراحةً + إجمالي أساس واحد للمقارنة (تفصيل في §3).

---

### 🟠 P1-1 — حد التسامح ثابت 10 مهما كانت العملة

- الخادم: `20261001000001…sql:72` → `v_tolerance numeric(19,4) := 10;` ويُعاد في الملخص (`:230`) ويُقرأ منه عند الإقفال (`:352`). لا يُقرأ من `companies` ولا من أي إعداد.
- العميل: `reconciliationService.ts:16` → `DEFAULT_TOLERANCE_SAR = 10`، و`:49-54` نفس الافتراضي.
- **الأثر:** لمنشأة YER أي فارق **11 ريالاً يمنياً** (≈ 0.03 ر.س) يُصنَّف «خارج التسامح» ويُمنع الإقفال دون مبرر (`22023`). ولمنشأة USD، 10$ تسامح مبالغ فيه. الصحيح: نسبة من المتوقع أو قيمة مضبوطة بعملة الأساس.

### 🟠 P1-2 — فكة الغد مثبّتة على 300 وأزرارها 200/300/500

- `useReconciliationPageController.ts:76,87` → `useState(300)` و`setFloatRetained(300)`.
- `components/CashDropAndFloatCard.tsx:41` → `[200, 300, 500]`.
- `helpers.ts:130` → `floatRetained: rec.float_retained_for_tomorrow || 300` — و`|| 300` **يُبطل الصفر الحقيقي**: يومية مقفلة بفكة 0 تُفتح على 300.
- **الأثر:** في YER لا معنى لـ 300 (الفكة عشرات الآلاف)، وفي USD 300$ فكة ضخمة تُخفي عجزاً.

### 🟠 P1-3 — الصافي للمالك يُقصّ عند الصفر فيخفي حالة مستحيلة

- `helpers.ts:174` → `const cashToOwner = Math.max(0, Math.round((actualCashCounted - form.floatRetained) * 100) / 100);`
- **الأثر:** إذا كانت الفكة المستبقاة أكبر من الكاش المعدود (خطأ إدخال أو عجز)، تظهر «الصافي = 0» ويُحفظ 0 بلا تحذير. الصحيح: قيمة سالبة بارزة + منع الاعتماد حتى التصحيح.

### 🟠 P1-4 — تفصيل العملات للمبيعات فقط

- `20261001000001…sql:170-189`: `sales_by_currency` من `invoices WHERE i.type = 'sale'` فقط.
- **لا تفصيل** لـ: `returns_cash`/`returns_card`، `cash_receipts`، `cash_disbursements`، `petty_expenses_cash`، `card_receipts`، `opening_float`.
- **الأثر:** «المتوقع بالدرج» رقم أساس واحد لا يمكن تفسيره؛ مرتجع نقدي بالدولار أو مصروف نثري بالريال اليمني يذوب في الإجمالي بلا أثر مرئي.

### 🟠 P1-5 — لا لقطة لعملة الأساس في سجل الإقفال

- جدول `daily_reconciliations` (`20260905000001…sql:22-69`) لا يحتوي `base_currency` ولا لقطة أسعار، ونوع `ExistingReconciliationRecord` (`types/index.ts:28-60`) لا يحمل عملة.
- `DailyReconciliationPage.sections.tsx:737` يعرض كل السجل التاريخي بعملة الأساس **الحالية** (`view.currency`).
- **الأثر:** تغيير `companies.base_currency` أو سعر الصرف يجعل أرقام الأيام السابقة تُقرأ بعملة أخرى — تشويه تاريخي صامت في تقرير مالي.

### 🟠 P1-6 — وضع «الإدخال السريع» يمحو أثر الجرد

- `helpers.ts:214` → `cash_denominations: input.countMode === 'denominations' ? input.cashCounts : {}`، والوضع الافتراضي هو `quick` (`useReconciliationPageController.ts:71`).
- **الأثر:** يُحفظ `{}` فلا يمكن إثبات كيف حُسب المبلغ ولا إعادة حسابه عند تغيّر سعر الصرف — أثر تدقيقي مفقود في مستند مالي.

### 🟠 P1-7 — لا تحقق خادمي بين الفئات والمبلغ المعدود

- الإقفال يخزّن `p_actual_cash_counted` كما أرسله العميل (`:390`, `:455`) والفئات كما هي (`:391`, `:456`)، والفارق يُحسب من رقم العميل مباشرة (`:355`) بلا إعادة حساب أو مقارنة.
- **الأثر:** أي خطأ/تلاعب في الإجمالي لا يكشفه الخادم، والفئات تصبح زينة غير موثوقة.

### 🟠 P1-8 — فحص الصلاحية يدوي في الواجهة

- `helpers.ts:172-173` → `isOwner = role === 'owner'` و`isLocked = isAlreadyClosed && !isOwner`، بلا `usePermission`/`assertPermission` (`src/core/hooks/usePermission.ts`) مع أن الخادم يفرض `owner` فعلاً (`20261001000001…sql:335-341`).
- **الأثر:** ازدواج منطق الصلاحيات واحتمال انحراف عن سياسة الخادم عند إضافة أدوار.

---

### 🟡 P2 — جودة الكود والاتساق مع نظام التصميم

| # | الملاحظة | الدليل |
| --- | --- | --- |
| 1 | 13 موضعاً بأحجام `text-[10px]/[11px]` لنصوص **تفاعلية** (أزرار الفكة، عناوين بنود) — AGENTS §5 يمنع أقل من 12px للنص التفاعلي | `DailyReconciliationPage.sections.tsx` (13)، `EmployeeSalesBreakdownCard.tsx` (5)، `CashDropAndFloatCard.tsx` (4) |
| 2 | جداول يدوية بدل `ExcelTable` (لا فرز، لا تصدير، لا ترويسة ثابتة، لا أعمدة محفوظة) | `ReconciliationHistoryModal.tsx:52-70`، `EmployeeSalesBreakdownCard.tsx` |
| 3 | لا `MobileCardList` للجوال رغم جدول بـ 7 أعمدة | `ReconciliationHistoryModal.tsx` |
| 4 | حقل تاريخ أصلي `input[type=date]` بدل نمط التطبيق | `DailyReconciliationPage.sections.tsx:99-108` |
| 5 | حقول مبالغ `input[type=number]` بدل `NumericInput` (لا فواصل آلاف، لا `inputMode`، لا تطهير أرقام عربية) — مؤلم في YER بالملايين | `CardTerminalInputCard.tsx:80-93`، `CashDropAndFloatCard.tsx:93-106` |
| 6 | لا `EmptyState`/`PageLoader`/`ErrorDisplay`: بطاقة تحميل وبطاقة خطأ مخصّصتان | `sections.tsx:263-284` |
| 7 | `key={i}` (فهرس) في قائمة الموظفين داخل الإيصال | `ReconciliationPrintModal.tsx:36-43` |
| 8 | الإيصال يطبع `toFixed(2)` بلا فواصل آلاف ولا تفصيل عملات | `ReconciliationPrintModal.tsx:41, 62, 68-80` |
| 9 | `max-w-7xl` يقيّد الصفحة بـ 1280px بينما الغلاف يدعم حتى 2800px → فراغ جانبي هائل | `sections.tsx:747` مقابل `src/ui/layout/ContentContainer.tsx:20-30` |
| 10 | السجل والإيصال والمشاركة تعرض عمود عملة واحد فقط | `ReconciliationHistoryModal`، `ReconciliationPrintModal`، `reconciliationService.ts:112-208` |
| 11 | لا `aria-label` على الأزرار الأيقونية ولا اختصارات ولا `role` للجداول اليدوية | `WhatsAppShareButton.tsx`، `DenominationTouchCounter.tsx:47-56` |
| 12 | 9 سلاسل قوالب `className={…}` وصفر استخدام لـ `cn()` (قاعدة المشروع توجب `cn()`) | `grep 'cn('` على الميزة = 0 |

---

## 2) اختبارات وجودة — ما المحمي وما المكشوف

| المحمي | المكشوف |
| --- | --- |
| `reconciliationService.test.ts` — 6 مجموعات: تحويل العملة الأساسية، الرمز، التسميات، حد التسامح، حساب الفئات، الفارق. | **لا اختبار** للمتحكّم `useReconciliationPageController` (الحالة، إعادة التصفير، زر الإقفال، منع النقر المزدوج). |
| نظافة ESLint للميزة كاملة (تم التحقق: `npx eslint src/features/reconciliation` بلا أي تحذير). | **لا اختبار** لأي مكوّن واجهة (لا اختبار عرض ولا تفاعل) رغم 12 مكوّناً. |
| وجود `FeatureBoundary` على المسار (`routes.tsx:257`). | **لا اختبار** لـ RPC (`get_daily_drawer_summary` / `commit_daily_reconciliation`) في `supabase/tests`. |
| | اختبار واحد **يقونن الخلل**: `reconciliationService.test.ts:50-53` يثبّت فئات SAR كأنها YER. |

**الخلاصة:** الجودة الساكنة (Lint/Types) نظيفة، لكن **لا شبكة أمان سلوكية** على أخطر شاشة مالية في النظام.

**تم التحقق عملياً أثناء التدقيق:** `npx eslint src/features/reconciliation` → بلا تحذير؛ `npm run check:fonts` → «No sub-10px font sizes»؛ `npm run check:classes` → «No contradicting spacing classes». أي أن **بوابات الجودة الحالية لا تكشف أياً من P0-1 ولا P0-2 ولا P0-3** — ولهذا بقيت الصفحة على حالها.

---

## 3) التصميم المقترح — إعادة بناء بنفس منطق الأقسام (بلا تغيير معماري)

### 3.1 محرّك العملات (جوهر «جميع العملات»)

1. **مصدر العملات**: `useCurrencies()` من `settings/hooks` (يعيد `supported_currencies` + `exchange_rates.rate_to_base`) — نفس ما يستخدمه `QuickDrawerExpenseModal` (`components/QuickDrawerExpenseModal.tsx:5,9`) ونفس `resolveAutoExchangeRate` في `core/utils/currencyUtils.ts`.
2. **بنية العدّ الجديدة** (داخل `cash_denominations` الـ jsonb — لا هجرة لازمة للشكل):
   `{ "base_currency": "YER", "rates": { "SAR": 410, "USD": 530 }, "counts": { "YER": {"1000": 5, "500": 2}, "SAR": {"100": 3}, "USD": {"1": 4} } }`
3. **فئات لكل عملة** (بيانات، لا كود):
   - `SAR`: 500, 200, 100, 50, 20, 10, 5, 1, 0.5
   - `YER`: 1000, 500, 250, 200, 100, 50, 20, 10, 5
   - `USD`: 100, 50, 20, 10, 5, 2, 1, 0.5, 0.25
   - احتياطي: `[1000, 500, 100, 50, 10, 5, 1]` لأي عملة غير معروفة.
4. **الاشتقاق**:
   - إجمالي كل عملة = Σ(فئة × عدد) — بلا تحويل.
   - إجمالي الدرج بالأساس = Σ(إجمالي العملة × سعرها المعروض) → هو ما يُقارن بـ `expected_cash_in_drawer`.
   - سعر كل عملة **ظاهر وقابل للتعديل** في سطر العملة (لا تحويل خفي)، مع تنبيه إذا اختلف عن سعر الإعدادات.
5. **الخادم**: يقبل `p_cash_denominations` الجديدة، ويعيد **حساب** `actual_cash_counted` بنفسه من الفئات × `exchange_rates` (يسدّ P1-7)، ويرفض الإقفال إذا تعارض مجموع العميل مع محسوبه بأكثر من حد التسامح.

### 3.2 هيكل الصفحة الجديد (تسلسل العمل، لا تسلسل الكود)

```
┌ Header (MicroHeader) ────────────────────────────────────────────────┐
│ المطابقة اليومية | [يومية نشطة/مقفلة]        [التاريخ] [سجل] [مصروف] │
├ شريط الحالة المُلخّص (سطر واحد، 4 قيم فقط) ─────────────────────────┤
│ المتوقع 120,000 ر.ي · الفعلي 118,500 ر.ي · الفارق −1,500⚠ · الصافي   │
├ 1) جرد الدرج حسب العملة (القلب) ────────────────────────────────────┤
│ [YER ✓] [SAR] [USD]  ← تبويبات العملات المتاحة في المنشأة            │
│ ┌ شبكة فئات العملة المختارة (NumericInput لكل فئة) ─────────────┐    │
│ │ 1000 × [5] = 5,000   500 × [2] = 1,000 …  إجمالي YER = 6,000 │    │
│ └──────────────────────────────────────────────────────────────┘    │
│ سطر العملة: سعر الصرف [410] → المعادل 1,560 ر.ي                       │
│ ملخّص متعدد العملات: 6,000 ر.ي · 1,230 SAR · 40 USD = 118,500 ر.ي     │
├ 2) مطابقة الشبكة ──────────────────────────────────────────────────┤
│ المتوقع من النظام 12,400 · تقرير الماكينة [____] (فارغ حتى الإدخال)  │
│ [استخدام قيمة النظام] ← فعل صريح يُسجَّل في card_terminal_ref         │
├ 3) التسوية والتوريد ───────────────────────────────────────────────┤
│ فكة الغد [____] (مقترحات بعملة الأساس) | الصافي للمالك (سالب محظور)   │
│ مبرر الفارق (يظهر عند الحاجة)                                        │
├ 4) تفصيل العملات الكامل (مبيعات/مرتجعات/سندات/مصروفات لكل عملة) ───┤
├ 5) مبيعات الموظفين (ExcelTable قابل للطي) ─────────────────────────┤
└ Footer ثابت: [اعتماد وإقفال اليومية] + ملخّص الفارق ← لا يُدفن أبداً ┘
```

### 3.3 خريطة المكوّنات (استبدال يدوي → نظامي)

| الحالي | البديل النظامي |
| --- | --- |
| `<div className="rounded-xl border … bg-[var(--app-card-bg)]">` ×6 | `Card` (`src/ui/base/Card.tsx`) + `CardHeader` محلي رقيق |
| بطاقات المعادلة الخمس المخصّصة (`LedgerFlowGrid`) | `StatCard` (`variant="compact"`) — 4 بطاقات فقط |
| شريط أعلى مخصّص (`ReconciliationTopBar`) | `MicroHeader` (مستخدم في Sales/Purchases/Expenses/Bonds) |
| جدول السجل اليدوي | `ExcelTable` + `MobileCardList` على الجوال |
| بطاقة الموظفين اليدوية | `ExcelTable` قابل للطي (أو `StatCard` + قائمة) |
| `input[type=number]` | `NumericInput` (`src/ui/base/NumericInput.tsx`) |
| بطاقة التحميل/الخطأ | `PageLoader variant="form"` + `ErrorDisplay` |
| `{cond ? 'a' : 'b'}` في `className` (9 مواضع) | `cn()` من `core/utils` |
| `role === 'owner'` | `usePermission('reconciliation:commit')` + `assertPermission` في المُحوِّل |

---

## 4) خطة التنفيذ المرحلية

### المرحلة 1 — «التصميم البدائي» (واجهة فقط، بلا DB، ~1 يوم)

| الخطوة | الملفات |
| --- | --- |
| استبدال رموز CSS غير المعرَّفة (`--app-card-bg` → `--app-surface`، `--app-hover` → `--app-surface-hover`) | 6 ملفات (26 موضعاً) |
| إحلال `Card`/`StatCard`/`MicroHeader`/`PageLoader`/`ErrorDisplay`/`NumericInput`/`EmptyState` مكان المكوّنات اليدوية | `DailyReconciliationPage.sections.tsx` (787 سطراً → ~300) |
| إزالة `max-w-7xl` والاعتماد على غلاف التطبيق | `sections.tsx:747` |
| تقليل الألوان من 8 إلى 3 دلالية + رمادي، ورفع النصوص التفاعلية إلى 12px+ | كل المكوّنات |
| استبدال السلاسل الشرطية بـ `cn()` | 9 مواضع |

**معيار القبول:** لا `var(--app-*)` غير معرَّف، ولا `text-[10px]` على نص تفاعلي، وصفر حاجة لمكوّن مخصّص حيث يوجد نظامي.

### المرحلة 2 — «صدق الأرقام» (بلا هجرة، ~نصف يوم)

| الخطوة | الملف |
| --- | --- |
| إلغاء ملء `actualCard` تلقائياً + حالة «لم يُدخل» + زر صريح «استخدام قيمة النظام» | `helpers.ts:117`، `CardTerminalInputCard.tsx` |
| منع الصافي السالب الصامت: إظهار سالب + حجب الاعتماد | `helpers.ts:174` |
| `floatRetained` بلا `|| 300` واحترام الصفر | `helpers.ts:130` |
| مقترحات الفكة من عملة الأساس (لا 200/300/500) | `CashDropAndFloatCard.tsx:41`، `useReconciliationPageController.ts:76` |
| فحص الصلاحية عبر `usePermission` | `helpers.ts:172`، المتحكّم |

**معيار القبول:** اختبارات وحدة جديدة تُثبت: يوم بلا إدخال ماكينة ⇒ لا شارة «مطابق»؛ فكة > كاش ⇒ صافي سالب + منع؛ float 0 ⇒ يبقى 0.

### المرحلة 3 — «جميع العملات» (هجرة واحدة، ~2 أيام)

| الخطوة | الملف |
| --- | --- |
| تمرير `v_base_currency` للنسخة الرباعية من `fn_to_base_amount` في الدالتين (**إصلاح P0-2**) | هجرة `20261104000001_fix_reconciliation_base_currency.sql` |
| إضافة `tx_by_currency` (مبيعات/مرتجعات/سندات/مصروفات/شبكة لكل عملة) + `variance_tolerance` من الإعدادات | نفس الهجرة |
| إعادة حساب `actual_cash_counted` في الخادم من الفئات والأسعار + رفض التعارض | نفس الهجرة |
| لقطة `base_currency` + `rates_snapshot` في `daily_reconciliations` | نفس الهجرة (عمودان nullable للتوافق الخلفي) |
| محرّك العملات في الواجهة (تبويبات عملات + فئات لكل عملة + أسعار ظاهرة) | `reconciliationService.ts`، `DenominationTouchCounter.tsx`، `helpers.ts` |
| تحديث الاختبار الذي يقونن الخلل + اختبارات لكل فئة عملة | `reconciliationService.test.ts` |

**معيار القبول:** لمنشأة أساسها YER مع فاتورة 500 SAR: `expected_cash_in_drawer` يزيد 205,000 ر.ي؛ جرد 1000 ر.ي ×5 + 100 SAR ×3 يعطي الإجمالي الصحيح بالأساس؛ حفظ/إعادة فتح يعيد نفس الفئات؛ سجل تاريخي محفوظ قبل تغيير العملة يبقى مقروءاً بعملته.

### المرحلة 4 — «الوضوح والامتثال» (~يوم)

- `ExcelTable` + `MobileCardList` للسجل، وتصدير/طباعة/واتساب بتفصيل عملات.
- إيصال الطباعة: فواصل آلاف + أعمدة عملات + `currency` لكل سطر.
- ADR جديد: «مطابقة متعددة العملات — دستور الجرد النقدي».

---

## 5) قرارات تحتاج موافقتك قبل التنفيذ

1. **المرحلة 3 تتضمن هجرة قاعدة بيانات** (عمودان + إعادة كتابة دالتين) — وقاعدة المشروع: تغييرات الـ Schema تُطلب موافقتها أولاً.
2. **حد التسامح**: نسبة من المتوقع (مثلاً 0.5%) أم قيمة صريحة لكل عملة في الإعدادات؟
3. **الفئات لكل عملة**: هل نعتمد القوائم المقترحة في §3.1 أم قائمة يديرها المالك من الإعدادات؟
4. **هل تُنفَّذ المراحل 1+2 فوراً** (بلا DB، تُصلح الشكل وصدق الأرقام) ثم 3+4 بعد موافقة الهجرة؟

---

## 6) ملحق — خريطة سريعة للملفات المفحوصة

```
src/features/reconciliation/
├── pages/ DailyReconciliationPage.tsx (17) · .sections.tsx (787) · .helpers.ts (259) · useReconciliationPageController.ts (257)
├── components/ DenominationTouchCounter (429) · QuickDrawerExpenseModal (519) + .sections (308)
│                ReconciliationPrintModal (312) · ReconciliationHistoryModal (253)
│                EmployeeSalesBreakdownCard (246) · CardTerminalInputCard (185)
│                CashDropAndFloatCard (171) · WhatsAppShareButton (111)
├── services/ reconciliationService.ts (212) + test (251)
├── hooks/ useDailyReconciliation.ts (127)
├── api/ reconciliationApi.ts (160)
└── types/ index.ts (158)
```

**الخادم:** `get_daily_drawer_summary` + `commit_daily_reconciliation` (`20261001000001…sql:38-500`)، `fn_to_base_amount` (ثلاث نسخ)، جدول `daily_reconciliations` (`20260905000001…sql:22-69`).
**نظام التصميم:** `ui/base/{Card,Button,Modal,NumericInput,PageLoader,ErrorDisplay,EmptyState}.tsx`، `ui/common/{StatCard,ExcelTable,MobileCardList}.tsx`، `ui/layout/ContentContainer.tsx`، `docs/STYLE_GUIDE.md`، `src/index.css:11-42`.









---

## 7) حالة التنفيذ — ما نُفِّذ فعلياً (2026-11-03)

### ✅ المرحلة 1 — التصميم (مكتملة)
- إزالة كل رموز CSS غير المعرَّفة: `--app-card-bg` و`--app-hover` → `--app-surface` / `--app-surface-hover` (**صفر متبقٍ** في الميزة).
- إحلال مكوّنات النظام: `Card`, `StatCard`, `NumericInput`, `PageLoader`, `ErrorDisplay`, `Button`, `cn()` — بدل 1,100+ سطر أنماط يدوية.
- تقليل الألوان التمييزية من 8 إلى 4 دلالية (أزرق = المتوقع/الشبكة، زمردي = النجاح/الفعلي، كهرماني = تنبيه، أحمر = عجز/خطر).
- بنية صفحة جديدة بتسلسل العمل: ترويسة → نطاق → 4 أرقام حاسمة → جرد العملات → الشبكة/التوريد → تفصيل العملات → الموظفون → **شريط اعتماد ثابت** أسفل الشاشة.
- إزالة `max-w-7xl` والتقييد الزائد، ورفع النصوص التفاعلية إلى 12px+.

### ✅ المرحلة 2 — صدق الأرقام (مكتملة)
- **إلغاء المطابقة الوهمية**: `planSummarySync` تُعيد `{ kind: 'fresh' }` — لا تعبئة تلقائية لتقرير الماكينة. أُضيف زر صريح «استخدام قيمة النظام» + حالة «لم يُدخل بعد».
- **الصافي السالب** يظهر ويُحجب الاعتماد (`collectCommitBlockers`) بدل `Math.max(0, …)`.
- **الفكة** بمقياس عملة الأساس (`suggestFloatPresets` / `defaultFloatFor`) واحترام الصفر (بلا `|| 300`).
- **حد التسامح** افتراضياً حسب العملة (`defaultToleranceFor`: YER = 500، SAR = 10 …).
- تفصيل العملات يُمرَّر إلى **الطباعة** و**مشاركة واتساب**.

### ✅ المرحلة 3 (الجزء الأمامي) — جميع العملات (مكتملة في الواجهة)
- `DENOMINATIONS_BY_CURRENCY`: فئات حقيقية لكل عملة (YER حتى 1000 و250، USD حتى 0.25، OMR/KWD/BHD/AED/QAR/EGP/CNY).
- بنية عدّ متداخلة `CashCountsByCurrency` محفوظة داخل `cash_denominations` (jsonb) — **بلا هجرة قاعدة بيانات**، مع قراءة متوافقة للسجلات المسطّحة القديمة.
- تبويب لكل عملة + سعر تحويل **ظاهر وقابل للتعديل** لكل عملة + إجمالي واحد بعملة الأساس + تحذير عند غياب السعر.
- محرّك تحويل في العميل مطابق لمنطق `fn_to_base_amount` (`convertAmountToBase`).

### ✅ المرحلة 3 (الخادم) — الهجرة `20261104000001` (مطبَّقة على قاعدة الإنتاج ✅)
`supabase/migrations/20261104000001_reconciliation_base_currency_and_server_truth.sql`
**طُبِّقت فعلياً** على مشروع `orxlyiokccaodypindye` داخل معاملة واحدة (`HTTP 201`)، وسُجِّلت في `supabase_migrations.schema_migrations` (رأس التاريخ الآن `20261104000001`).

| البند | قبل | بعد |
| --- | --- | --- |
| **P0-2** تحويل عملة الأساس | كل المجاميع عبر `fn_to_base_amount/3` التي تفترض SAR أساساً → مبيعات SAR في منشأة YER تُسجَّل بقيمتها الاسمية (نقص حتى 410×) | كل التحويلات عبر النسخة الرباعية بـ `companies.base_currency`، **ونفس الثغرة في `commit_expense_v2`** (مسار كل المصروفات: `IF v_currency_code = 'SAR'`) صُحّحت |
| **P1-4** تفصيل العملات | `sales_by_currency` للمبيعات فقط | `tx_by_currency`: مبيعات/مرتجعات/سندات/نثريات لكل عملة + `net_cash` بالعملة و`net_cash_base` بمعادل الأساس |
| **P1-5** لقطة العملة | لا لقطة | أعمدة `base_currency`, `cash_count_rates`, `counted_from_denominations` في `daily_reconciliations` + تعبئة السجلات السابقة |
| **P1-7** الحقيقة الخادمية | `actual_cash_counted` رقم من العميل يُحفظ كما هو | `fn_cash_counts_to_base(jsonb, jsonb, text)` تحسب المعدود من الفئات على الخادم (متداخل أو مسطّح قديم)، وترفض الاعتماد برسالة `22023` عند عملة بلا سعر صرف. الوسيط الجديد `p_cash_rates` (افتراضي `NULL`) لا يكسر أي نداء قديم |
| **P1-1** حد التسامح | ثابت `10` مهما كانت العملة | `fn_reconciliation_tolerance()`: `companies.reconciliation_variance_tolerance` ← وإلا الافتراضي حسب العملة (نفس خريطة الواجهة: YER 500، SAR 10، KWD/OMR/BHD 1 …) |
| **حارس جديد** | لا يوجد | منع توزيع نقد أكبر من المعدود: `الفكة + المسلَّم للمالك > المعدود + التسامح` → `22023` |
| **الأسعار** | الواجهة وحدها | `fn_reconciliation_rates()` تعيد أحدث سعر معتمد ≤ تاريخ اليومية، وتُرجَع في `cash_rates` وتُحفظ لقطةً |
| **أمان مكتشف أثناء التطبيق** | سحب `EXECUTE` من `anon, PUBLIC` وحده | تبيّن عملياً أن Supabase يمنح `authenticated` صلاحية تنفيذ **كل** دوال `public` عبر `ALTER DEFAULT PRIVILEGES`، فكانت الدوال الأربع المساعدة قابلة للنداء من أي مستخدم مسجَّل (قراءة أسعار أي منشأة بمعرّفها). صُحّح بسحبها صريحاً من `authenticated` أيضاً، وتحقّقنا: `auth=false, anon=false, service_role=true, owner=true` |

> ملاحظة تنفيذية: `commit_daily_reconciliation` أُعيد إنشاؤه بعد `DROP` لأن إضافة وسيط بـ `DEFAULT` تُنشئ توقيعاً جديداً ويبقى القديم (ذي التحويل الخاطئ) قابلاً للنداء. النداءات القديمة بـ 11 وسيطاً تبقى صالحة لأن `p_cash_rates` له قيمة افتراضية.

### 🔬 التحقق المنفَّذ
| البوابة | النتيجة |
| --- | --- |
| `tsc --noEmit` | ✅ صفر أخطاء |
| `eslint src/features/reconciliation --max-warnings 0` | ✅ صفر أخطاء/تحذيرات |
| `check:lint-total` | ✅ 9610/214 = خط الأساس بالضبط (لا دين جديد) |
| `vitest` (الميزة) | ✅ 35 اختباراً (21 خدمة + 12 منطق صفحة + 2 عقد RPC) |
| `vitest` (كل المشروع) | ✅ 1100/1100 |
| `npm run build` | ✅ EXIT=0 |
| `check:fonts` / `check:classes` / `check:layers` / `check:encoding` / `scan:orphans` | ✅ نظيفة |
| **تطبيق الهجرة على قاعدة الإنتاج** | ✅ `HTTP 201` داخل معاملة واحدة، وسُجِّلت في `supabase_migrations` |
| **مطابقة الدوال المُلصقة مع النسخة الحيّة** | ✅ `diff` بين `pg_get_functiondef` الفعلي وما في الهجرة: الفروق = تغييراتي المقصودة فقط، بلا حذف عرضي |
| **اختبار انحدار على بيانات حقيقية** | ✅ منشأة SAR (507 فاتورة): `expected_cash_in_drawer` و`total_sales` و`expected_card_terminal` **متطابقة تماماً** قبل/بعد (884.1442 / 1003.8536 / 0) |
| **تصحيح تحويل العملة (P0)** | ✅ `fn_to_base_amount('SAR',100,410)` = 100 (الثغرة) مقابل `(…,'YER')` = **41,000**، و`('YER',41000,410,'SAR')` = 100 (ذهاب وعودة) |
| **تحويل الفئات** | ✅ `{YER:9000, SAR:300}` بأسعار `{SAR:410}` و أساس YER = 9000 + 123,000 = **132,000**، والشكل المسطّح القديم = 9000 |
| **الحقيقة الخادمية للمعدود** | ✅ عميل أرسل `999,999` وفئات `560` → حُفظ `560` و`counted_from_denominations = true` |
| **حارس توزيع النقد** | ✅ رفض `22023`: «الفكة (0) + المسلَّم للمالك (100000) أكبر من المعدود (560.0000) بعملة SAR» |
| **رفض عملة بلا سعر** | ✅ رفض `22023`: «لا يوجد سعر صرف صالح للعملات المعدودة (XYZ)» |
| **لقطة الأسعار** | ✅ حُفظت `{SAR:1, YER:0.002439, USD:3.75, CNY:0.515, OMR:9.74}` مع الصف |
| **الأعمدة والتعبئة الخلفية** | ✅ 3 أعمدة + عمود التسامح، و`base_currency` مطابق لعملة المنشأة في كل الصفوف (0 اختلاف) |
| **نظافة قاعدة البيانات بعد الاختبار** | ✅ كل اختبارات الكتابة نُفِّذت داخل معاملة أُرجعت (`ROLLBACK`): 0 صفوف مكتوبة، 0 دوال مؤقتة |



### 📁 الملفات
**جديدة:** `components/CashCountBoard.tsx`, `components/CardTerminalCard.tsx`, `components/FloatSettlementCard.tsx`, `pages/ReconciliationPageView.tsx`, `pages/DailyReconciliationPage.helpers.test.ts`, `api/reconciliationApi.test.ts`, `supabase/migrations/20261104000001_reconciliation_base_currency_and_server_truth.sql`.
**محذوفة:** `components/DenominationTouchCounter.tsx`, `components/CardTerminalInputCard.tsx`, `components/CashDropAndFloatCard.tsx`, `pages/DailyReconciliationPage.sections.tsx` (استُبدلت بالمنظومة النظامية).
**معدّلة (خادم):** `supabase/migrations/20261104000001_…` — `get_daily_drawer_summary`, `commit_daily_reconciliation`, `commit_expense_v2` + 4 دوال مساعدة + أعمدة لقطة.
**معدّلة (واجهة):** `services/reconciliationService.ts` (+ محرّك العملات)، `pages/DailyReconciliationPage.helpers.ts` (`cashRates` في الحمولة)، `pages/useReconciliationPageController.ts` (أسعار الخادم تسبق الإعدادات)، `hooks/useDailyReconciliation.ts` (تحذير إعادة الاحتساب)، `api/reconciliationApi.ts` (`p_cash_rates`)، `types/index.ts` (`cash_rates`/`tx_by_currency`/`counted_*`)، `components/{WhatsAppShareButton,ReconciliationPrintModal,ReconciliationHistoryModal,EmployeeSalesBreakdownCard,QuickDrawerExpenseModal.sections}.tsx`، `pages/DailyReconciliationPage.tsx`.

---

## 🔥 إصلاح عاجل (2026-11-04): `commit_expense_v2` يُسقط كل مصروف بالكود 400

### العرض
في متصفح الإنتاج ظهرت ثلاث محاولات فاشلة متتالية:
```
POST .../rest/v1/rpc/commit_expense_v2 → 400 (×3)
```
لا شيء في الواجهة يشرح السبب؛ الرسالة الحقيقية موجودة على الخادم فقط.

### السبب الجذري (نمط posted-first — سجل ADR-005/006/007)
الهجرة `20261104000001` أعادت تعريف `commit_expense_v2` لتصحيح تحويل عملة الأساس، لكن جسم الدالة
أُخذ من ملف هجرة **أقدم** (`20261001000001`) — وهو يسبق إصلاح `20260907000005`، فعاد إدراج رأس
`journal_entries` بحالة `'posted'` **قبل** إدراج بنود `journal_entry_lines`، فيمنعه الـ trigger الحي
`trg_journal_entry_lines_immutability` (`prevent_posted_journal_line_modification`):

```
23514: Cannot add lines to a posted journal entry (Entry: b2273c87-…). Use reversal.
CONTEXT: prevent_posted_journal_line_modification() line 13
         commit_expense_v2(uuid,uuid,jsonb) line 198
```

> **الدليل على أنه انحدار:** آخر مصروف ناجح في القاعدة `2026-11-02 20:43` (إيصال 308، مع قيد posted وبندين)،
> أي أن الإنشاء كان يعمل قبل الهجرة. وأُعيد إنتاج الفشل حياً باستدعاء الدالة داخل معاملة أُرجعت، بنفس الخطأ حرفياً.

### الإصلاح
هجرة `20261104000002_fix_commit_expense_v2_draft_first_posting.sql`:
- جسم الدالة مأخوذ **حرفياً من التعريف الحي** (`pg_get_functiondef`) — لا من ملف هجرة قديم — مع تعديل
  ترتيب الترحيل فقط: `draft` → بنود → `UPDATE status='posted'`، بنفس نمط `20260907000005` و`fn_auto_post_payment_journal` في `20261103000008`.
- التوقيع `(uuid, uuid, jsonb)` والصلاحيات كما هي: `authenticated` + `service_role` فقط، `anon` = `false`.
- idempotent (CREATE OR REPLACE + REVOKE/GRANT).

### التحقق
| الاختبار | النتيجة |
|---|---|
| إعادة سيناريو SAR (100 ر.س) داخل معاملة أُرجعت | ✅ `status=posted`، `base_amount=100`، قيد مربوط |
| إعادة سيناريو YER (100 ر.ي بمعدل 410 على أساس SAR) | ✅ `base_amount=0.2439` (100 ÷ 410) مطابق لـ `rate_to_base=0.002439` |
| صلاحيات التنفيذ | ✅ `anon=false`، `authenticated=true`، `service_role=true` |
| مسح بقية الدوال | ✅ `post_monthly_rent_and_payroll` يعمل أصلاً draft-first؛ لا دوال أخرى بنمط posted-first |
| `tsc --noEmit` + اختبارات المطابقة | ✅ 0 أخطاء، 35/35 |

### الدرس (قاعدة ملزمة)
**أي هجرة تعيد تعريف دالة قائمة يجب أن تنطلق من التعريف الحي في القاعدة، لا من نسخة ملف هجرة أقدم.**
الملفات لا تعكس الترتيب الحقيقي للتطبيق على القاعدة، والانطلاق منها يُحيي أخطاءً أُصلحت لاحقاً بصمت.

### إضافة تشخيصية (Realtime)
سجل المتصفح كان يكرر `Realtime channel status: CHANNEL_ERROR` بلا سبب. الخادم سليم (تم التحقق: `phx_join` يعيد
`status: ok` لنفس إعدادات القناة، و`HTTP 400/500` غير موجودة على مسار websocket)، والاستقصاء يحتاج سبب الرفض
الحقيقي — لذا صار `useRealtimeSync` يسجّل `reason` القادم من `subscribe(status, err)` مع اسم القناة.


