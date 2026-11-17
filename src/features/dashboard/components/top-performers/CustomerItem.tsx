import React from 'react';
import { cn, formatCurrency } from '../../../../core/utils';
import type { TopCustomer } from './types';

interface CustomerItemProps {
  customer: TopCustomer;
  index: number;
  maxTotal: number;
}

const getCustomerRankBadgeClass = (index: number): string => {
  if (index === 0) return 'border-blue-500/40 bg-blue-500/20 text-blue-400';
  if (index === 1) return 'border-slate-400/20 bg-slate-700/50 text-slate-300';
  if (index === 2) return 'border-indigo-500/30 bg-indigo-900/25 text-indigo-400';
  return 'border-white/10 bg-slate-800/40 text-slate-400';
};

export const CustomerItem = React.memo(({ customer, index, maxTotal }: CustomerItemProps) => {
  const percentage = maxTotal > 0 ? (customer.total / maxTotal) * 100 : 0;

  return (
    <div className="group/item border-[var(--app-border)]/50 bg-[var(--app-surface)]/60 relative flex items-center justify-between overflow-hidden rounded-2xl border p-3.5 transition-all hover:border-blue-500/30 hover:bg-white/5 max-md:p-2.5">
      {/* Progress Bar Background */}
      <div
        className="absolute bottom-0 right-0 top-0 bg-gradient-to-l from-blue-500/15 via-blue-500/5 to-transparent transition-all duration-1000 ease-out"
        style={{ width: `${percentage.toString()}%` }}
      />

      <div className="relative z-10 flex min-w-0 flex-1 items-center gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-black shadow-inner backdrop-blur-md sm:h-10 sm:w-10 sm:text-sm',
            getCustomerRankBadgeClass(index)
          )}
        >
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-[var(--app-text)] transition-colors group-hover/item:text-blue-400 sm:text-sm">
            {customer.name}
          </p>
          <p className="mt-0.5 font-mono text-xs text-[var(--app-text-secondary)]">
            {customer.invoices} <span className="font-sans text-xs">فاتورة / طلبية</span>
          </p>
        </div>
      </div>

      <span className="relative z-10 mr-2 shrink-0 font-mono text-sm font-bold text-blue-500 sm:text-base">
        {formatCurrency(customer.total)}
      </span>
    </div>
  );
});
