import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft, Coins, Combine, Loader2, X } from 'lucide-react';
import { cn, formatCurrency } from '@/core/utils';
import { formatLocalDate } from '@/core/utils/dateUtils';
import { useCurrencies } from '@/features/settings/hooks';
import {
  useBulkConvertInvoicesCurrency,
  useMergeInvoices,
} from '@/features/sales/hooks/useInvoices';
import type { StatementMovement } from '../../service';

export type StatementBulkInvoiceModalMode = 'merge' | 'convert_currency';

interface StatementBulkInvoiceModalProps {
  isOpen: boolean;
  mode: StatementBulkInvoiceModalMode | null;
  partyName: string;
  selectedInvoices: StatementMovement[];
  onClose: () => void;
  onSuccess: () => void;
}

export const StatementBulkInvoiceModal: React.FC<StatementBulkInvoiceModalProps> = ({
  isOpen,
  mode,
  partyName,
  selectedInvoices,
  onClose,
  onSuccess,
}) => {
  const { rates } = useCurrencies();
  const mergeMutation = useMergeInvoices();
  const convertCurrencyMutation = useBulkConvertInvoicesCurrency();

  const defaultYerRate = useMemo(() => {
    const yerRow = rates.data?.find(
      (r: { currency_code: string; rate_to_base: number }) => r.currency_code === 'YER'
    );
    const raw = Number(yerRow?.rate_to_base || 0);
    if (raw > 0 && raw < 1) return Math.round(1 / raw);
    if (raw > 1) return raw;
    return 425;
  }, [rates.data]);

  const [targetCurrency, setTargetCurrency] = useState<'SAR' | 'YER'>('SAR');
  const [exchangeRateDisplay, setExchangeRateDisplay] = useState<number>(defaultYerRate);
  const [targetDate, setTargetDate] = useState<string>(formatLocalDate());
  const [combineDuplicateProducts, setCombineDuplicateProducts] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || selectedInvoices.length === 0) return;
    const firstCurr = String(selectedInvoices[0]?.currency || 'SAR').toUpperCase();
    if (mode === 'convert_currency') {
      setTargetCurrency(firstCurr === 'YER' ? 'SAR' : 'YER');
    } else {
      setTargetCurrency(firstCurr === 'YER' ? 'YER' : 'SAR');
    }
    setExchangeRateDisplay(defaultYerRate);

    const latestDate = selectedInvoices
      .map(inv => inv.date)
      .filter(Boolean)
      .sort()
      .pop();
    setTargetDate(latestDate || formatLocalDate());
    setCombineDuplicateProducts(true);
    setNotes('');
    setErrorMessage(null);
  }, [isOpen, mode, selectedInvoices, defaultYerRate]);

  const invoiceIds = useMemo(
    () =>
      Array.from(
        new Set(selectedInvoices.map(inv => inv.reference_id).filter((id): id is string => Boolean(id)))
      ),
    [selectedInvoices]
  );

  const currencyTotals = useMemo(() => {
    const map = new Map<string, number>();
    selectedInvoices.forEach(inv => {
      const curr = String(inv.currency || 'SAR').toUpperCase();
      const amount = Number(inv.debit || 0) || Number(inv.credit || 0);
      map.set(curr, (map.get(curr) ?? 0) + amount);
    });
    return Array.from(map.entries());
  }, [selectedInvoices]);

  const hasMixedPaymentMethods = useMemo(() => {
    const methods = new Set(
      selectedInvoices.map(inv => (inv.payment_method === 'cash' ? 'cash' : 'credit'))
    );
    return methods.size > 1;
  }, [selectedInvoices]);

  if (!isOpen || !mode) return null;

  const isMerge = mode === 'merge';
  const isSubmitting = mergeMutation.isPending || convertCurrencyMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (invoiceIds.length === 0) {
      setErrorMessage('لا توجد فواتير مبيعات صالحة ضمن التحديد الحالي.');
      return;
    }
    if (isMerge && invoiceIds.length < 2) {
      setErrorMessage('يجب تحديد فاتورتي مبيعات على الأقل لإجراء الدمج.');
      return;
    }
    if (targetCurrency === 'YER' && (!Number.isFinite(exchangeRateDisplay) || exchangeRateDisplay <= 1)) {
      setErrorMessage('يرجى إدخال سعر صرف صالح للريال اليمني (أكبر من 1).');
      return;
    }

    try {
      if (isMerge) {
        await mergeMutation.mutateAsync({
          invoiceIds,
          targetCurrency,
          exchangeRate: targetCurrency === 'SAR' ? 1 : exchangeRateDisplay,
          targetDate: targetDate || undefined,
          notes: notes.trim() || undefined,
          combineDuplicateProducts,
        });
      } else {
        await convertCurrencyMutation.mutateAsync({
          invoiceIds,
          targetCurrency,
          exchangeRate: targetCurrency === 'SAR' ? 1 : exchangeRateDisplay,
        });
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء تنفيذ العملية.';
      setErrorMessage(msg);
    }
  };

  return createPortal(
    <div className="animate-in fade-in fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/55 p-0 duration-100 sm:items-center sm:p-4">
      <form
        onSubmit={handleSubmit}
        style={{ backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[var(--app-border)] bg-[var(--app-surface)] text-right shadow-2xl sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--app-border)] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl border',
                isMerge
                  ? 'border-indigo-500/30 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                  : 'border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400'
              )}
            >
              {isMerge ? <Combine size={20} /> : <ArrowRightLeft size={20} />}
            </div>
            <div>
              <h3 className="text-sm font-black text-[var(--app-text)]">
                {isMerge
                  ? `دمج فواتير المبيعات (${invoiceIds.length})`
                  : `تغيير عملة الفواتير المحددة (${invoiceIds.length})`}
              </h3>
              <p className="text-xs font-medium text-[var(--app-text-secondary)]">
                العميل: <strong className="text-[var(--app-text)]">{partyName}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Selected Invoices Preview */}
          <div className="overflow-hidden rounded-xl border border-[var(--app-border)]">
            <div className="flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-xs font-bold text-[var(--app-text-secondary)]">
              <span>الفواتير المحددة ({selectedInvoices.length})</span>
              <div className="flex flex-wrap gap-2">
                {currencyTotals.map(([curr, sum]) => (
                  <span key={curr} className="font-mono font-black text-[var(--app-text)]" dir="ltr">
                    {formatCurrency(sum, curr)}
                  </span>
                ))}
              </div>
            </div>
            <div className="max-h-40 divide-y divide-[var(--app-border)] overflow-y-auto text-xs">
              {selectedInvoices.map((inv, idx) => (
                <div key={inv.id} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-[var(--app-text-secondary)]">
                      {idx === 0 && isMerge ? 'الأساسية' : `#${idx + 1}`}
                    </span>
                    <span className="font-mono font-black text-blue-600 dark:text-blue-400">
                      {inv.ref}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--app-text-secondary)]">
                      {inv.date}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {inv.payment_method === 'cash' ? 'نقدي' : 'آجل'}
                    </span>
                    <span className="font-mono font-black text-[var(--app-text)]" dir="ltr">
                      {formatCurrency(Number(inv.debit || inv.credit || 0), inv.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {isMerge && hasMixedPaymentMethods && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
              تنبيه: لا يمكن دمج فواتير نقدية مع فواتير آجلة في نفس العملية. يرجى تحديد فواتير من نفس نوع الدفع.
            </div>
          )}

          {/* Target Currency & Rate */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3.5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--app-text-secondary)]">
                <Coins size={14} className="text-amber-500" />
                <span>العملة المستهدفة</span>
              </label>
              <div className="flex rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setTargetCurrency('SAR');
                    setExchangeRateDisplay(1);
                  }}
                  className={cn(
                    'flex-1 rounded-md py-1.5 text-xs font-black transition-colors',
                    targetCurrency === 'SAR'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                  )}
                >
                  ريال سعودي (SAR)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetCurrency('YER');
                    setExchangeRateDisplay(defaultYerRate);
                  }}
                  className={cn(
                    'flex-1 rounded-md py-1.5 text-xs font-black transition-colors',
                    targetCurrency === 'YER'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                  )}
                >
                  ريال يمني (YER)
                </button>
              </div>
            </div>

            {targetCurrency === 'YER' && (
              <div>
                <label className="mb-1.5 block text-xs font-bold text-[var(--app-text-secondary)]">
                  سعر الصرف (1 ر.س = ر.ي)
                </label>
                <input
                  type="number"
                  min={2}
                  step="any"
                  value={exchangeRateDisplay}
                  onChange={e => setExchangeRateDisplay(Number(e.target.value))}
                  className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-center font-mono text-xs font-black text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            {isMerge && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-[var(--app-text-secondary)]">
                    تاريخ الفاتورة المدمجة
                  </label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={e => setTargetDate(e.target.value)}
                    className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 font-mono text-xs font-bold text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-[var(--app-text)]">
                    <input
                      type="checkbox"
                      checked={combineDuplicateProducts}
                      onChange={e => setCombineDuplicateProducts(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>دمج الأصناف المتطابقة بنفس السعر</span>
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-[var(--app-text-secondary)]">
                    ملاحظات إضافية (اختياري)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="مثال: دمج فواتير شهر نوفمبر بناءً على طلب العميل"
                    className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-xs text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </>
            )}
          </div>

          <p className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-3 text-[11px] font-medium leading-relaxed text-blue-900 dark:text-blue-200">
            {isMerge
              ? 'سيتم جمع أصناف جميع الفواتير المحددة في الفاتورة الأساسية، وإلغاء الفواتير المدمجة الفرعية وعكس قيودها ومخزونها وإعادة ترحيل الفاتورة المدمجة ذرياً دون التأثير على رصيد المخزون.'
              : 'سيتم تحويل أسعار وإجماليات وقيود جميع الفواتير المحددة إلى العملة الجديدة بشكل ذري مع تحديث كشف الحساب تلقائياً.'}
          </p>

          {errorMessage && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] bg-[var(--app-bg)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-xs font-bold text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={isSubmitting || (isMerge && hasMixedPaymentMethods)}
            className={cn(
              'flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-black text-white shadow-md transition-all disabled:opacity-50',
              isMerge ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-amber-600 hover:bg-amber-700'
            )}
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>
              {isSubmitting
                ? 'جاري التنفيذ...'
                : isMerge
                  ? 'تأكيد دمج الفواتير'
                  : 'تأكيد تحويل العملة'}
            </span>
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};

export default StatementBulkInvoiceModal;
