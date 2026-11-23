import React from 'react';
import { Calendar, CreditCard, DollarSign, User } from 'lucide-react';
import { cn, formatCurrency } from '@/core/utils';
import type { InvoiceWithDetails } from '../../api';

interface InvoiceDetailsSummaryCardsProps {
  invoice: InvoiceWithDetails;
  remainingAmount?: number | null | undefined;
}

const statusBadge = (status: string, paymentMethod?: string, remainingAmount?: number | null) => {
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
  const badge = statusBadge(invoice.status, invoice.payment_method, remainingAmount);
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
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/60">
        <div className="mb-1 flex items-center gap-1.5 text-slate-400">
          <User size={13} className="text-blue-500" />
          <span className="text-[10px] font-bold uppercase">العميل</span>
        </div>
        <p
          className="truncate font-bold text-slate-800 dark:text-slate-100"
          title={invoice.parties?.name || 'عميل نقدي'}
        >
          {invoice.parties?.name || 'عميل نقدي'}
        </p>
        {invoice.parties?.phone && (
          <p className="mt-0.5 font-mono text-[10px] text-slate-400">{invoice.parties.phone}</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/60">
        <div className="mb-1 flex items-center gap-1.5 text-slate-400">
          <Calendar size={13} className="text-purple-500" />
          <span className="text-[10px] font-bold uppercase">التاريخ والرقم</span>
        </div>
        <p className="font-mono font-bold text-slate-800 dark:text-slate-100">
          {invoice.issue_date}
        </p>
        <p className="mt-0.5 font-mono text-[10px] text-slate-400">#{invoice.invoice_number}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/60">
        <div className="mb-1 flex items-center gap-1.5 text-slate-400">
          <CreditCard size={13} className="text-amber-500" />
          <span className="text-[10px] font-bold uppercase">الحالة والدفع</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-bold', badge.cls)}>
            {badge.label}
          </span>
          <span className="text-[10px] font-bold text-slate-500">
            {invoice.payment_method === 'credit' ? 'آجل' : 'نقداً'}
          </span>
        </div>
      </div>

      <div className="col-span-2 rounded-xl border border-blue-100 bg-blue-50/60 p-2.5 dark:border-blue-900/60 dark:bg-blue-950/30 sm:col-span-1">
        <div className="mb-1 flex items-center gap-1.5 text-blue-500">
          <DollarSign size={13} />
          <span className="text-[10px] font-bold uppercase">المبلغ الإجمالي</span>
        </div>
        <p className="font-mono text-sm font-black text-blue-700 dark:text-blue-300">
          {formatCurrency(showDocTotal ? docTotal : invoice.total_amount, currency)}
        </p>
        {showDocTotal && (
          <p className="mt-0.5 font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400">
            المعادل: {formatCurrency(invoice.total_amount, 'SAR')}
          </p>
        )}
        {remainingAmount != null && remainingAmount > 0 && (
          <p className="mt-0.5 font-mono text-[10px] font-bold text-rose-600">
            متبقي: {formatCurrency(docRemaining ?? remainingAmount, currency)}
            {showDocTotal && ` (≈ ${formatCurrency(remainingAmount, 'SAR')})`}
          </p>
        )}
      </div>
    </div>
  );
};
