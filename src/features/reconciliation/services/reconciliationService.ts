import type { CashCountsByCurrency, CashDenominationCounts, DailyDrawerSummary } from '../types';

export type { CashCountsByCurrency };
import { CURRENCY_SYMBOLS } from '../../../core/utils';

/**
 * فئات النقد لكل عملة — بيانات لا كود مثبّت على عملة واحدة.
 *
 * إصلاح جذري: كانت الفئات السعودية (500…0.5) تُعرض لأي عملة بمجرد تغيير الرمز،
 * فلا يمكن جرد ورقة 1000 ر.ي أو 250 ر.ي أو عملة 0.25$ في درج حقيقي.
 */
export const DENOMINATIONS_BY_CURRENCY: Record<string, readonly number[]> = {
  SAR: [500, 200, 100, 50, 20, 10, 5, 1, 0.5],
  YER: [1000, 500, 250, 200, 100, 50, 20, 10, 5],
  USD: [100, 50, 20, 10, 5, 2, 1, 0.5, 0.25],
  OMR: [50, 20, 10, 5, 1, 0.5, 0.25, 0.1, 0.05],
  AED: [1000, 500, 200, 100, 50, 20, 10, 5, 1],
  QAR: [500, 200, 100, 50, 20, 10, 5, 1],
  KWD: [20, 10, 5, 1, 0.5, 0.25, 0.1, 0.05],
  BHD: [20, 10, 5, 1, 0.5, 0.25, 0.1, 0.05],
  EGP: [200, 100, 50, 20, 10, 5, 1, 0.5, 0.25],
  CNY: [100, 50, 20, 10, 5, 1, 0.5],
};

/** فئات احتياطية لأي عملة غير معروفة (قابلة للتعديل لكل عملة أعلاه). */
export const FALLBACK_DENOMINATIONS = [1000, 500, 100, 50, 20, 10, 5, 1] as const;

/**
 * عمولات حد التسامح الافتراضية لكل عملة أساس (تُستخدم فقط إذا لم يُرسل الخادم حداً).
 * القيمة 10 وحدات لا معنى لها في YER (≈ 0.03 ر.س) ولا في KWD (≈ 120 ر.س).
 */
export const DEFAULT_TOLERANCE_BY_CURRENCY: Record<string, number> = {
  YER: 500,
  SAR: 10,
  USD: 3,
  OMR: 1,
  KWD: 1,
  BHD: 1,
  AED: 20,
  QAR: 20,
  EGP: 25,
  CNY: 10,
};

/** الحد الافتراضي المتوافق خلفياً (اختبارات/عملات غير مسجّلة). */
export const DEFAULT_TOLERANCE_SAR = 10;

/** فئات العملة السعودية — يبقى مُصدَّراً للتوافق مع أي استيراد قائم. */
export const STANDARD_DENOMINATIONS = (DENOMINATIONS_BY_CURRENCY.SAR ?? FALLBACK_DENOMINATIONS).map(
  value => ({ value, label: `${String(value)} ر.س` })
);

/** توحيد رمز العملة (حروف كبيرة بلا فراغات) مع بديل آمن. */
export const normalizeCurrencyCode = (
  currencyCode?: string | null,
  fallback = 'SAR'
): string => {
  const code = (currencyCode ?? '').toUpperCase().trim();
  return code === '' ? fallback : code;
};

/** حد التسامح الافتراضي المناسب لعملة الأساس. */
export const defaultToleranceFor = (currencyCode?: string | null): number => {
  const code = normalizeCurrencyCode(currencyCode);
  return DEFAULT_TOLERANCE_BY_CURRENCY[code] ?? DEFAULT_TOLERANCE_SAR;
};


/**
 * رمز العملة المعروض — يعود إلى كود العملة نفسه إذا لم يوجد رمز معروف
 * (تفادي فرض رمز الريال السعودي على منشآت تعمل بالريال اليمني).
 */
