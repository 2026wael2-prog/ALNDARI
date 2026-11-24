/* eslint-disable max-lines-per-function, @typescript-eslint/no-confusing-void-expression */
import React from 'react';
import { Search } from 'lucide-react';
import { cn, formatCurrency } from '../../../../core/utils';
import type { PartyCurrencyBalance } from '../../types';

interface StatementToolbarProps {
  selectedCurrency: string;
  setSelectedCurrency: (curr: string) => void;
  availableCurrencies: string[];
  currencyBalances?: PartyCurrencyBalance[] | undefined;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const StatementToolbar: React.FC<StatementToolbarProps> = ({
  selectedCurrency,
  setSelectedCurrency,
  availableCurrencies,
  currencyBalances,
  searchQuery,
  setSearchQuery,
}) => {
  const balanceMap = React.useMemo(() => {
    const map = new Map<string, number>();
    (currencyBalances ?? []).forEach(b => {
      const code = (b.currency || 'SAR').toUpperCase();
      map.set(code, (map.get(code) ?? 0) + (Number(b.balance) || 0));
    });
    return map;
  }, [currencyBalances]);

  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2 shadow-sm md:gap-3 md:rounded-2xl md:p-3">
      <div className="no-scrollbar flex w-full flex-nowrap items-center gap-1.5 overflow-x-auto sm:w-auto sm:flex-wrap md:gap-2">
        <span className="hidden text-xs font-bold text-slate-500 dark:text-slate-400 sm:inline">فصل العملة:</span>
        <button
          type="button"
          onClick={() => setSelectedCurrency('ALL')}
          className={cn(
            'shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all md:rounded-xl md:px-3.5 md:py-1.5 md:text-xs',
            selectedCurrency === 'ALL'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
          )}
        >
          جميع العملات
        </button>
        {availableCurrencies.map(curr => {
          const bal = balanceMap.get(curr.toUpperCase());
          const hasBal = typeof bal === 'number' && Math.abs(bal) > 0.01;
          const isActive = selectedCurrency === curr;
          return (
            <button
              key={curr}
              type="button"
              onClick={() => setSelectedCurrency(curr)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all md:rounded-xl md:px-3.5 md:py-1.5 md:text-xs',
                isActive
                  ? curr === 'YER'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              )}
            >
              <span className="font-mono font-black">{curr}</span>
              {hasBal && (
                <span
                  dir="ltr"
                  className={cn(
                    'rounded-md px-1.5 py-0.2 font-mono text-[10px]',
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-white/80 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                  )}
                >
                  {formatCurrency(Math.abs(bal), curr)} {bal > 0 ? 'عليه' : 'له'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Quick Search inside Table */}
      <div className="relative w-full min-w-0 sm:w-56">
        <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="بحث برقم المرجع أو البيان..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-8 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-800 dark:bg-slate-900 md:rounded-xl md:py-1.5"
        />
      </div>
    </div>
  );
};
