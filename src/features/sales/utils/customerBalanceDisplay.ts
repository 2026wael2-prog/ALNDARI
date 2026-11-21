export interface CurrencyBalanceEntry {
  currency_code: string;
  balance: number;
}

export interface ResolvedCustomerBalance {
  /** هل يوجد أي رصيد غير صفري على العميل (مدين أو دائن) */
  status: 'debt' | 'credit' | 'settled';
  /** الرصيد الأساسي المعروض بعملته الأصلية الحقيقية (أو بعملة الفاتورة إن كان له رصيد بنفس عملة الفاتورة) */
  primaryAmount: number;
  primaryCurrency: string;
  /** هل الرصيد الأساسي هو رصيد أصلي بنفس عملة الفاتورة الحالية؟ */
  matchesInvoiceCurrency: boolean;
  /** المعادل المحوَّل إلى عملة الفاتورة الحالية عندما يختلف رصيد العميل عن عملة الفاتورة */
  convertedEquivalent?: {
    amount: number;
    currency: string;
  } | undefined;
  /** بقية الأرصدة بعملاتها الأصلية (إن كان للعميل أكثر من عملة) */
  otherBalances: CurrencyBalanceEntry[];
  /** جميع الأرصدة غير الصفرية مجمّعة حسب العملة */
  normalizedBalances: CurrencyBalanceEntry[];
}

const EPSILON = 0.005;

/**
 * يحوّل مبلغاً من العملة الأساسية (SAR) إلى العملة المستهدفة باستخدام سعر صرف الفاتورة.
 */
export const convertSarToInvoiceCurrency = (
  amountSar: number,
  targetCurrency: string,
  exchangeRate: number,
  exchangeOperator?: 'multiply' | 'divide'
): number | null => {
  const code = (targetCurrency || 'SAR').toUpperCase().trim();
  if (Math.abs(amountSar) < EPSILON) return 0;
  if (code === 'SAR') return amountSar;
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return null;

  // الريال اليمني: إذا كان السعر > 1 (مثل 430) فالريال السعودي = 430 يمني (ضرب)
  // وإذا كان السعر < 1 (مثل 0.00232) فاليمني = 0.00232 سعودي (قسمة)
  if (code === 'YER') {
    return exchangeRate >= 1 ? amountSar * exchangeRate : amountSar / exchangeRate;
  }

  // العملات الأقوى من الريال (USD/OMR): إذا كان المعامل divide (الأساس = الأجنبي / السعر) نضرب، وإلا نقسم
  if (exchangeOperator === 'divide') {
    return amountSar * exchangeRate;
  }
  return amountSar / exchangeRate;
};

/**
 * يحلّ رصيد العميل السابق بدقة محاسبية عند فتح فاتورة بعملة محددة أو عند تبديل عملة الفاتورة:
 * - لا يُلصق أبداً عملة الفاتورة على رقم يخص عملة أخرى (مثل عرض 200 ر.س كـ 200 ر.ي!).
 * - إذا كان للعميل رصيد بنفس عملة الفاتورة يعرضه مباشرةً بعملته الأصلية (ويتبدّل فوراً بتبدّل العملة).
 * - إذا كان رصيده بعملة أخرى (مثل 200 ر.س والفاتورة بـ YER) يعرض الرصيد بعملته الحقيقية (200 ر.س)
 *   مع المعادل المحوّل تلقائياً إلى عملة الفاتورة الحالية (≈ 86,000 ر.ي).
 */
export const resolveCustomerBalanceForCurrency = (params: {
  baseBalanceSar: number;
  balancesByCurrency: CurrencyBalanceEntry[];
  invoiceCurrency: string;
  exchangeRate?: number | undefined;
  exchangeOperator?: 'multiply' | 'divide' | undefined;
}): ResolvedCustomerBalance => {
  const { baseBalanceSar, balancesByCurrency, invoiceCurrency, exchangeRate = 1, exchangeOperator } =
    params;

  const targetCurr = (invoiceCurrency || 'SAR').toUpperCase().trim();

  // دمج الأرصدة حسب رمز العملة (uppercase) واستبعاد الأصفار
  const map = new Map<string, number>();
  for (const row of balancesByCurrency) {
    const code = (row.currency_code || 'SAR').toUpperCase().trim();
    const val = Number(row.balance) || 0;
    map.set(code, (map.get(code) ?? 0) + val);
  }

  const normalizedBalances: CurrencyBalanceEntry[] = Array.from(map.entries())
    .filter(([, bal]) => Math.abs(bal) >= EPSILON)
    .map(([currency_code, balance]) => ({ currency_code, balance }));

  // إذا كان جدول الأرصدة بالعملات فارغاً لكن يوجد رصيد أساس (SAR) في party_balances
  if (normalizedBalances.length === 0 && Math.abs(baseBalanceSar) >= EPSILON) {
    normalizedBalances.push({ currency_code: 'SAR', balance: baseBalanceSar });
  }

  if (normalizedBalances.length === 0) {
    return {
      status: 'settled',
      primaryAmount: 0,
      primaryCurrency: targetCurr,
      matchesInvoiceCurrency: true,
      otherBalances: [],
      normalizedBalances: [],
    };
  }

  // 1. هل للعميل رصيد أصلي بنفس عملة الفاتورة المختارة؟
  const nativeMatch = normalizedBalances.find(b => b.currency_code === targetCurr);
  if (nativeMatch) {
    const otherBalances = normalizedBalances.filter(b => b.currency_code !== targetCurr);
    return {
      status: nativeMatch.balance > 0 ? 'debt' : 'credit',
      primaryAmount: nativeMatch.balance,
      primaryCurrency: nativeMatch.currency_code,
      matchesInvoiceCurrency: true,
      otherBalances,
      normalizedBalances,
    };
  }

  // 2. لا يوجد رصيد بنفس عملة الفاتورة — نعرض رصيد العملة الأصلية الحقيقية (مع التحويل المعادل لعملة الفاتورة)
  const primaryNative =
    normalizedBalances.find(b => b.currency_code === 'SAR') ?? normalizedBalances[0];
  const otherBalances = normalizedBalances.filter(
    b => b.currency_code !== primaryNative.currency_code
  );

  // حساب المعادل بعملة الفاتورة من الرصيد الأساسي (SAR) إذا توفّر سعر صرف صالح
  let convertedEquivalent: { amount: number; currency: string } | undefined;
  const sourceSar =
    Math.abs(baseBalanceSar) >= EPSILON
      ? baseBalanceSar
      : primaryNative.currency_code === 'SAR'
        ? primaryNative.balance
        : null;

  if (sourceSar !== null) {
    const converted = convertSarToInvoiceCurrency(
      sourceSar,
      targetCurr,
      exchangeRate,
      exchangeOperator
    );
    if (converted !== null && Math.abs(converted) >= EPSILON) {
      convertedEquivalent = {
        amount: Math.round(converted * 100) / 100,
        currency: targetCurr,
      };
    }
  }

  return {
    status: primaryNative.balance > 0 ? 'debt' : 'credit',
    primaryAmount: primaryNative.balance,
    primaryCurrency: primaryNative.currency_code,
    matchesInvoiceCurrency: false,
    convertedEquivalent,
    otherBalances,
    normalizedBalances,
  };
};