export const currencySymbol = (currencyCode?: string | null): string => {
  const code = normalizeCurrencyCode(currencyCode);
  return CURRENCY_SYMBOLS[code] || code;
};

/**
 * عملة الملخص الأساسية كما حسبها الخادم (مصدر الحقيقة)، مع توافق خلفي لـ SAR.
 */
export const resolveSummaryCurrency = (summary: DailyDrawerSummary): string =>
  normalizeCurrencyCode(summary.base_currency || summary.currency);

/**
 * فئات النقد الفعلية لكل عملة (بدل تثبيت الفئات السعودية على كل العملات).
 * تسمية كل فئة برمز عملتها، والقيمة الرقمية تُستخدم مفتاحاً في العدّادات.
 */
export const getDenominationsFor = (
  currencyCode?: string | null
): Array<{ value: number; label: string }> => {
  const code = normalizeCurrencyCode(currencyCode);
  const symbol = currencySymbol(code);
  const values = DENOMINATIONS_BY_CURRENCY[code] ?? FALLBACK_DENOMINATIONS;
  return values.map(value => ({ value, label: `${String(value)} ${symbol}` }));
};

/**
 * حد التسامح المعتمد: من الخادم إن أرسله، وإلا الحد الافتراضي.
 */
export const resolveTolerance = (summary?: DailyDrawerSummary | null): number => {
  const fallback = defaultToleranceFor(summary ? resolveSummaryCurrency(summary) : null);
  const serverTolerance = summary?.variance_tolerance;
  if (serverTolerance === null || serverTolerance === undefined) return fallback;
  const isUsableTolerance = Number.isFinite(serverTolerance) && serverTolerance >= 0;
  return isUsableTolerance ? serverTolerance : fallback;
};

/**
 * قراءة عدّاد فئة نقدية واحدة بأمان — المفتاح ديناميكي (Record) لذا يُعزل الوصول
 * إليه هنا في طبقة الخدمة بدل الوصول المباشر بالمؤشر داخل مكوّنات الواجهة.
 */
export const getDenominationCount = (
  counts: CashDenominationCounts,
  denominationKey: string
): number => {
  const count = counts[denominationKey];
  return Number.isFinite(count) ? count : 0;
};

/** تقريب نقدي موحّد (قرشان) لتفادي فروق الفاصلة العائمة. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** مجموع فئات خريطة واحدة (بلا تحويل عملة). */
export const calculateDenominationSum = (counts: CashDenominationCounts): number => {
  let total = 0;
  for (const [denomStr, count] of Object.entries(counts)) {
    const denom = Number.parseFloat(denomStr);
    const qty = Number.isFinite(count) ? count : 0;
    if (!Number.isNaN(denom) && qty > 0) {
      total += denom * qty;
    }
  }
  return roundMoney(total);
};

/** خريطة عدّ الفئات لكل عملة: { YER: { '1000': 5 }, SAR: { '100': 3 } }. */

export interface BaseConversionInput {
  amount: number;
  currency: string;
  baseCurrency: string;
  rate: number;
  operator?: 'multiply' | 'divide' | undefined;
}

/**
 * تحويل مبلغ إلى عملة الأساس بنفس منطق `fn_to_base_amount` في قاعدة البيانات:
 * - العملة = الأساس → كما هي.
 * - معامل القسمة (YER افتراضياً) → القسمة، وباقي العملات → الضرب.
 * - معدل مخزّن مقلوباً (< 1، مثل 0.002439 = 1/410) → الضرب.
 */
export const convertAmountToBase = (input: BaseConversionInput): number => {
  const { amount, rate } = input;
  if (!Number.isFinite(amount) || amount === 0) return 0;
  const currency = normalizeCurrencyCode(input.currency);
  const baseCurrency = normalizeCurrencyCode(input.baseCurrency);
  if (currency === baseCurrency) return roundMoney(amount);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  if (rate < 1) return roundMoney(amount * rate);
  const operator = input.operator ?? (currency === 'YER' ? 'divide' : 'multiply');
  return roundMoney(operator === 'divide' ? amount / rate : amount * rate);
};

