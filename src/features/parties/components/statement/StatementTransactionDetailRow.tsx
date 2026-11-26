import React, { useEffect, useState } from 'react';
import { Loader2, Package, CheckCircle2, AlertCircle, FileText, ArrowRight } from 'lucide-react';
import {
  partiesService,
  type StatementMovement,
  type StatementTransactionDetails,
} from '../../service';
import { formatCurrency } from '../../../../core/utils';
import { useAuthStore } from '../../../auth/store';

interface Props {
  movement: StatementMovement;
  partyName?: string | undefined;
  preloadedDetails?: StatementTransactionDetails | null | undefined;
  isBatchLoading?: boolean | undefined;
  compact?: boolean | undefined;
  accentTone?: 'rose' | 'emerald' | undefined;
  onOpenInvoiceModal?: (invoiceId: string) => void;
  onOpenBondModal?: (bondId: string, movement: StatementMovement) => void;
}

export const StatementTransactionDetailRow: React.FC<Props> = ({
  movement,
  partyName: _partyName,
  preloadedDetails,
  isBatchLoading = false,
  compact = false,
  accentTone,
  onOpenInvoiceModal,
  onOpenBondModal,
}) => {
  const { user } = useAuthStore();
  const companyId = user?.company_id ?? '';
  const [fetchedDetails, setFetchedDetails] = useState<StatementTransactionDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPreloaded = preloadedDetails !== undefined && preloadedDetails !== null;
  const details = hasPreloaded ? preloadedDetails : fetchedDetails;

  useEffect(() => {
    if (hasPreloaded || isBatchLoading) {
      setLoading(false);
      return;
    }
    if (!movement.reference_id || !movement.reference_type || !companyId) {
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    partiesService
      .getTransactionDetails(companyId, movement.reference_type, movement.reference_id)
      .then(res => {
        if (isMounted) {
          setFetchedDetails(res);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err?.message || 'تعذر تحميل تفاصيل الحركة');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [movement.reference_id, movement.reference_type, companyId, hasPreloaded, isBatchLoading]);

  const panelToneCls =
    accentTone === 'emerald'
      ? 'border-emerald-300/90 bg-emerald-50/40 dark:border-emerald-800/70 dark:bg-emerald-950/20'
      : accentTone === 'rose'
        ? 'border-rose-300/90 bg-rose-50/40 dark:border-rose-800/70 dark:bg-rose-950/20'
        : 'border-slate-300 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/80';

  if (!movement.reference_id || !movement.reference_type) {
    return (
      <div
        className={`rounded-lg border border-dashed text-xs font-semibold text-black dark:text-slate-200 ${compact ? 'px-3 py-1.5' : 'p-3'} ${panelToneCls}`}
      >
        حركة محاسبية: {movement.desc || '—'}
      </div>
    );
  }

  if (loading || (isBatchLoading && !hasPreloaded)) {
    return (
      <div
        className={`flex items-center justify-center gap-2 rounded-lg border text-xs font-bold text-black dark:text-slate-200 ${compact ? 'px-3 py-2' : 'p-5'} ${panelToneCls}`}
      >
        <Loader2 size={14} className="animate-spin text-blue-600" />
        <span>جاري تحميل تفاصيل وبنود المعاملة ({movement.ref})...</span>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
        <AlertCircle size={14} />
        <span>{error || 'لا تتوفر تفاصيل إضافية لهذه المعاملة'}</span>
      </div>
    );
  }

  // 1. Invoices
  if (details.kind === 'invoice') {
    const items = details.items || [];
    return (
      <div
        className={`rounded-xl border shadow-xs ${compact ? 'space-y-2 p-2.5' : 'space-y-3 p-4'} ${panelToneCls}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300/80 pb-1.5 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Package size={15} className={accentTone === 'emerald' ? 'text-emerald-700' : 'text-rose-700'} />
            <span className="text-xs font-black text-black dark:text-white">
              بنود الفاتورة ({details.invoice_number})
            </span>
            <span className="text-[11px] font-bold text-black dark:text-slate-300">
              ({items.length} أصناف)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-black dark:text-slate-200">
              الإجمالي:{' '}
              <strong className="font-mono font-black text-black dark:text-white" dir="ltr">
                {formatCurrency(details.total_amount || 0, details.currency_code)}
              </strong>
            </span>
            {details.paid_amount !== undefined && details.paid_amount > 0 && (
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                المدفوع:{' '}
                <strong className="font-mono font-black" dir="ltr">
                  {formatCurrency(details.paid_amount, details.currency_code)}
                </strong>
              </span>
            )}
            {details.remaining_amount !== undefined && details.remaining_amount > 0 && (
              <span className="text-xs font-bold text-rose-700 dark:text-rose-400">
                المتبقي:{' '}
                <strong className="font-mono font-black" dir="ltr">
                  {formatCurrency(details.remaining_amount, details.currency_code)}
                </strong>
              </span>
            )}

            {onOpenInvoiceModal && movement.reference_id && (
              <button
                type="button"
                onClick={() => onOpenInvoiceModal(movement.reference_id!)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-black text-black transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
              >
                <span>عرض الفاتورة والطباعة</span>
                <ArrowRight size={12} className="rotate-180" />
              </button>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <p className="py-1.5 text-center text-xs font-semibold text-black dark:text-slate-300">
            لا توجد بنود مسجلة داخل الفاتورة.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950">
            <table className="w-full border-collapse border border-slate-300 text-right text-xs dark:border-slate-700">
              <thead>
                <tr className="bg-slate-100 text-[11px] font-black text-black dark:bg-slate-800 dark:text-white">
                  <th className="border border-slate-300 px-2.5 py-1.5 text-center dark:border-slate-700">
                    #
                  </th>
                  <th className="border border-slate-300 px-2.5 py-1.5 dark:border-slate-700">
                    الصنف / الوصف
                  </th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-center dark:border-slate-700">
                    رقم القطعة / SKU
                  </th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-center dark:border-slate-700">
                    الكمية
                  </th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-center dark:border-slate-700">
                    سعر الوحدة
                  </th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-center dark:border-slate-700">
                    الخصم
                  </th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-center dark:border-slate-700">
                    الإجمالي
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono text-xs font-bold text-black dark:border-slate-700 dark:text-slate-200">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-300 px-2.5 py-1.5 font-bold text-black dark:border-slate-700 dark:text-white">
                      {it.item_name}
                    </td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono text-xs font-semibold text-black dark:border-slate-700 dark:text-slate-200">
                      {it.part_number || it.sku || '—'}
                    </td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono font-black text-black dark:border-slate-700 dark:text-white">
                      {it.quantity}
                    </td>
                    <td
                      className="border border-slate-300 px-2.5 py-1.5 text-center font-mono font-bold text-black dark:border-slate-700 dark:text-slate-100"
                      dir="ltr"
                    >
                      {formatCurrency(it.unit_price, details.currency_code)}
                    </td>
                    <td
                      className="border border-slate-300 px-2.5 py-1.5 text-center font-mono font-semibold text-black dark:border-slate-700 dark:text-slate-200"
                      dir="ltr"
                    >
                      {it.discount_amount
                        ? formatCurrency(it.discount_amount, details.currency_code)
                        : '—'}
                    </td>
                    <td
                      className="border border-slate-300 px-2.5 py-1.5 text-center font-mono font-black text-black dark:border-slate-700 dark:text-white"
                      dir="ltr"
                    >
                      {formatCurrency(it.total_amount, details.currency_code)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // 2. Bonds (Payment / Receipt)
  if (details.kind === 'bond') {
    const allocations = details.allocations || [];
    return (
      <div
        className={`rounded-xl border shadow-xs ${compact ? 'space-y-2 p-2.5' : 'space-y-3 p-4'} ${panelToneCls}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300/80 pb-1.5 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-700" />
            <span className="text-xs font-black text-black dark:text-white">
              تفاصيل السند ({details.payment_number || movement.ref})
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-black ${
                details.type === 'receipt'
                  ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
                  : 'bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200'
              }`}
            >
              {details.type === 'receipt' ? 'سند قبض' : 'سند صرف'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-black dark:text-slate-200">
              طريقة الدفع:{' '}
              <strong className="font-black text-black dark:text-white">
                {details.payment_method === 'cash'
                  ? 'نقداً'
                  : details.payment_method === 'bank'
                    ? 'تحويل بنكي'
                    : details.payment_method || 'نقداً'}
              </strong>
            </span>
            {details.account_name && (
              <span className="text-xs font-semibold text-black dark:text-slate-200">
                الحساب:{' '}
                <strong className="font-black text-black dark:text-white">
                  {details.account_name}
                </strong>
              </span>
            )}
            {details.notes && (
              <span className="text-xs font-semibold text-black dark:text-slate-200">
                البيان: <strong className="font-bold text-black dark:text-white">{details.notes}</strong>
              </span>
            )}
            {onOpenBondModal && movement.reference_id && (
              <button
                type="button"
                onClick={() => onOpenBondModal(movement.reference_id!, movement)}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-black text-black transition-colors hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-800 dark:text-white"
              >
                <span>عرض وطباعة السند</span>
                <ArrowRight size={12} className="rotate-180" />
              </button>
            )}
          </div>
        </div>

        {allocations.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
              الفواتير المسواة بهذا السند:
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950">
              <table className="w-full border-collapse border border-slate-300 text-right text-xs dark:border-slate-700">
                <thead>
                  <tr className="bg-slate-100/90 text-[10px] font-bold text-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                    <th className="border border-slate-300 px-3 py-2 text-center dark:border-slate-700">
                      #
                    </th>
                    <th className="border border-slate-300 px-3 py-2 text-center dark:border-slate-700">
                      رقم الفاتورة
                    </th>
                    <th className="border border-slate-300 px-3 py-2 text-center dark:border-slate-700">
                      تاريخ الفاتورة
                    </th>
                    <th className="border border-slate-300 px-3 py-2 text-center dark:border-slate-700">
                      إجمالي الفاتورة
                    </th>
                    <th className="border border-slate-300 px-3 py-2 text-center dark:border-slate-700">
                      المبلغ المسوّى بالسند
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((al, idx) => (
                    <tr
                      key={al.allocation_id || idx}
                      className="hover:bg-slate-50 dark:hover:bg-slate-900/50"
                    >
                      <td className="border border-slate-300 px-3 py-1.5 text-center font-mono text-[10px] text-slate-400 dark:border-slate-700">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center font-mono font-bold text-blue-600 dark:border-slate-700">
                        {al.invoice_number}
                      </td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center font-mono text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
                        {al.invoice_date || '—'}
                      </td>
                      <td
                        className="border border-slate-300 px-3 py-1.5 text-center font-mono font-semibold dark:border-slate-700"
                        dir="ltr"
                      >
                        {al.invoice_total
                          ? formatCurrency(al.invoice_total, details.currency_code)
                          : '—'}
                      </td>
                      <td
                        className="border border-slate-300 px-3 py-1.5 text-center font-mono font-bold text-emerald-600 dark:border-slate-700"
                        dir="ltr"
                      >
                        {formatCurrency(al.allocated_amount, details.currency_code)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. Manual Journal Entries
  if (details.kind === 'journal') {
    const lines = details.lines || [];
    return (
      <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/90 p-4 shadow-inner dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-indigo-600" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
              بنود القيد المحاسبي (
              {details.entry_number ? `JV-${details.entry_number}` : movement.ref})
            </span>
            <span className="text-[10px] text-slate-500">({lines.length} أسطر)</span>
          </div>
          {details.entry_date && (
            <span className="text-xs text-slate-600 dark:text-slate-300">
              التاريخ: <strong className="font-mono">{details.entry_date}</strong>
            </span>
          )}
        </div>

        {lines.length === 0 ? (
          <p className="py-2 text-center text-xs italic text-slate-500">
            لا توجد أسطر مفصلة لهذا القيد.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950">
            <table className="w-full border-collapse border border-slate-300 text-right text-xs dark:border-slate-700">
              <thead>
                <tr className="bg-slate-100/90 text-[10px] font-bold text-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                  <th className="border border-slate-300 px-3 py-2 text-center dark:border-slate-700">
                    #
                  </th>
                  <th className="border border-slate-300 px-3 py-2 text-center dark:border-slate-700">
                    رقم الحساب
                  </th>
                  <th className="border border-slate-300 px-3 py-2 dark:border-slate-700">
                    اسم الحساب
                  </th>
                  <th className="border border-slate-300 px-3 py-2 dark:border-slate-700">
                    البيان
                  </th>
                  <th className="border border-slate-300 px-3 py-2 text-center dark:border-slate-700">
                    مدين (+)
                  </th>
                  <th className="border border-slate-300 px-3 py-2 text-center dark:border-slate-700">
                    دائن (-)
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="border border-slate-300 px-3 py-1.5 text-center font-mono text-[10px] text-slate-400 dark:border-slate-700">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-300 px-3 py-1.5 text-center font-mono font-bold text-blue-600 dark:border-slate-700">
                      {l.account_code || '—'}
                    </td>
                    <td className="border border-slate-300 px-3 py-1.5 font-semibold text-slate-800 dark:border-slate-700 dark:text-slate-200">
                      {l.account_name || '—'}
                    </td>
                    <td className="border border-slate-300 px-3 py-1.5 text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      {l.description || '—'}
                    </td>
                    <td
                      className="border border-slate-300 px-3 py-1.5 text-center font-mono font-bold text-emerald-600 dark:border-slate-700"
                      dir="ltr"
                    >
                      {l.debit > 0 ? formatCurrency(l.debit, l.currency_code || 'SAR') : '—'}
                    </td>
                    <td
                      className="border border-slate-300 px-3 py-1.5 text-center font-mono font-bold text-rose-600 dark:border-slate-700"
                      dir="ltr"
                    >
                      {l.credit > 0 ? formatCurrency(l.credit, l.currency_code || 'SAR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // 4. Opening Balance / General
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
      <p>
        <strong>تفاصيل القيد:</strong> {movement.desc || 'رصيد افتتاحي مسجل للطرف'}
      </p>
    </div>
  );
};
