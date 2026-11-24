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
    <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">فصل العملة:</span>
        <button
          type="button"
          onClick={() => setSelectedCurrency('ALL')}
          className={cn(
            'rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all',
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
                'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all',
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
      <div className="relative min-w-[220px]">
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="بحث برقم المرجع أو البيان..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-3 pr-8 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-800 dark:bg-slate-900"
        />
      </div>
    </div>
  );
};