/** سطر عملة واحد في ملخّص الجرد. */
export interface CurrencyCashRow {
  currency: string;
  rate: number;
  /** إجمالي العملة بفئاتها كما عُدّت فعلياً (بلا تحويل) */
  total: number;
  /** المعادل بعملة المنشأة الأساسية */
  baseTotal: number;
}

export interface MultiCurrencyCashResult {
  rows: CurrencyCashRow[];
  /** إجمالي الدرج بعملة الأساس — هو ما يُقارن بالمتوقع */
  baseTotal: number;
  hasForeignCurrency: boolean;
  /** عملات عُدّت بلا سعر صرف صالح — يمنع الاعتماد حتى تُضبط */
  missingRates: string[];
}

/** ملخّص جرد متعدد العملات: كل عملة بإجماليها، والأساس محسوب بأسعار ظاهرة. */
export const calculateMultiCurrencyTotal = (
  countsByCurrency: CashCountsByCurrency | null | undefined,
  rates: Record<string, number> | null | undefined,
  baseCurrency?: string | null
): MultiCurrencyCashResult => {
  const base = normalizeCurrencyCode(baseCurrency);
  const rows: CurrencyCashRow[] = [];
  const missingRates: string[] = [];

  Object.entries(countsByCurrency ?? {}).forEach(([rawCurrency, counts]) => {
    const currency = normalizeCurrencyCode(rawCurrency, base);
    const total = calculateDenominationSum(counts ?? {});
    if (total === 0) return;
    const rawRate = rates?.[currency] ?? (currency === base ? 1 : 0);
    const rate = Number.isFinite(rawRate) && rawRate > 0 ? rawRate : 0;
    if (currency !== base && rate === 0) missingRates.push(currency);
    rows.push({
      currency,
      rate,
      total,
      baseTotal: convertAmountToBase({ amount: total, currency, baseCurrency: base, rate }),
    });
  });

  rows.sort((first, second) => {
    if (first.currency === base) return -1;
    if (second.currency === base) return 1;
    return second.baseTotal - first.baseTotal;
  });

  return {
    rows,
    baseTotal: roundMoney(rows.reduce((sum, row) => sum + row.baseTotal, 0)),
    hasForeignCurrency: rows.some(row => row.currency !== base),
    missingRates,
  };
};

/** هل الشكل المحفوظ متداخل بعملات أم مسطّحاً (سجلات ما قبل الترقية)؟ */
export const isNestedCashCounts = (raw: unknown): raw is CashCountsByCurrency => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const values = Object.values(raw as Record<string, unknown>);
  return (
    values.length > 0 &&
    values.every(value => value !== null && typeof value === 'object' && !Array.isArray(value))
  );
};

/** تطهير أعداد الفئات: أعداد صحيحة موجبة فقط. */
export const sanitizeCounts = (counts: unknown): CashDenominationCounts => {
  const cleaned: CashDenominationCounts = {};
  if (counts === null || typeof counts !== 'object' || Array.isArray(counts)) return cleaned;
  Object.entries(counts as Record<string, unknown>).forEach(([key, value]) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      cleaned[key] = Math.floor(numeric);
    }
  });
  return cleaned;
};

/** قراءة الفئات المحفوظة بأي من الشكلين (مسطّح قديم / متداخل جديد) بأمان. */
export const normalizeStoredCashCounts = (
  raw: unknown,
  baseCurrency?: string | null
): CashCountsByCurrency => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  if (isNestedCashCounts(raw)) {
    const nested: CashCountsByCurrency = {};
    Object.entries(raw).forEach(([currency, counts]) => {
      const sanitized = sanitizeCounts(counts);
      if (Object.keys(sanitized).length > 0) nested[normalizeCurrencyCode(currency)] = sanitized;
    });
    return nested;
  }
  const flat = sanitizeCounts(raw);
  if (Object.keys(flat).length === 0) return {};
  return { [normalizeCurrencyCode(baseCurrency)]: flat };
};

