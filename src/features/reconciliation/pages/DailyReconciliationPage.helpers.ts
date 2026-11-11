import type { Dispatch, SetStateAction } from 'react';
import { formatCurrency } from '../../../core/utils';
import {
  currencySymbol,
  reconciliationService,
  resolveSummaryCurrency,
  resolveTolerance,
  roundMoney,
  calculateMultiCurrencyTotal,
  normalizeStoredCashCounts,
  getCurrencyCounts,
  calculateCardVariance,
  hasMixedCurrencySales,
  type CashCountsByCurrency,
  type CurrencyCashRow,
} from '../services/reconciliationService';
import type { CommitDailyReconciliationDTO, DailyDrawerSummary } from '../types';

export type CountMode = 'denominations' | 'quick';

export interface ReconciliationFormValues {
  countMode: CountMode;
  /** عدّ الفئات لكل عملة على حدة — جوهر الجرد المتعدد */
  cashCountsByCurrency: CashCountsByCurrency;
  /** العملة المعروضة في شبكة الفئات */
  activeCurrency: string;
  /** أسعار التحويل المعروضة صراحةً (عملة → معامل نحو الأساس) */
  rates: Record<string, number>;
  manualCashTotal: number;
  actualCard: number;
  /** هل أدخل المستخدم تقرير الماكينة فعلاً؟ (يمنع «المطابقة الوهمية») */
  cardEntered: boolean;
  cardTerminalRef: string;
  floatRetained: number;
  varianceReason: string;
  notes: string;
}

export interface ReconciliationFormApi {
  values: ReconciliationFormValues;
  setCountMode: Dispatch<SetStateAction<CountMode>>;
  setCashCountsByCurrency: Dispatch<SetStateAction<CashCountsByCurrency>>;
  setActiveCurrency: Dispatch<SetStateAction<string>>;
  setRate: (currency: string, rate: number) => void;
  setManualCashTotal: Dispatch<SetStateAction<number>>;
  setActualCard: Dispatch<SetStateAction<number>>;
  setCardEntered: Dispatch<SetStateAction<boolean>>;
  setCardTerminalRef: Dispatch<SetStateAction<string>>;
  setFloatRetained: Dispatch<SetStateAction<number>>;
  setVarianceReason: Dispatch<SetStateAction<string>>;
  setNotes: Dispatch<SetStateAction<string>>;
}

export interface ReconciliationView {
  currency: string;
  currencyLabel: string;
  actualCashCounted: number;
  expectedCash: number;
  cashVarianceInfo: ReturnType<typeof reconciliationService.calculateVariance>;
  salesByCurrency: NonNullable<DailyDrawerSummary['sales_by_currency']>;
  hasMixedCurrencySales: boolean;
  /** صفوف الجرد الفعلي لكل عملة (إجمالي العملة × سعرها) */
  cashRows: CurrencyCashRow[];
  hasForeignCurrencyCounts: boolean;
  /** عملات عُدّت بلا سعر صرف — تمنع الاعتماد */
  missingRateCurrencies: string[];
  tolerance: number;
  /** فارق الشبكة، أو null عندما لم يُدخل تقرير الماكينة بعد */
  cardVariance: number | null;
  expectedCard: number;
  isAlreadyClosed: boolean;
  isOwner: boolean;
  isLocked: boolean;
  cashToOwner: number;
  /** الصافي سالب (الفكة المستبقاة أكبر من الكاش) — حالة مستحيلة يجب حجبها */
  netIsNegative: boolean;
}
/** نفس دلالة الشرط (truthy) في JS للنصوص، مع إرضاء strict-boolean-expressions. */
export const isNonEmptyString = (value: string | null | undefined): value is string =>
  value !== null && value !== undefined && value !== '';

/** بديل مطابق لدلالة `|| ''` على نص قد يكون null من الخادم. */
export const stringOrEmpty = (value: string | null | undefined): string => value ?? '';

/** بديل مطابق لدلالة `??` على رقم قد يكون null من الخادم (بدون شرط ميت). */
export const numberOr = (value: number | null | undefined, fallback: number): number =>
  value ?? fallback;

/** اسم المنشأة المعروض، مع الاسم الافتراضي نفسه المستخدم سابقاً عند الفراغ. */
export const resolveShopName = (companyName: string | null | undefined): string =>
  isNonEmptyString(companyName) ? companyName : 'مؤسسة الجعفري';

export const buildZeroCashConfirmMessage = (currency: string): string =>
  `الكاش الفعلي المدخل هو ${formatCurrency(0, currency)}، هل أنت متأكد من المتابعة؟`;

