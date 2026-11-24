/**
 * حارس تخصيص مبلغ السند على الفاتورة (واجهة العميل).
 *
 * الخادم هو المرجع النهائي: `create_financial_bond` يقرأ المتبقي تحت `FOR UPDATE`
 * ويرفض أي تخصيص يتجاوز `total_amount - paid_amount` برسالة عربية، لمنع خرق القيد
 * `chk_invoices_paid_not_exceed_total` (23514). هذه الدوال تعطي نفس الحماية قبل
 * إرسال الطلب حتى لا يرى المستخدم خطأ قاعدة بيانات بعد انتظار الشبكة.
 */

/** هامش تقارب مطابق للقيد المحاسبي (0.01). */
export const INVOICE_AMOUNT_EPSILON = 0.01;

/** العملة الأساسية التي يُرحَّل بها سند العمولة/الخصم (انظر bondsApi.createPaymentRPC). */
const COMMISSION_BASE_CURRENCY = 'SAR';

export interface RequestedAllocationInput {
  /** مبلغ السند الرئيسي بعملة الفاتورة. */
  mainAmount: number;
  /** مبلغ العمولة/الخصم (يُخصَّص على نفس الفاتورة في سند مستقل). */
  commissionAmount?: number | null | undefined;
  /** عملة السند المختارة. */
  currencyCode?: string | null | undefined;
}

export interface InvoiceDocumentAmountsInput {
  total_amount?: number | string | null | undefined;
  paid_amount?: number | string | null | undefined;
  total_document_amount?: number | string | null | undefined;
  currency_code?: string | null | undefined;
  currency?: string | null | undefined;
  exchange_rate?: number | string | null | undefined;
  invoice_items?: Array<{
    total?: number | string | null;
    quantity?: number | string | null;
    unit_price?: number | string | null;
  }> | null;
}

export interface ResolvedInvoiceDocumentAmounts {
  currency: string;
  isForeign: boolean;
  baseTotal: number;
  basePaid: number;
  baseRemaining: number;
  docTotal: number;
  docPaid: number;
  docRemaining: number;
  /** سعر الصرف المعروض (مثل 425 للريال اليمني، و 1 للريال السعودي) */
  displayRate: number;
  isPartial: boolean;
}

export type InvoiceSettlementMode =
  | 'none'
  | 'currency_mismatch'
  | 'over_remaining'
  | 'partial'
  | 'full';

export interface InvoiceSettlementEvaluation {
  mode: InvoiceSettlementMode;
  enteredAmount: number;
  remainingBefore: number;
  remainingAfter: number;
  /** نسبة السداد من كامل الفاتورة بعد تطبيق هذه الدفعة (0..100) */
  newPaidPercent: number;
  invoiceCurrency: string;
  bondCurrency: string;
}

