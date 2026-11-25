/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/explicit-function-return-type, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing */
import React from 'react';
import { ArrowDownCircle, ArrowUpCircle, Wallet, Activity, Filter, RotateCcw } from 'lucide-react';
import { cn, formatCurrency } from '../../../core/utils';

export interface BondsQuickTotals {
  receiptCount: number;
  receiptAmount: number;
  paymentCount: number;
  paymentAmount: number;
  netAmount: number;
}

export interface BondsQuickAnalytics {
  avgAmount: number;
  count: number;
}

interface BondsQuickKpiBarProps {
  totals: BondsQuickTotals;
  analytics: BondsQuickAnalytics;
  isFiltered?: boolean;
  onResetFilters?: () => void;
}

export const BondsQuickKpiBar: React.FC<BondsQuickKpiBarProps> = ({
  totals,
  analytics,
  isFiltered = false,
  onResetFilters,
}) => {
  return (
    <div className="flex flex-col gap-1 px-1.5 pb-0.5 pt-1.5 sm:gap-1.5 sm:px-3 sm:pb-1 sm:pt-2.5 md:px-5 md:pt-3">
      {isFiltered && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/70 px-2 py-0.5 text-[10px] text-blue-700 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300 sm:px-3 sm:py-1 sm:text-[11px]">
          <div className="flex min-w-0 items-center gap-1.5">
            <Filter size={11} className="shrink-0 text-blue-600 dark:text-blue-400 sm:h-3 sm:w-3" />
            <span className="truncate font-semibold">
              تعكس التصفية الحالية ({analytics.count} سند)
            </span>
          </div>
          {onResetFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-blue-600 hover:bg-blue-100 hover:text-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/40"
            >
              <RotateCcw size={10} />
              إلغاء
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-4 gap-1 sm:gap-2.5 lg:gap-3">
        {/* Total Receipts Card */}
        <div
          className={cn(
            'min-w-0 rounded-lg border bg-white p-1.5 shadow-sm transition-all dark:bg-slate-900 sm:rounded-2xl sm:p-3 lg:p-3.5',
            isFiltered
              ? 'border-emerald-200 ring-1 ring-emerald-400/20 dark:border-emerald-800'
              : 'border-emerald-100 dark:border-emerald-900/30'
          )}
        >
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-emerald-600 dark:text-emerald-400 sm:text-[10px] sm:uppercase">
              المقبوضات
            </span>
            <div className="hidden rounded-lg bg-emerald-50 p-1 text-emerald-600 dark:bg-emerald-900/30 sm:block">
              <ArrowDownCircle size={14} />
            </div>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-1 sm:mt-1">
            <span dir="ltr" className="truncate font-mono text-[10.5px] font-black text-emerald-600 dark:text-emerald-400 sm:text-base lg:text-lg">
              {formatCurrency(totals.receiptAmount, 'SAR')}
            </span>
            <span className="hidden shrink-0 font-mono text-[10px] font-bold text-slate-400 sm:inline">
              {totals.receiptCount} سند
            </span>
          </div>
        </div>

        {/* Total Payments Card */}
        <div
          className={cn(
            'min-w-0 rounded-lg border bg-white p-1.5 shadow-sm transition-all dark:bg-slate-900 sm:rounded-2xl sm:p-3 lg:p-3.5',
            isFiltered
              ? 'border-rose-200 ring-1 ring-rose-400/20 dark:border-rose-800'
              : 'border-rose-100 dark:border-rose-900/30'
          )}
        >
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-rose-600 dark:text-rose-400 sm:text-[10px] sm:uppercase">
              المدفوعات
            </span>
            <div className="hidden rounded-lg bg-rose-50 p-1 text-rose-600 dark:bg-rose-900/30 sm:block">
              <ArrowUpCircle size={14} />
            </div>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-1 sm:mt-1">
            <span dir="ltr" className="truncate font-mono text-[10.5px] font-black text-rose-600 dark:text-rose-400 sm:text-base lg:text-lg">
              {formatCurrency(totals.paymentAmount, 'SAR')}
            </span>
            <span className="hidden shrink-0 font-mono text-[10px] font-bold text-slate-400 sm:inline">
              {totals.paymentCount} سند
            </span>
          </div>
        </div>

        {/* Net Cash Flow Card */}
        <div
          className={cn(
            'min-w-0 rounded-lg border bg-white p-1.5 shadow-sm transition-all dark:bg-slate-900 sm:rounded-2xl sm:p-3 lg:p-3.5',
            isFiltered
              ? 'border-blue-200 ring-1 ring-blue-400/20 dark:border-blue-800'
              : 'border-blue-100 dark:border-blue-900/30'
          )}
        >
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-blue-600 dark:text-blue-400 sm:text-[10px] sm:uppercase">
              صافي التدفق
            </span>
            <div className="hidden rounded-lg bg-blue-50 p-1 text-blue-600 dark:bg-blue-900/30 sm:block">
              <Wallet size={14} />
            </div>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-1 sm:mt-1">
            <span
              dir="ltr"
              className={cn(
                'truncate font-mono text-[10.5px] font-black sm:text-base lg:text-lg',
                totals.netAmount >= 0
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-amber-600 dark:text-amber-400'
              )}
            >
              {formatCurrency(totals.netAmount, 'SAR')}
            </span>
            <span className="hidden shrink-0 text-[10px] font-bold text-slate-400 sm:inline">
              {totals.netAmount >= 0 ? 'فائض نقدي' : 'عجز نقدي'}
            </span>
          </div>
        </div>

        {/* Average Bond Amount */}
        <div
          className={cn(
            'min-w-0 rounded-lg border bg-white p-1.5 shadow-sm transition-all dark:bg-slate-900 sm:rounded-2xl sm:p-3 lg:p-3.5',
            isFiltered
              ? 'border-slate-300 ring-1 ring-slate-400/20 dark:border-slate-700'
              : 'border-slate-200 dark:border-slate-800'
          )}
        >
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 sm:text-[10px] sm:uppercase">متوسط السند</span>
            <div className="hidden rounded-lg bg-indigo-50 p-1 text-indigo-600 dark:bg-indigo-900/30 sm:block">
              <Activity size={14} />
            </div>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-1 sm:mt-1">
            <span dir="ltr" className="truncate font-mono text-[10.5px] font-black text-slate-800 dark:text-slate-100 sm:text-base lg:text-lg">
              {formatCurrency(analytics.avgAmount, 'SAR')}
            </span>
            <span className="hidden shrink-0 font-mono text-[10px] font-bold text-slate-400 sm:inline">
              إجمالي {analytics.count} سند
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