/**
 * قراءة فئات عملة محددة بأمان — الوصول بمفتاح ديناميكي معزول هنا في طبقة الخدمة
 * بدل المكوّنات (نفس نمط `getDenominationCount`).
 */
export const getCurrencyCounts = (
  countsByCurrency: CashCountsByCurrency | null | undefined,
  currency: string
): CashDenominationCounts => {
  if (countsByCurrency === null || countsByCurrency === undefined) return {};
  const counts = countsByCurrency[normalizeCurrencyCode(currency)];
  return counts ?? {};
};

/** سعر الصرف الفعّال لعملة: الأساس 1 دائماً، وغير المعروف 0. */
export const resolveEffectiveRate = (
  rates: Record<string, number> | null | undefined,
  currency: string,
  baseCurrency: string
): number => {
  const code = normalizeCurrencyCode(currency);
  if (code === normalizeCurrencyCode(baseCurrency)) return 1;
  const rate = rates?.[code];
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : 0;
};

/**
 * تحديث عدّ فئة واحدة بشكل غير مُدمِّر (بلا delete على مفاتيح ديناميكية):
 * الفئة التي تصل إلى صفر تُحذف من الخريطة، والعملة التي تفرغ تُحذف كذلك.
 */
export const setDenominationCount = (
  countsByCurrency: CashCountsByCurrency,
  currency: string,
  denomination: string,
  count: number
): CashCountsByCurrency => {
  const code = normalizeCurrencyCode(currency);
  const currentCounts = getCurrencyCounts(countsByCurrency, code);
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;

  const nextCurrencyEntries = Object.entries(currentCounts)
    .filter(([key]) => key !== denomination)
    .concat(safeCount > 0 ? [[denomination, safeCount] as [string, number]] : []);

  const nextEntries: Array<[string, unknown]> = Object.entries(countsByCurrency)
    .filter(([key]) => key !== code)
    .concat(
      nextCurrencyEntries.length > 0
        ? [[code, Object.fromEntries(nextCurrencyEntries)]]
        : []
    );

  return Object.fromEntries(nextEntries) as CashCountsByCurrency;
};

/** هل مبيعات اليوم صادرة بأكثر من عملة (أو بطرق دفع غير مصنّفة)؟ */
export const hasMixedCurrencySales = (
  rows: NonNullable<DailyDrawerSummary['sales_by_currency']>,
  baseCurrency: string,
  otherSales: number
): boolean =>
  rows.some(row => row.currency_code.toUpperCase() !== baseCurrency) || otherSales > 0;

/**
 * فارق الشبكة — لا يُحتسب قبل إدخال تقرير الماكينة (null = لم يُدخل).
 */
export const calculateCardVariance = (
  actualCard: number,
  expectedCard: number,
  isEntered: boolean
): number | null => (isEntered ? roundMoney(actualCard - expectedCard) : null);

/** مقترحات فكة الغد بمقياس عملة الأساس (لا 200/300/500 في YER). */
export const suggestFloatPresets = (baseCurrency?: string | null): number[] => {
  const code = normalizeCurrencyCode(baseCurrency);
  if (code === 'YER') return [10000, 20000, 50000];
  if (code === 'USD') return [100, 200, 500];
  if (code === 'KWD' || code === 'BHD' || code === 'OMR') return [10, 20, 50];
  if (code === 'AED' || code === 'QAR' || code === 'EGP') return [200, 500, 1000];
  return [200, 300, 500];
};

/** الفكة الافتراضية المقترحة لعملة الأساس. */
export const defaultFloatFor = (baseCurrency?: string | null): number => {
  const code = normalizeCurrencyCode(baseCurrency);
  if (code === 'YER') return 20000;
  if (code === 'USD') return 200;
  if (code === 'KWD' || code === 'BHD' || code === 'OMR') return 20;
  if (code === 'AED' || code === 'QAR' || code === 'EGP') return 300;
  return 300;
};

