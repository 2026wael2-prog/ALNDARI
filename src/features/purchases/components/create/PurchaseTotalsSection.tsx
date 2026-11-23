import React from 'react';
import { HandCoins, Wallet } from 'lucide-react';
import { formatCurrency } from '../../../../core/utils';
import type { PurchaseStoreState } from './purchaseValidation';
import { CalculatorInput } from '@/ui/common/CalculatorInput';

interface PurchaseTotalsSectionProps {
  totals: PurchaseStoreState['totals'];
  invoiceType: 'cash' | 'credit';
  paidAmount: number;
  currency: string;
  onPaidAmountChange: (value: number) => void;
}

/**
 * Totals breakdown panel and optional partial-payment input for credit purchases.
 */
export const PurchaseTotalsSection: React.FC<PurchaseTotalsSectionProps> = ({
  totals,
  invoiceType,
  paidAmount,
  currency,
  onPaidAmountChange,
}) => (
  <div className="border-t-2 border-gray-200 bg-[var(--app-surface)] p-2 dark:border-slate-800 max-md:border-t max-md:p-0.5 md:p-3 print:break-inside-avoid">
    <div className="flex flex-col items-stretch justify-between gap-3 md:flex-row">
      {invoiceType === 'credit' ? (
        <div className="flex-1 rounded-xl border border-amber-200/80 bg-amber-50/50 p-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
              <HandCoins size={14} className="text-amber-600 dark:text-amber-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                سداد دفعة نقدية للمورد (اختياري للآجل)
              </span>
            </div>
            <span className="font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300">
              المتبقي آجل:{' '}
              {formatCurrency(Math.max(0, totals.grandTotal - (paidAmount || 0)), currency)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <CalculatorInput
                value={paidAmount || 0}
                onValueChange={val => {
                  onPaidAmountChange(val < 0 ? 0 : val);
                }}
                showKeypadToggle={true}
                compact={true}
                allowNegative={false}
                placeholder="0.00"
                className="w-full rounded-lg border border-amber-300/80 bg-white py-1.5 pr-12 pl-10 font-mono text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-amber-700/60 dark:bg-slate-900 dark:text-slate-100"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                {currency}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onPaidAmountChange(totals.grandTotal);
                }}
                className="rounded-md bg-amber-200/70 px-2 py-1.5 text-[10px] font-bold text-amber-900 transition-colors hover:bg-amber-300 dark:bg-amber-900/60 dark:text-amber-200"
              >
                كامل
              </button>
              <button
                type="button"
                onClick={() => {
                  onPaidAmountChange(Math.round((totals.grandTotal / 2) * 100) / 100);
                }}
                className="rounded-md bg-amber-200/70 px-2 py-1.5 text-[10px] font-bold text-amber-900 transition-colors hover:bg-amber-300 dark:bg-amber-900/60 dark:text-amber-200"
              >
                50%
              </button>
              {paidAmount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onPaidAmountChange(0);
                  }}
                  className="rounded-md bg-rose-100 px-2 py-1.5 text-[10px] font-bold text-rose-700 transition-colors hover:bg-rose-200 dark:bg-rose-950/60 dark:text-rose-300"
                >
                  إلغاء
                </button>
              )}
            </div>
          </div>

          {paidAmount > totals.grandTotal && (
            <span className="mt-1 block text-[10px] font-bold text-rose-600">
              * تنبيه: مبلغ الدفعة أكبر من إجمالي الفاتورة (
              {formatCurrency(totals.grandTotal, currency)})
            </span>
          )}
        </div>
      ) : (
        <div className="hidden flex-1 md:block" />
      )}

      {/* Totals Breakdown Column */}
      <div className="flex w-full flex-col md:w-80">
        <div className="grid grid-cols-2 border dark:border-slate-800">
          <div className="border-b border-l bg-gray-50 p-2 text-right dark:border-slate-800 dark:bg-slate-950 max-md:p-0.5">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-400">
              المجموع قبل الخصم
            </span>
            <span
              dir="ltr"
              className="font-mono text-[11px] font-bold text-gray-600 dark:text-slate-400"
            >
              {formatCurrency(totals.subTotal, currency)}
            </span>
          </div>
          <div className="border-b bg-gray-50 p-2 text-right dark:border-slate-800 dark:bg-slate-950 max-md:p-0.5">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-rose-400">
              إجمالي الخصومات
            </span>
            <span
              dir="ltr"
              className="font-mono text-[11px] font-bold text-rose-600 dark:text-rose-400"
            >
              {formatCurrency(totals.totalDiscount, currency)}
            </span>
          </div>
        </div>
        <div className="relative flex items-center justify-between overflow-hidden bg-slate-950 p-4 text-white max-md:p-1.5">
          <div className="relative z-10">
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400">
              صافي الفاتورة
            </span>
            <h2 dir="ltr" className="font-mono text-3xl font-bold tracking-tighter max-md:text-xl">
              {formatCurrency(totals.grandTotal, currency)}
            </h2>
          </div>
          <div className="flex h-10 w-10 items-center justify-center bg-rose-600 shadow-lg max-md:h-7 max-md:w-7">
            <Wallet size={20} className="max-md:h-4 max-md:w-4" />
          </div>
        </div>
      </div>
    </div>
  </div>
);