export interface ExistingReconciliationSync {
  kind: 'existing';
  cashCountsByCurrency: CashCountsByCurrency;
  manualCashTotal: number;
  countMode: CountMode;
  actualCard: number;
  cardEntered: boolean;
  floatRetained: number;
  varianceReason: string;
  notes: string;
}

export interface FreshDaySync {
  kind: 'fresh';
}

export type SummarySyncPlan = ExistingReconciliationSync | FreshDaySync;

/**
 * خطة مزامنة النموذج مع اليومية القائمة — دالة نقية خارج المكوّن.
 *
 * إصلاح جوهري: كانت اليومية الجديدة تملأ «الفعلي» للشبكة بقيمة «المتوقع»
 * (`actualCard: expected_card_terminal`) فتُعلن مطابقة 100% قبل قراءة تقرير
 * الماكينة وتُحفظ `card_variance = 0` كذباً. الآن تبدأ اليومية فارغة دائماً.
 */
export const planSummarySync = (
  summary: DailyDrawerSummary | null | undefined
): SummarySyncPlan | null => {
  if (summary === null || summary === undefined) return null;
  const rec = summary.existing_reconciliation;
  if (rec === null) {
    return { kind: 'fresh' };
  }
  const baseCurrency = resolveSummaryCurrency(summary);
  const countsByCurrency = normalizeStoredCashCounts(rec.cash_denominations, baseCurrency);
  const hasCounts = Object.keys(countsByCurrency).length > 0;
  // الإجمالي المحفوظ هو مصدر الحقيقة؛ والفئات تُستخدم بديلاً للسجلات الناقصة فقط
  const counted =
    rec.actual_cash_counted !== 0
      ? rec.actual_cash_counted
      : reconciliationService.calculateDenominationsTotal(
          getCurrencyCounts(countsByCurrency, baseCurrency)
        );
  const cardActual = numberOr(rec.card_terminal_receipt_total, 0);
  return {
    kind: 'existing',
    cashCountsByCurrency: countsByCurrency,
    manualCashTotal: counted,
    countMode: hasCounts ? 'denominations' : 'quick',
    actualCard: cardActual,
    // اليومية المحفوظة أُدخلت فعلاً إذا وُجد رقم تقرير صريح
    cardEntered: cardActual !== 0,
    floatRetained: numberOr(rec.float_retained_for_tomorrow, 0),
    varianceReason: stringOrEmpty(rec.variance_reason),
    notes: stringOrEmpty(rec.notes),
  };
};

interface SummaryScalars {
  expectedCash: number;
  salesByCurrency: NonNullable<DailyDrawerSummary['sales_by_currency']>;
  isAlreadyClosed: boolean;
  otherSales: number;
}

const deriveSummaryScalars = (summary: DailyDrawerSummary | undefined): SummaryScalars => ({
  expectedCash: summary?.expected_cash_in_drawer ?? 0,
  salesByCurrency: summary?.sales_by_currency ?? [],
  isAlreadyClosed: summary?.is_already_closed ?? false,
  otherSales: summary?.other_sales ?? 0,
});

/** كل القيم المشتقّة المعروضة — دالة نقية خارج المكوّن. */
export const deriveReconciliationView = (
  summary: DailyDrawerSummary | undefined,
  form: ReconciliationFormValues,
  role: string | undefined
): ReconciliationView => {
  const { expectedCash, salesByCurrency, isAlreadyClosed, otherSales } =
    deriveSummaryScalars(summary);
  const currency = summary ? resolveSummaryCurrency(summary) : form.activeCurrency;
  const currencyLabel = currencySymbol(currency);
  const cashResult = calculateMultiCurrencyTotal(
    form.cashCountsByCurrency,
    form.rates,
    currency
  );
  const actualCashCounted =
    form.countMode === 'denominations' ? cashResult.baseTotal : form.manualCashTotal;
  const tolerance = resolveTolerance(summary);
  const cashVarianceInfo = reconciliationService.calculateVariance(
    actualCashCounted,
    expectedCash,
    tolerance
  );
  const hasMixedCurrencySalesFlag = hasMixedCurrencySales(salesByCurrency, currency, otherSales);
  const expectedCard = summary?.expected_card_terminal ?? 0;
  const cardVariance = calculateCardVariance(form.actualCard, expectedCard, form.cardEntered);
  const isOwner = role === 'owner';
  const isLocked = isAlreadyClosed && !isOwner;
  const cashToOwner = roundMoney(actualCashCounted - form.floatRetained);
  // صفوف العملات وأسعارها تخصّ وضع تفقيط الفئات فقط (الإدخال السريع رقم أساس واحد)
  return {
    currency,
    currencyLabel,
    actualCashCounted,
    expectedCash,
    cashVarianceInfo,
    salesByCurrency,
    hasMixedCurrencySales: hasMixedCurrencySalesFlag,
    cashRows: form.countMode === 'denominations' ? cashResult.rows : [],
    hasForeignCurrencyCounts: form.countMode === 'denominations' && cashResult.hasForeignCurrency,
    missingRateCurrencies: form.countMode === 'denominations' ? cashResult.missingRates : [],
    tolerance,
    cardVariance,
    expectedCard,
    isAlreadyClosed,
    isOwner,
    isLocked,
    cashToOwner,
    netIsNegative: cashToOwner < 0,
  };
};

