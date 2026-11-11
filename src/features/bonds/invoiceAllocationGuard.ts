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

function toFinite(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
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
export function buildOverAllocationMessage(requested: number, remaining: number): string {
  const fmt = (value: number): string =>
    value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `المبلغ المطلوب (${fmt(requested)}) يتجاوز المتبقي على الفاتورة (${fmt(remaining)})`;
}
