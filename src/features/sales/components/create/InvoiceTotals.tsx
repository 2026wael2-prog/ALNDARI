import React from 'react';
import { useSalesStore } from '../../store';
import { useDiscountStore } from '../../../settings/taxDiscountStore';
import { formatCurrency, cn } from '../../../../core/utils';
import { Wallet, HandCoins, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { CustomerCreditAlertCard } from './CustomerCreditAlertCard';
import { InvoiceProfitMarginCard } from './InvoiceProfitMarginCard';

interface InvoiceTotalsProps {
  notes: string;
  onNotesChange: (value: string) => void;
}

const NotesSection: React.FC<{ notes: string; onNotesChange: (v: string) => void }> = ({
  notes,
  onNotesChange,
}) => (
  <div className="w-full">
    <label
      htmlFor="sales-invoice-notes"
      className="text-[10px] font-bold uppercase tracking-widest text-gray-400"
    >
      ملاحظات الفاتورة
    </label>
    <textarea
      id="sales-invoice-notes"
      value={notes}
      onChange={event => {
        onNotesChange(event.target.value);
      }}
      rows={2}
      placeholder="أدخل أي ملاحظات على الفاتورة..."
      className="mt-1 h-12 w-full resize-none rounded-lg border border-slate-200/50 bg-slate-50/50 p-2 text-xs font-bold outline-none focus:border-blue-500/50 dark:border-slate-800 dark:bg-slate-900/40 sm:h-14"
    />
  </div>
);

interface BreakdownProps {
  subtotal: number;
  discountAmount: number;
  currency: string;
  discountEnabled: boolean;
}

const TotalsBreakdown: React.FC<BreakdownProps> = ({
  subtotal,
  discountAmount,
  currency,
  discountEnabled,
}) => (
  <div className={cn('grid', discountEnabled ? 'grid-cols-2' : 'grid-cols-1')}>
    <div className="border-b p-2.5 text-right dark:border-slate-800 sm:p-3">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-400">
        المجموع الفرعي
      </span>
      <span
        dir="ltr"
        className="font-mono text-xs font-bold text-gray-700 dark:text-slate-300 sm:text-sm"
      >
        {formatCurrency(subtotal, currency)}
      </span>
    </div>
    {discountEnabled && (
      <div className="border-b border-l p-2.5 text-right dark:border-slate-800 sm:p-3">
        <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-400">
          إجمالي الخصم
        </span>
        <span dir="ltr" className="font-mono text-xs font-bold text-rose-500 sm:text-sm">
          {formatCurrency(discountAmount, currency)}
        </span>
      </div>
    )}
  </div>
);

const NetTotalDisplay: React.FC<{
  totalAmount: number;
  currency: string;
  exchangeRate: number;
  exchangeOperator?: string;
}> = ({ totalAmount, currency, exchangeRate, exchangeOperator }) => {
  const isForeign = currency !== 'SAR';
  const effectiveRate =
    exchangeOperator === 'divide' && exchangeRate < 1 ? 1 / exchangeRate : exchangeRate || 410;
  const baseEquivalent = isForeign
    ? exchangeOperator === 'divide'
      ? totalAmount / effectiveRate
      : totalAmount * effectiveRate
    : totalAmount;

  return (
    <div className="group relative flex flex-1 flex-col justify-between overflow-hidden bg-slate-950 p-3 text-white sm:p-4">
      <div className="flex items-start justify-between">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400">
              صافي الفاتورة
            </span>
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10px] font-black',
                currency === 'YER'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
              )}
            >
              {currency === 'YER' ? 'الريال اليمني (YER)' : 'الريال السعودي (SAR)'}
            </span>
          </div>
          <h2
            dir="ltr"
            className="mt-1 font-mono text-xl font-bold leading-none tracking-tighter transition-transform duration-500 group-hover:scale-105 sm:text-2xl lg:text-3xl text-white"
          >
            {formatCurrency(totalAmount, currency)}
          </h2>
          {isForeign && (
            <p className="mt-1 font-mono text-xs font-bold text-amber-300">
              المعادل: ≈ {formatCurrency(baseEquivalent, 'SAR')} (صرف {effectiveRate})
            </p>
          )}
        </div>
        <div className="relative z-10 rounded-xl bg-blue-600 p-2.5 shadow-lg shadow-blue-500/40 sm:p-3">
          <Wallet size={18} className="sm:h-5 sm:w-5" />
        </div>
      </div>
      <div className="absolute left-0 top-0 h-0.5 w-full animate-pulse bg-blue-500"></div>
    </div>
  );
};

