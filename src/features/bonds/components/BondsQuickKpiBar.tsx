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
    <div className="hidden flex-col gap-1.5 px-3 pb-1 pt-3 md:flex md:px-5">
      {isFiltered && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-1 text-[11px] text-blue-700 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300">
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="text-blue-600 dark:text-blue-400" />
            <span className="font-semibold">
              البطائق الإحصائية تعكس التصفية الحالية ({analytics.count} سند معروض)
            </span>
          </div>
          {onResetFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-blue-600 hover:bg-blue-100 hover:text-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/40"
            >
              <RotateCcw size={10} />
              إلغاء التصفية
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Total Receipts Card */}
        <div
          className={cn(
            'rounded-2xl border bg-white p-3.5 shadow-sm transition-all dark:bg-slate-900',
            isFiltered
              ? 'border-emerald-200 ring-1 ring-emerald-400/20 dark:border-emerald-800'
              : 'border-emerald-100 dark:border-emerald-900/30'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
              إجمالي المقبوضات
            </span>
            <div className="rounded-lg bg-emerald-50 p-1 text-emerald-600 dark:bg-emerald-900/30">
              <ArrowDownCircle size={15} />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-lg font-black text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totals.receiptAmount, 'SAR')}
            </span>
            <span className="font-mono text-[10px] font-bold text-slate-400">
              {totals.receiptCount} سند
            </span>
          </div>
        </div>

        {/* Total Payments Card */}
        <div
          className={cn(
            'rounded-2xl border bg-white p-3.5 shadow-sm transition-all dark:bg-slate-900',
            isFiltered
              ? 'border-rose-200 ring-1 ring-rose-400/20 dark:border-rose-800'
              : 'border-rose-100 dark:border-rose-900/30'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400">
              إجمالي المدفوعات
            </span>
            <div className="rounded-lg bg-rose-50 p-1 text-rose-600 dark:bg-rose-900/30">
              <ArrowUpCircle size={15} />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-lg font-black text-rose-600 dark:text-rose-400">
              {formatCurrency(totals.paymentAmount, 'SAR')}
            </span>
            <span className="font-mono text-[10px] font-bold text-slate-400">
              {totals.paymentCount} سند
            </span>
          </div>
        </div>

        {/* Net Cash Flow Card */}
        <div
          className={cn(
            'rounded-2xl border bg-white p-3.5 shadow-sm transition-all dark:bg-slate-900',
            isFiltered
              ? 'border-blue-200 ring-1 ring-blue-400/20 dark:border-blue-800'
              : 'border-blue-100 dark:border-blue-900/30'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400">
              صافي تدفق السيولة
            </span>
            <div className="rounded-lg bg-blue-50 p-1 text-blue-600 dark:bg-blue-900/30">
              <Wallet size={15} />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span
              className={cn(
                'font-mono text-lg font-black',
                totals.netAmount >= 0
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-amber-600 dark:text-amber-400'
              )}
            >
              {formatCurrency(totals.netAmount, 'SAR')}
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {totals.netAmount >= 0 ? 'فائض نقدي' : 'عجز نقدي'}
            </span>
          </div>
        </div>

        {/* Average Bond Amount */}
        <div
          className={cn(
            'rounded-2xl border bg-white p-3.5 shadow-sm transition-all dark:bg-slate-900',
            isFiltered
              ? 'border-slate-300 ring-1 ring-slate-400/20 dark:border-slate-700'
              : 'border-slate-200 dark:border-slate-800'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">متوسط قيمة السند</span>
            <div className="rounded-lg bg-indigo-50 p-1 text-indigo-600 dark:bg-indigo-900/30">
              <Activity size={15} />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-lg font-black text-slate-800 dark:text-slate-100">
              {formatCurrency(analytics.avgAmount, 'SAR')}
            </span>
            <span className="font-mono text-[10px] font-bold text-slate-400">
              إجمالي {analytics.count} سند
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