function toFinite(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * يستخرج مبالغ الفاتورة بدقة في العملة الأساسية (SAR) وعملة المستند الأصلية (مثل YER/SAR)،
 * بحيث لا يُقارن مبلغ بالريال اليمني ضد متبقٍ بالريال السعودي أبداً.
 */
export function resolveInvoiceDocumentAmounts(
  inv: InvoiceDocumentAmountsInput
): ResolvedInvoiceDocumentAmounts {
  const baseTotal = Math.max(0, Math.round((Number(inv.total_amount) || 0) * 100) / 100);
  const basePaid = Math.max(0, Math.round((Number(inv.paid_amount) || 0) * 100) / 100);
  const baseRemaining = Math.max(0, Math.round((baseTotal - basePaid) * 100) / 100);
  const currency = String(inv.currency_code || inv.currency || 'SAR')
    .toUpperCase()
    .trim();
  const isForeign = currency !== 'SAR';
  const rawRate = Number(inv.exchange_rate) || 0;

  const explicitDocTotal = Number(inv.total_document_amount) || 0;
  const itemsSum = Array.isArray(inv.invoice_items)
    ? inv.invoice_items.reduce(
        (sum, it) =>
          sum + Number(it.total || (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) || 0),
        0
      )
    : 0;

  let docTotal = baseTotal;
  if (isForeign) {
    if (explicitDocTotal > 0) {
      docTotal = Math.round(explicitDocTotal * 100) / 100;
    } else if (itemsSum > baseTotal * 5) {
      docTotal = Math.round(itemsSum * 100) / 100;
    } else if (rawRate > 0 && rawRate < 1) {
      docTotal = Math.round(baseTotal / rawRate);
    } else if (rawRate > 1 && currency === 'YER') {
      docTotal = Math.round(baseTotal * rawRate);
    }
  }

  let displayRate = 1;
  if (isForeign) {
    if (currency === 'YER') {
      if (rawRate > 0 && rawRate < 1) {
        displayRate = Math.round(1 / rawRate);
      } else if (rawRate > 1) {
        displayRate = rawRate;
      } else if (baseTotal > 0 && docTotal > baseTotal) {
        displayRate = Math.round(docTotal / baseTotal);
      } else {
        displayRate = 425;
      }
    } else {
      displayRate = rawRate > 0 ? rawRate : 1;
    }
  }

  const docPaid = !isForeign
    ? basePaid
    : basePaid <= 0
      ? 0
      : baseTotal > 0 && docTotal > 0
        ? Math.min(docTotal, Math.round((basePaid / baseTotal) * docTotal))
        : rawRate > 0 && rawRate < 1
          ? Math.round(basePaid / rawRate)
          : basePaid;

  const docRemaining = !isForeign
    ? baseRemaining
    : Math.max(0, Math.round((docTotal - docPaid) * 100) / 100);

  return {
    currency,
    isForeign,
    baseTotal,
    basePaid,
    baseRemaining,
    docTotal,
    docPaid,
    docRemaining,
    displayRate,
    isPartial: basePaid > INVOICE_AMOUNT_EPSILON && baseRemaining > INVOICE_AMOUNT_EPSILON,
  };
}

/**
 * يقيّم أثر مبلغ السند الحالي على الفاتورة المحددة (سداد جزئي / كامل / تجاوز / اختلاف عملة).
 */
export function evaluateInvoiceSettlement(params: {
  enteredAmount: number;
  docTotal: number;
  docPaid: number;
  docRemaining: number;
  invoiceCurrency: string;
  bondCurrency: string;
}): InvoiceSettlementEvaluation {
  const safeEntered = toFinite(params.enteredAmount);
  const safeRemaining = Math.max(0, toFinite(params.docRemaining));
  const safeTotal = Math.max(0, toFinite(params.docTotal));
  const safePaid = Math.max(0, toFinite(params.docPaid));
  const invCur = (params.invoiceCurrency || 'SAR').toUpperCase().trim();
  const bondCur = (params.bondCurrency || 'SAR').toUpperCase().trim();

  if (invCur !== bondCur) {
    return {
      mode: 'currency_mismatch',
      enteredAmount: safeEntered,
      remainingBefore: safeRemaining,
      remainingAfter: safeRemaining,
      newPaidPercent: safeTotal > 0 ? Math.min(100, Math.round((safePaid / safeTotal) * 100)) : 0,
      invoiceCurrency: invCur,
      bondCurrency: bondCur,
    };
  }

  if (safeEntered <= 0) {
    return {
      mode: 'none',
      enteredAmount: 0,
      remainingBefore: safeRemaining,
      remainingAfter: safeRemaining,
      newPaidPercent: safeTotal > 0 ? Math.min(100, Math.round((safePaid / safeTotal) * 100)) : 0,
      invoiceCurrency: invCur,
      bondCurrency: bondCur,
    };
  }

  if (exceedsInvoiceRemaining(safeEntered, safeRemaining)) {
    return {
      mode: 'over_remaining',
      enteredAmount: safeEntered,
      remainingBefore: safeRemaining,
      remainingAfter: 0,
      newPaidPercent: 100,
      invoiceCurrency: invCur,
      bondCurrency: bondCur,
    };
  }

  const remainingAfter = Math.max(0, Math.round((safeRemaining - safeEntered) * 100) / 100);
  const isFull = remainingAfter <= INVOICE_AMOUNT_EPSILON;
  const newPaid = Math.min(safeTotal, safePaid + safeEntered);
  const newPaidPercent =
    safeTotal > 0 ? Math.min(100, Math.round((newPaid / safeTotal) * 100)) : isFull ? 100 : 0;

  return {
    mode: isFull ? 'full' : 'partial',
    enteredAmount: safeEntered,
    remainingBefore: safeRemaining,
    remainingAfter: isFull ? 0 : remainingAfter,
    newPaidPercent,
    invoiceCurrency: invCur,
    bondCurrency: bondCur,
  };
}

/**
 * إجمالي ما سيُخصَّص على الفاتورة: مبلغ السند + العمولة/الخصم.
 * العمولة تُحتسب فقط عندما تكون عملة السند هي العملة الأساسية (SAR)،
 * لأن سند العمولة يُرسَل دائماً بـ p_amount دون p_foreign_amount.
 */
export function computeRequestedAllocation({
  mainAmount,
  commissionAmount,
  currencyCode,
}: RequestedAllocationInput): number {
  const safeMain = toFinite(mainAmount);
  const safeCommission = currencyCode === COMMISSION_BASE_CURRENCY ? toFinite(commissionAmount) : 0;
  return safeMain + safeCommission;
}

/**
 * هل يتجاوز المطلوب المتبقي على الفاتورة؟
 * `remaining = null` يعني أن الفاتورة غير محددة أو بياناتها غير مكتملة
 * (تعبئة مسبقة من منظومة الديون) — عندها نترك القرار للخادم.
 */
export function exceedsInvoiceRemaining(
  requested: number,
  remaining: number | null | undefined
): boolean {
  if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return false;
  return requested > remaining + INVOICE_AMOUNT_EPSILON;
}

/** رسالة عربية موحّدة تُعرض للمستخدم عند تجاوز المتبقي. */
export function buildOverAllocationMessage(
  requested: number,
  remaining: number,
  currencyCode?: string
): string {
  const fmt = (value: number): string =>
    value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const unit = currencyCode ? ` ${currencyCode}` : '';
  return `المبلغ المطلوب (${fmt(requested)}${unit}) يتجاوز المتبقي على الفاتورة (${fmt(remaining)}${unit})`;
}