const InvoiceTotals: React.FC<InvoiceTotalsProps> = ({ notes, onNotesChange }) => {
  const {
    items,
    selectedCustomer,
    summary,
    currency,
    exchangeRate,
    exchangeOperator,
    invoiceType,
    paidAmount,
    setMetadata,
    setCurrencyPreservingPrices,
  } = useSalesStore();
  const { discountEnabled } = useDiscountStore();

  const isSuspiciouslyHighSAR = currency === 'SAR' && summary.totalAmount >= 5000;

  return (
    <div className="rounded-b-2xl border-t-2 border-gray-100 bg-[var(--app-surface)] dark:border-slate-800">
      {/* Smart Currency Warning Banner */}
      {isSuspiciouslyHighSAR && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300/80 bg-amber-500/10 px-4 py-2.5 text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="text-[11px] font-black">
              تنبيه تدقيق العملة: إجمالي الفاتورة ({formatCurrency(summary.totalAmount, 'SAR')}) مرتفع جداً بالنسبة للريال السعودي. هل تقصد الريال اليمني (YER)؟
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCurrencyPreservingPrices('YER')}
            className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1 text-xs font-black text-white shadow-xs transition hover:bg-amber-700"
          >
            <ArrowRightLeft size={13} />
            تحويل العملة إلى ريال يمني (YER) الآن
          </button>
        </div>
      )}
      <div className="flex flex-col items-stretch justify-between md:flex-row">
        <div className="flex-1 flex flex-col justify-between p-2.5 sm:p-4 space-y-2.5">
          <NotesSection notes={notes} onNotesChange={onNotesChange} />

          {/* 1. تنبيه رصيد وسجل العميل السابق وآخر دفعة سددها */}
          {selectedCustomer?.id && (
            <CustomerCreditAlertCard
              customer={selectedCustomer}
              invoiceCurrency={currency}
            />
          )}

          {/* 2. بطاقة تحليل الربحية وهامش الخصم المتاح للعميل */}
          <InvoiceProfitMarginCard
            items={items}
            currency={currency}
            exchangeRate={exchangeRate}
            exchangeOperator={exchangeOperator}
            totalAmount={summary.totalAmount}
          />
        </div>

        {/* Partial Payment Section for Credit Invoices */}
        {invoiceType === 'credit' && (
          <div className="flex-1 border-t border-slate-200 p-2.5 dark:border-slate-800 md:border-r md:border-t-0 md:p-4">
            <div className="flex flex-col gap-2 rounded-xl border border-amber-200/80 bg-amber-50/50 p-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                  <HandCoins size={14} className="text-amber-600 dark:text-amber-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    دفعة نقدية مقدماً (اختياري للآجل)
                  </span>
                </div>
                <span className="font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300">
                  المتبقي آجل:{' '}
                  {formatCurrency(Math.max(0, summary.totalAmount - (paidAmount || 0)), currency)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    max={summary.totalAmount}
                    step="any"
                    placeholder="0.00"
                    value={paidAmount > 0 ? paidAmount : ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setMetadata('paidAmount', isNaN(val) || val < 0 ? 0 : val);
                    }}
                    className="w-full rounded-lg border border-amber-300/80 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-amber-700/60 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                    {currency}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMetadata('paidAmount', summary.totalAmount);
                    }}
                    className="rounded-md bg-amber-200/70 px-2 py-1.5 text-[10px] font-bold text-amber-900 transition-colors hover:bg-amber-300 dark:bg-amber-900/60 dark:text-amber-200"
                  >
                    كامل
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMetadata('paidAmount', Math.round((summary.totalAmount / 2) * 100) / 100);
                    }}
                    className="rounded-md bg-amber-200/70 px-2 py-1.5 text-[10px] font-bold text-amber-900 transition-colors hover:bg-amber-300 dark:bg-amber-900/60 dark:text-amber-200"
                  >
                    50%
                  </button>
                  {paidAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setMetadata('paidAmount', 0);
                      }}
                      className="rounded-md bg-rose-100 px-2 py-1.5 text-[10px] font-bold text-rose-700 transition-colors hover:bg-rose-200 dark:bg-rose-950/60 dark:text-rose-300"
                    >
                      إلغاء
                    </button>
                  )}
                </div>
              </div>

              {paidAmount > summary.totalAmount && (
                <span className="text-[10px] font-bold text-rose-600">
                  * تنبيه: مبلغ الدفعة أكبر من إجمالي الفاتورة (
                  {formatCurrency(summary.totalAmount, currency)})
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex w-full flex-col border-t border-slate-200 dark:border-slate-800 md:w-80 md:border-l md:border-t-0">
          <TotalsBreakdown
            subtotal={summary.subtotal}
            discountAmount={summary.discountAmount}
            currency={currency}
            discountEnabled={discountEnabled}
          />
          <NetTotalDisplay
            totalAmount={summary.totalAmount}
            currency={currency}
            exchangeRate={exchangeRate}
            exchangeOperator={exchangeOperator}
          />
        </div>
      </div>
    </div>
  );
};

export default InvoiceTotals;
