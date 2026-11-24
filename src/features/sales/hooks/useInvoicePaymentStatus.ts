import { useMemo } from 'react';

export interface InvoicePaymentStatusInfo {
  /** إجمالي الفاتورة بالعملة الأساسية (SAR) */
  total: number;
  /** المسدد بالعملة الأساسية (SAR) */
  paid: number;
  /** المتبقي بالعملة الأساسية (SAR) */
  remaining: number;
  /** إجمالي الفاتورة بعملة المستند (مثل YER أو SAR) */
  docTotal: number;
  /** المسدد بعملة المستند */
  docPaid: number;
  /** المتبقي بعملة المستند */
  docRemaining: number;
  currency: string;
  isPaid: boolean;
  isPartial: boolean;
}

const PAID_EPSILON = 0.01;

export const useInvoicePaymentStatus = (invoice: any): InvoicePaymentStatusInfo | null => {
  const paymentInfo = useMemo(() => {
    if (!invoice) return null;

    const totalBase = Number(invoice.total_amount) || 0;
    const currency = String(invoice.currency_code || invoice.currency || 'SAR')
      .toUpperCase()
      .trim();
    const isForeign = currency !== 'SAR';
    const rate = Number(invoice.exchange_rate) || 0;

    // payment_allocations.amount is ALWAYS stored in base currency (SAR), matching invoices.total_amount.
    // NEVER sum pa.payments.amount here because payments.amount is in document currency (e.g. 30,000 YER),
    // which previously exceeded total_amount (in SAR) and falsely marked partial YER invoices as fully paid.
    const allocations = Array.isArray(invoice.payment_allocations)
      ? (invoice.payment_allocations as Array<{
          amount?: number | string | null;
          deleted_at?: string | null;
          payments?: { status?: string | null } | null;
        }>)
      : [];

    const paidFromAllocations = allocations.reduce((sum, pa) => {
      if (pa?.deleted_at) return sum;
      if (pa?.payments?.status === 'void') return sum;
      return sum + (Number(pa?.amount) || 0);
    }, 0);

    const advanceBase = Number((invoice as Record<string, unknown>).advance_payment) || 0;
    const invoicePaidBase = Number((invoice as Record<string, unknown>).paid_amount) || 0;
    const paidBase = Math.max(invoicePaidBase, advanceBase + paidFromAllocations);
    const remainingBase = Math.max(0, Math.round((totalBase - paidBase) * 100) / 100);

    const explicitDocTotal = Number(invoice.total_document_amount) || 0;
    let docTotal = totalBase;
    if (isForeign) {
      if (explicitDocTotal > 0) {
        docTotal = explicitDocTotal;
      } else if (rate > 0 && rate < 1) {
        docTotal = Math.round(totalBase / rate);
      } else if (rate > 1 && currency === 'YER') {
        docTotal = Math.round(totalBase * rate);
      }
    }

    const docPaid = !isForeign
      ? Math.round(paidBase * 100) / 100
      : paidBase <= 0
        ? 0
        : totalBase > 0 && docTotal > 0
          ? Math.min(docTotal, Math.round((paidBase / totalBase) * docTotal))
          : Math.round(paidBase * 100) / 100;

    const docRemaining = !isForeign
      ? remainingBase
      : Math.max(0, Math.round((docTotal - docPaid) * 100) / 100);

    const isCashSettled =
      invoice.payment_method === 'cash' &&
      (invoice.status === 'paid' || invoice.status === 'posted');
    const isPaid =
      (totalBase > 0 && remainingBase <= PAID_EPSILON) ||
      invoice.status === 'paid' ||
      isCashSettled;

    return {
      total: totalBase,
      paid: Math.min(totalBase, Math.round(paidBase * 100) / 100),
      remaining: isPaid ? 0 : remainingBase,
      docTotal,
      docPaid: isPaid ? docTotal : docPaid,
      docRemaining: isPaid ? 0 : docRemaining,
      currency,
      isPaid,
      isPartial: !isPaid && paidBase > PAID_EPSILON && remainingBase > PAID_EPSILON,
    };
  }, [invoice]);

  return paymentInfo;
};
