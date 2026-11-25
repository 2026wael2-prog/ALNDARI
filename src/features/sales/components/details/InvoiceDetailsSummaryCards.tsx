import React from 'react';
import { Calendar, CreditCard, DollarSign, User } from 'lucide-react';
import { cn, formatCurrency } from '@/core/utils';
import type { InvoiceWithDetails } from '../../api';

interface InvoiceDetailsSummaryCardsProps {
  invoice: InvoiceWithDetails;
  remainingAmount?: number | null | undefined;
}

const statusBadge = (
  status: string,
  paymentMethod?: string | null,
  remainingAmount?: number | null,
  returnStatus?: string | null
) => {
  if (status === 'returned' || returnStatus === 'full') {
    return {
      label: 'مرتجع بالكامل',
      cls: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    };
  }
  if (status === 'partially_returned' || returnStatus === 'partial') {
    return {
      label: 'مرتجع جزئياً',
      cls: 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
    };
  }
  if (status === 'paid' || (paymentMethod === 'credit' && remainingAmount !== undefined && remainingAmount !== null && remainingAmount <= 0)) {
    return {
      label: 'مدفوع بالكامل',
      cls: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    };
  }
  switch (status) {
    case 'partial':
    case 'partially_paid':
      return {
        label: 'مدفوع جزئياً',
        cls: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      };
    case 'posted':
      if (paymentMethod === 'credit') {
        return {
          label: 'آجل - غير مسدد',
          cls: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
        };
      }
      return {
        label: 'مرحّل',
        cls: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      };
    default:
      return {
        label: 'مسودة',
        cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
      };
  }
};

/**
 * High-density 4-card summary strip for InvoiceDetailsModal.
 */
export const InvoiceDetailsSummaryCards: React.FC<InvoiceDetailsSummaryCardsProps> = ({
  invoice,
  remainingAmount,
}) => {
  const returnStatus = (invoice as unknown as { return_status?: string | null }).return_status;
  const badge = statusBadge(invoice.status, invoice.payment_method, remainingAmount, returnStatus);
  const explicitDocTotal = Number((invoice as Record<string, unknown>).total_document_amount) || 0;
  const itemsSum = Array.isArray(invoice.invoice_items)
    ? invoice.invoice_items.reduce(
        (s, it) => s + Number(it.total || (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) || 0),
        0
      )
    : 0;
  const baseTotal = Number(invoice.total_amount) || 0;
  const currency = invoice.currency_code || 'SAR';
  const docTotal =
    currency !== 'SAR'
      ? explicitDocTotal > 0
        ? explicitDocTotal
        : itemsSum > baseTotal * 5
          ? itemsSum
          : baseTotal
      : baseTotal;
  const showDocTotal = currency !== 'SAR' && docTotal > 0;
  const docRemaining =
    showDocTotal && baseTotal > 0 && remainingAmount != null
      ? Math.round((remainingAmount / baseTotal) * docTotal)
      : remainingAmount;

  return (
    <div className="grid grid-cols-4 gap-1 text-xs sm:gap-2">
      <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-700 dark:bg-slate-800/60 sm:rounded-xl sm:p-2.5">
        <div className="mb-0.5 flex items-center gap-1 text-slate-400 sm:mb-1 sm:gap-1.5">
          <User size={11} className="shrink-0 text-blue-500 sm:h-[13px] sm:w-[13px]" />
          <span className="truncate text-[10px] font-bold uppercase sm:text-[10px]">العميل</span>
        </div>
        <p
          className="truncate text-[10px] font-bold text-slate-800 dark:text-slate-100 sm:text-xs"
          title={invoice.parties?.name || 'عميل نقدي'}
        >
          {invoice.parties?.name || 'عميل نقدي'}
        </p>
        {invoice.parties?.phone && (
          <p className="mt-0.5 hidden truncate font-mono text-[10px] text-slate-400 sm:block">{invoice.parties.phone}</p>
        )}
      </div>

      <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-700 dark:bg-slate-800/60 sm:rounded-xl sm:p-2.5">
        <div className="mb-0.5 flex items-center gap-1 text-slate-400 sm:mb-1 sm:gap-1.5">
          <Calendar size={11} className="shrink-0 text-purple-500 sm:h-[13px] sm:w-[13px]" />
          <span className="truncate text-[10px] font-bold uppercase sm:text-[10px]">التاريخ</span>
        </div>
        <p className="truncate font-mono text-[10px] font-bold text-slate-800 dark:text-slate-100 sm:text-xs">
          {invoice.issue_date}
        </p>
        <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400 sm:text-[10px]">#{invoice.invoice_number}</p>
      </div>

      <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-700 dark:bg-slate-800/60 sm:rounded-xl sm:p-2.5">
        <div className="mb-0.5 flex items-center gap-1 text-slate-400 sm:mb-1 sm:gap-1.5">
          <CreditCard size={11} className="shrink-0 text-amber-500 sm:h-[13px] sm:w-[13px]" />
          <span className="truncate text-[10px] font-bold uppercase sm:text-[10px]">الحالة</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-0.5 sm:gap-1">
          <span className={cn('truncate rounded border px-1 py-0 text-[10px] font-bold sm:px-1.5 sm:py-0.5 sm:text-[10px]', badge.cls)}>
            {badge.label}
          </span>
          <span className="hidden text-[10px] font-bold text-slate-500 sm:inline">
            {invoice.payment_method === 'credit' ? 'آجل' : 'نقداً'}
          </span>
        </div>
      </div>

      <div className="min-w-0 rounded-lg border border-blue-100 bg-blue-50/60 p-1.5 dark:border-blue-900/60 dark:bg-blue-950/30 sm:rounded-xl sm:p-2.5">
        <div className="mb-0.5 flex items-center gap-1 text-blue-500 sm:mb-1 sm:gap-1.5">
          <DollarSign size={11} className="shrink-0 sm:h-[13px] sm:w-[13px]" />
          <span className="truncate text-[10px] font-bold uppercase sm:text-[10px]">الإجمالي</span>
        </div>
        <p dir="ltr" className="truncate text-right font-mono text-[10.5px] font-black text-blue-700 dark:text-blue-300 sm:text-sm">
          {formatCurrency(showDocTotal ? docTotal : invoice.total_amount, currency)}
        </p>
        {showDocTotal && (
          <p className="mt-0.5 hidden truncate font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 sm:block">
            المعادل: {formatCurrency(invoice.total_amount, 'SAR')}
          </p>
        )}
        {remainingAmount != null && remainingAmount > 0 && (
          <p className="mt-0.5 truncate font-mono text-[10px] font-bold text-rose-600 sm:text-[10px]">
            متبقي: {formatCurrency(docRemaining ?? remainingAmount, currency)}
            {showDocTotal && ` (≈ ${formatCurrency(remainingAmount, 'SAR')})`}
          </p>
        )}
      </div>
    </div>
  );
};