export interface CommitPayloadInput {
  branchId: string | null | undefined;
  summary: DailyDrawerSummary | undefined;
  actualCashCounted: number;
  countMode: CountMode;
  cashCountsByCurrency: CashCountsByCurrency;
  /** أسعار الصرف الظاهرة للمستخدم — تُرسل ليحوّل الخادم الفئات بنفس السعر */
  cashRates: Record<string, number>;
  actualCard: number;
  floatRetained: number;
  cashToOwner: number;
  varianceReason: string;
  notes: string;
}

export const buildCommitPayload = (
  companyId: string,
  date: string,
  input: CommitPayloadInput
): CommitDailyReconciliationDTO => ({
  company_id: companyId,
  date,
  branch_id: input.branchId,
  opening_float: input.summary?.opening_float ?? 0,
  actual_cash_counted: input.actualCashCounted,
  /**
   * الفئات تُحفظ دائماً بالشكل المتداخل (عملة → فئة → عدد) حتى في الإدخال السريع
   * بالفئات الفارغة؛ لأنه كان يُحفظ `{}` فيضيع أثر الجرد تماماً في مستند مالي.
   */
  cash_denominations:
    input.countMode === 'denominations' ? input.cashCountsByCurrency : {},
  /**
   * الأسعار تُرسل دائماً: الخادم يحوّل الفئات بنفس ما رآه المستخدم بدل رقم
   * مجاميع محسوب في الواجهة يمكن أن يخالف المستند المحفوظ.
   */
  cash_rates: input.cashRates,
  card_terminal_receipt_total: input.actualCard,
  float_retained_for_tomorrow: input.floatRetained,
  cash_handed_to_owner: input.cashToOwner,
  variance_reason: input.varianceReason,
  notes: input.notes,
});

/**
 * حواجز الاعتماد المحلية — تُجمع كلها في رسالة واحدة واضحة بدل رحلة خادم مرفوضة:
 *   1. مبرر الفارق إلزامي خارج حد التسامح (كاش أو شبكة) — شرط الخادم نفسه.
 *   2. صافي سالب (الفكة أكبر من الكاش) حالة مستحيلة.
 *   3. عملات عُدّت بلا سعر صرف → تحويلها صفر يفسد المقارنة.
 */
export const collectCommitBlockers = (input: {
  view: ReconciliationView;
  varianceReason: string;
}): string[] => {
  const { view, varianceReason } = input;
  const blockers: string[] = [];

  if (view.netIsNegative) {
    blockers.push(
      `الصافي المسلم للمالك سالب (${formatCurrency(view.cashToOwner, view.currency)}): الفكة المستبقاة أكبر من الكاش المعدود`
    );
  }

  if (view.missingRateCurrencies.length > 0) {
    blockers.push(
      `لا يوجد سعر صرف صالح للعملات: ${view.missingRateCurrencies.join('، ')} — اضبط السعر قبل الاعتماد`
    );
  }

  const cardOutsideTolerance =
    view.cardVariance !== null && Math.abs(view.cardVariance) > view.tolerance;
  const cashOutsideTolerance = !view.cashVarianceInfo.isWithinTolerance;

  if ((cashOutsideTolerance || cardOutsideTolerance) && varianceReason.trim().length === 0) {
    blockers.push(
      'مبرر الفارق إلزامي: الفارق يتجاوز حد التسامح المسموح، اكتب السبب قبل اعتماد الإقفال'
    );
  }

  return blockers;
};

export interface ReconciliationModalsApi {
  isExpenseModalOpen: boolean;
  isPrintModalOpen: boolean;
  isHistoryModalOpen: boolean;
  openExpenseModal: () => void;
  closeExpenseModal: () => void;
  openPrintModal: () => void;
  closePrintModal: () => void;
  openHistoryModal: () => void;
  closeHistoryModal: () => void;
}