/** مدخلات صياغة رسالة الواتساب (كائن واحد بدل وسائط متفرقة) */
export interface WhatsAppSummaryInput {
  actualCash: number;
  actualCard: number;
  floatRetained: number;
  cashToOwner: number;
  shopName?: string | undefined;
  /** تفصيل الجرد الفعلي حسب العملة (اختياري — يُضاف سطر لكل عملة عند وجوده) */
  cashBreakdown?: CurrencyCashRow[] | undefined;
}

export const reconciliationService = {
  /**
   * حساب إجمالي النقدية من الفئات المعدودة
   */
  calculateDenominationsTotal: calculateDenominationSum,

  /**
   * حساب الفارق بين الفعلي والمتوقع مع فحص حد التسامح
   */
  calculateVariance: (
    actual: number,
    expected: number,
    tolerance = DEFAULT_TOLERANCE_SAR
  ): {
    variance: number;
    status: 'balanced' | 'surplus' | 'shortage';
    isWithinTolerance: boolean;
  } => {
    const safeActual = Number.isFinite(actual) ? actual : 0;
    const safeExpected = Number.isFinite(expected) ? expected : 0;
    const variance = Math.round((safeActual - safeExpected) * 100) / 100;
    const absVariance = Math.abs(variance);
    const isWithinTolerance = absVariance <= tolerance;

    if (absVariance === 0) {
      return { variance: 0, status: 'balanced', isWithinTolerance: true };
    }
    if (variance > 0) {
      return { variance, status: 'surplus', isWithinTolerance };
    }
    return { variance, status: 'shortage', isWithinTolerance };
  },

  /**
   * صياغة رسالة الواتساب اليومية المنسقة للمالك
   *
   * كل المبالغ قادمة من الخادم بعملة المنشأة الأساسية (base_currency)، لذا تُعرض
   * برمز تلك العملة بدل تثبيت «ر.س» على منشآت تعمل بالريال اليمني.
   */
  formatWhatsAppSummary: (summary: DailyDrawerSummary, input: WhatsAppSummaryInput): string => {
    const { actualCash, actualCard, floatRetained, cashToOwner, shopName = 'المحل' } = input;
    const sym = currencySymbol(resolveSummaryCurrency(summary));
    const cashVariance = Math.round((actualCash - summary.expected_cash_in_drawer) * 100) / 100;
    const cardVariance = Math.round((actualCard - summary.expected_card_terminal) * 100) / 100;
    const otherSales = summary.other_sales ?? 0;
    const cardReceipts = summary.card_receipts ?? 0;

    // تفصيل الجرد الفعلي حسب العملة — شفافية العملات في الإشعار
    const cashBreakdownLines = (input.cashBreakdown ?? [])
      .filter(row => row.total > 0)
      .map(row => {
        const isBase = normalizeCurrencyCode(row.currency) === resolveSummaryCurrency(summary);
        return isBase
          ? ` • ${row.currency}: ${row.total.toFixed(2)} ${currencySymbol(row.currency)}`
          : ` • ${row.currency}: ${row.total.toFixed(2)} ${currencySymbol(row.currency)} ≈ ${row.baseTotal.toFixed(2)} ${sym}`;
      });

    let cashVarianceText = 'متطابق تماماً ✓ (0.00)';
    if (cashVariance > 0) {
      cashVarianceText = `زيادة +${cashVariance.toFixed(2)} ${sym} ⚠️`;
    } else if (cashVariance < 0) {
      cashVarianceText = `عجز ${cashVariance.toFixed(2)} ${sym} ❌`;
    }

    const employeeLines = (summary.employee_breakdown || [])
      .map(
        emp =>
          ` • ${emp.employee_name}: ${emp.total_sales.toFixed(2)} ${sym} (${emp.invoice_count} فاتورة)`
      )
      .join('\n');

    // تفصيل العملات — فقط عندما تكون الفواتير صادرة بأكثر من عملة (شفافية المبالغ الخام)
    const byCurrency = summary.sales_by_currency || [];
    const currencyLines =
      byCurrency.length > 1
        ? byCurrency
            .map(row => {
              const isBase = row.currency_code.toUpperCase() === resolveSummaryCurrency(summary);
              return isBase
                ? ` • ${row.currency_code}: ${row.raw_total.toFixed(2)} (${row.invoice_count} فاتورة)`
                : ` • ${row.currency_code}: ${row.raw_total.toFixed(2)} = ${row.base_total.toFixed(2)} ${sym}`;
            })
            .join('\n')
        : '';

    return [
      `📊 *إقفال يومية ${shopName}*`,
      `📅 *التاريخ:* ${summary.date}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `👥 *مبيعات الموظفين:*`,
      employeeLines || ' • لا توجد مبيعات مسجلة اليوم',
      currencyLines ? `--------------------\n💱 *تفصيل العملات:*\n${currencyLines}` : null,
      `--------------------`,
      `💰 *إجمالي مبيعات اليوم:* ${summary.total_sales.toFixed(2)} ${sym}`,
      `💳 *عمليات الشبكة (مدى):* ${summary.card_sales.toFixed(2)} ${sym} ${Math.abs(cardVariance) === 0 ? '[مطابق ✓]' : `[فارق: ${cardVariance.toFixed(2)}]`}`,
      `💵 *كاش المبيعات:* ${summary.cash_sales.toFixed(2)} ${sym}`,
      summary.transfer_sales > 0
        ? `🏦 *مبيعات تحويل بنكي:* ${summary.transfer_sales.toFixed(2)} ${sym}`
        : null,
      summary.credit_sales && summary.credit_sales > 0
        ? `📋 *مبيعات آجلة (ذمم):* ${summary.credit_sales.toFixed(2)} ${sym}`
        : null,
      otherSales > 0 ? `🧾 *مبيعات بطرق دفع أخرى:* ${otherSales.toFixed(2)} ${sym}` : null,
      summary.cash_receipts && summary.cash_receipts > 0
        ? `📥 *سندات قبض نقدية:* +${summary.cash_receipts.toFixed(2)} ${sym}`
        : null,
      summary.cash_disbursements && summary.cash_disbursements > 0
        ? `📤 *سندات صرف نقدية:* -${summary.cash_disbursements.toFixed(2)} ${sym}`
        : null,
      cardReceipts > 0 ? `🏧 *تحصيلات شبكة:* +${cardReceipts.toFixed(2)} ${sym}` : null,
      summary.returns_cash > 0
        ? `↩️ *مرتجع نقدي:* -${summary.returns_cash.toFixed(2)} ${sym}`
        : null,
      summary.returns_card > 0
        ? `↩️ *مرتجع شبكة:* -${summary.returns_card.toFixed(2)} ${sym}`
        : null,
      summary.petty_expenses_cash > 0
        ? `☕ *مصروفات من الدرج:* -${summary.petty_expenses_cash.toFixed(2)} ${sym}`
        : null,
      summary.opening_float > 0
        ? `🪙 *عهدة الفكة الافتتاحية:* +${summary.opening_float.toFixed(2)} ${sym}`
        : null,
      `--------------------`,
      `🎯 *الكاش المطلوب في الدرج:* ${summary.expected_cash_in_drawer.toFixed(2)} ${sym}`,
      `📥 *الكاش الفعلي الموجود:* ${actualCash.toFixed(2)} ${sym}`,
      ...(cashBreakdownLines.length > 0
        ? ['💵 *تفصيل الجرد حسب العملة:*', ...cashBreakdownLines]
        : []),
      `⚖️ *حالة الدرج:* ${cashVarianceText}`,
      `--------------------`,
      `🔒 *المتبقي بالدرج لبكرة (فكة):* ${floatRetained.toFixed(2)} ${sym}`,
      `💼 *الصافي المسلم للمالك:* ${cashToOwner.toFixed(2)} ${sym}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `تم الإقفال بنجاح عبر نظام الجعفري Smart ERP`,
    ]
      .filter(Boolean)
      .join('\n');
  },
};
