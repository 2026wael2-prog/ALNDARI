import React from 'react';
import { Layers, Send, FileText, Wallet } from 'lucide-react';
import { formatCurrency } from '../../../core/utils';

interface PortalStatsGridProps {
  productsCount: number;
  rfqsCount: number;
  quotationsCount: number;
  totalQuotationsValue: number;
  currency?: string;
}

export const PortalStatsGrid: React.FC<PortalStatsGridProps> = ({
  productsCount,
  rfqsCount,
  quotationsCount,
  totalQuotationsValue,
  currency = 'SAR',
}) => {
  return (
    <div className="grid grid-cols-4 gap-1 sm:gap-3">
      {/* Approved Products */}
      <div className="flex min-w-0 items-center justify-between rounded-lg border border-slate-200 bg-[var(--app-surface)] p-1.5 shadow-sm dark:border-slate-800 sm:rounded-xl sm:p-3.5">
        <div className="min-w-0 space-y-0.5">
          <span className="block truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 sm:text-[11px] sm:font-medium">
            الأصناف
          </span>
          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white sm:text-xl">
            {productsCount}
          </span>
        </div>
        <div className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:flex">
          <Layers className="h-4 w-4" />
        </div>
      </div>

      {/* Active RFQs */}
      <div className="flex min-w-0 items-center justify-between rounded-lg border border-slate-200 bg-[var(--app-surface)] p-1.5 shadow-sm dark:border-slate-800 sm:rounded-xl sm:p-3.5">
        <div className="min-w-0 space-y-0.5">
          <span className="block truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 sm:text-[11px] sm:font-medium">
            طلبات التسعير
          </span>
          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white sm:text-xl">
            {rfqsCount}
          </span>
        </div>
        <div className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 sm:flex">
          <Send className="h-4 w-4" />
        </div>
      </div>

      {/* Submitted Quotes */}
      <div className="flex min-w-0 items-center justify-between rounded-lg border border-slate-200 bg-[var(--app-surface)] p-1.5 shadow-sm dark:border-slate-800 sm:rounded-xl sm:p-3.5">
        <div className="min-w-0 space-y-0.5">
          <span className="block truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 sm:text-[11px] sm:font-medium">
            العروض
          </span>
          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white sm:text-xl">
            {quotationsCount}
          </span>
        </div>
        <div className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 sm:flex">
          <FileText className="h-4 w-4" />
        </div>
      </div>

      {/* Total Value */}
      <div className="flex min-w-0 items-center justify-between rounded-lg border border-slate-200 bg-[var(--app-surface)] p-1.5 shadow-sm dark:border-slate-800 sm:rounded-xl sm:p-3.5">
        <div className="min-w-0 space-y-0.5">
          <span className="block truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 sm:text-[11px] sm:font-medium">
            قيمة العروض
          </span>
          <span className="block truncate font-mono text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400 sm:text-lg" dir="ltr">
            {formatCurrency(totalQuotationsValue, currency)}
          </span>
        </div>
        <div className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 sm:flex">
          <Wallet className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
};
