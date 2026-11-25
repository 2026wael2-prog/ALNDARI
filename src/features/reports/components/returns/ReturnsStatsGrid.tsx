import React from 'react';
import { RefreshCw, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { formatCurrency } from '../../../../core/utils';

interface Props {
  stats: {
    totalCount: number;
    totalAmount: number;
    salesCount: number;
    salesTotal: number;
    purchaseCount: number;
    purchaseTotal: number;
  };
}

const ReturnsStatsGrid: React.FC<Props> = ({ stats }) => {
  return (
    <div className="grid grid-cols-4 gap-1 sm:gap-3 lg:gap-4">
      <div className="min-w-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-1.5 shadow-sm sm:rounded-xl sm:p-4">
        <div className="mb-1 hidden items-start justify-between sm:mb-3 sm:flex">
          <div className="rounded-xl bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
            <RefreshCw size={18} />
          </div>
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600">
            إجمالي العمليات
          </span>
        </div>
        <div className="space-y-0.5">
          <p className="truncate text-[10px] font-bold text-slate-500 sm:text-xs sm:font-semibold">الإرجاعات</p>
          <h3 className="font-mono text-xs font-black tracking-tight text-slate-800 dark:text-white sm:text-2xl sm:font-bold">
            {stats.totalCount}
          </h3>
        </div>
        <div className="mt-1 border-t border-[var(--app-border)] pt-1 sm:mt-3 sm:pt-3">
          <span dir="ltr" className="block truncate font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400 sm:text-base">
            {formatCurrency(stats.totalAmount)}
          </span>
        </div>
      </div>

      <div className="min-w-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-1.5 shadow-sm sm:rounded-xl sm:p-4">
        <div className="mb-1 hidden items-start justify-between sm:mb-3 sm:flex">
          <div className="rounded-xl bg-rose-500/10 p-2 text-rose-600 dark:text-rose-400">
            <TrendingDown size={18} />
          </div>
          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600">
            صادر مبيعات
          </span>
        </div>
        <div className="space-y-0.5">
          <p className="truncate text-[10px] font-bold text-slate-500 sm:text-xs sm:font-semibold">م. المبيعات</p>
          <h3 className="font-mono text-xs font-black tracking-tight text-slate-800 dark:text-white sm:text-2xl sm:font-bold">
            {stats.salesCount}
          </h3>
        </div>
        <div className="mt-1 border-t border-[var(--app-border)] pt-1 sm:mt-3 sm:pt-3">
          <span dir="ltr" className="block truncate font-mono text-[10px] font-bold text-rose-600 dark:text-rose-400 sm:text-base">
            {formatCurrency(stats.salesTotal)}
          </span>
        </div>
      </div>

      <div className="min-w-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-1.5 shadow-sm sm:rounded-xl sm:p-4">
        <div className="mb-1 hidden items-start justify-between sm:mb-3 sm:flex">
          <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
            <TrendingUp size={18} />
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
            وارد مشتريات
          </span>
        </div>
        <div className="space-y-0.5">
          <p className="truncate text-[10px] font-bold text-slate-500 sm:text-xs sm:font-semibold">م. المشتريات</p>
          <h3 className="font-mono text-xs font-black tracking-tight text-slate-800 dark:text-white sm:text-2xl sm:font-bold">
            {stats.purchaseCount}
          </h3>
        </div>
        <div className="mt-1 border-t border-[var(--app-border)] pt-1 sm:mt-3 sm:pt-3">
          <span dir="ltr" className="block truncate font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400 sm:text-base">
            {formatCurrency(stats.purchaseTotal)}
          </span>
        </div>
      </div>

      <div className="min-w-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-1.5 shadow-sm sm:rounded-xl sm:p-4">
        <div className="mb-1 hidden items-start justify-between sm:mb-3 sm:flex">
          <div className="rounded-xl bg-purple-500/10 p-2 text-purple-600 dark:text-purple-400">
            <BarChart3 size={18} />
          </div>
          <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-600">
            متوسط القيمة
          </span>
        </div>
        <div className="space-y-0.5">
          <p className="truncate text-[10px] font-bold text-slate-500 sm:text-xs sm:font-semibold">المتوسط</p>
          <h3 dir="ltr" className="truncate text-right font-mono text-xs font-black tracking-tight text-slate-800 dark:text-white sm:text-2xl sm:font-bold">
            {
              formatCurrency(stats.totalCount > 0 ? stats.totalAmount / stats.totalCount : 0).split(
                ' '
              )[0]
            }
          </h3>
        </div>
        <div className="mt-1 border-t border-[var(--app-border)] pt-1 sm:mt-3 sm:pt-3">
          <span className="block truncate text-[10px] font-bold text-slate-400 sm:text-xs">لكل حركة</span>
        </div>
      </div>
    </div>
  );
};

export default ReturnsStatsGrid;
