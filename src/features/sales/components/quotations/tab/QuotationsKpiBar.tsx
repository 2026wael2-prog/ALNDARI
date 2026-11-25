import React from 'react';
import { AlertTriangle, Coins, FileText, Hourglass, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/core/utils';
import { currencyBadgeStyle, type QuotationTabStats } from './quotationsTabHelpers';

interface QuotationsKpiBarProps {
  stats: QuotationTabStats;
}

export const QuotationsKpiBar: React.FC<QuotationsKpiBarProps> = ({ stats }) => (
  <div className="grid grid-cols-4 gap-1 sm:gap-3">
    <div className="min-w-0 rounded-lg border border-slate-200/80 bg-[var(--app-surface)] p-1.5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 sm:rounded-2xl sm:p-3.5">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 sm:text-[11px]">
          إجمالي العروض
        </span>
        <div className="hidden rounded-xl bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 sm:block">
          <FileText size={15} />
        </div>
      </div>
      <div className="mt-1 flex items-baseline gap-1 sm:mt-2 sm:gap-2">
        <span className="font-mono text-sm font-black text-slate-900 dark:text-white sm:text-2xl">
          {stats.totalCount}
        </span>
        <span className="hidden text-[11px] font-medium text-slate-400 sm:inline">عرض مسجّل</span>
      </div>
    </div>

    <div className="min-w-0 rounded-lg border border-slate-200/80 bg-[var(--app-surface)] p-1.5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 sm:rounded-2xl sm:p-3.5">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 sm:text-[11px]">
          قيد الانتظار
        </span>
        <div className="hidden rounded-xl bg-amber-50 p-2 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 sm:block">
          <Hourglass size={15} />
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1 sm:mt-2 sm:gap-2">
        <span className="font-mono text-sm font-black text-slate-900 dark:text-white sm:text-2xl">
          {stats.awaitingCount}
        </span>
        {stats.expiringSoonCount > 0 && (
          <span className="hidden items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 sm:inline-flex">
            <AlertTriangle size={10} />
            {stats.expiringSoonCount} ينتهي قريباً
          </span>
        )}
      </div>
    </div>

    <div className="min-w-0 rounded-lg border border-slate-200/80 bg-[var(--app-surface)] p-1.5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 sm:rounded-2xl sm:p-3.5">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 sm:text-[11px]">
          مقبولة
        </span>
        <div className="hidden rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 sm:block">
          <TrendingUp size={15} />
        </div>
      </div>
      <div className="mt-1 flex items-baseline gap-1 sm:mt-2 sm:gap-2">
        <span className="font-mono text-sm font-black text-slate-900 dark:text-white sm:text-2xl">
          {stats.wonCount}
        </span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          {stats.conversionRate}% نجاح
        </span>
      </div>
    </div>

    <div className="min-w-0 rounded-lg border border-slate-200/80 bg-[var(--app-surface)] p-1.5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 sm:rounded-2xl sm:p-3.5">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 sm:text-[11px]">
          قيمة العروض النشطة
        </span>
        <div className="hidden rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 sm:block">
          <Coins size={15} />
        </div>
      </div>
      <div className="mt-1 space-y-1 sm:mt-1.5">
        {stats.currencyTotals.length === 0 ? (
          <span className="font-mono text-sm font-black text-slate-400 sm:text-xl" dir="ltr">
            0
          </span>
        ) : (
          stats.currencyTotals.slice(0, 3).map(([curr, total]) => (
            <div key={curr} className="flex items-center justify-between gap-1 sm:gap-2">
              <span
                className={`shrink-0 rounded px-1 py-0.5 font-mono text-[10px] font-bold sm:px-1.5 ${currencyBadgeStyle(curr)}`}
              >
                {curr}
              </span>
              <span
                title={formatCurrency(total, curr)}
                className="min-w-0 break-words text-left font-mono text-[10.5px] font-black leading-tight text-slate-900 dark:text-white sm:text-sm"
                dir="ltr"
              >
                {formatCurrency(total, curr)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  </div>
);
