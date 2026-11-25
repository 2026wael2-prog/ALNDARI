/* eslint-disable max-lines-per-function, @typescript-eslint/no-confusing-void-expression */
import React from 'react';
import {
  Search,
  CheckCircle2,
  Clock,
  Layers,
  Filter,
  CreditCard,
  Banknote,
  Eye,
} from 'lucide-react';
import { cn, formatCurrency } from '../../../../core/utils';
import type { PartyCurrencyBalance } from '../../types';
import type { StatementSettlementFilter } from '../../hooks/useStatementController';

interface StatementToolbarProps {
  selectedCurrency: string;
  setSelectedCurrency: (curr: string) => void;
  availableCurrencies: string[];
  currencyBalances?: PartyCurrencyBalance[] | undefined;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  settlementFilter: StatementSettlementFilter;
  setSettlementFilter: (filter: StatementSettlementFilter) => void;
  settlementStats: {
    totalCount: number;
    unsettledCount: number;
    fullySettledCount: number;
    partiallySettledCount: number;
    creditCount: number;
    cashCount: number;
  };
}

export const StatementToolbar: React.FC<StatementToolbarProps> = ({
  selectedCurrency,
  setSelectedCurrency,
  availableCurrencies,
  currencyBalances,
  searchQuery,
  setSearchQuery,
  settlementFilter,
  setSettlementFilter,
  settlementStats,
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
    <div className="no-print space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2 shadow-sm md:gap-3 md:rounded-2xl md:p-3">
        {/* Currency Tabs */}
        <div className="no-scrollbar flex w-full flex-nowrap items-center gap-1.5 overflow-x-auto sm:w-auto sm:flex-wrap md:gap-2">
          <span className="hidden text-xs font-bold text-slate-500 dark:text-slate-400 sm:inline">
            العملة:
          </span>
          <button
            type="button"
            onClick={() => setSelectedCurrency('ALL')}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all md:rounded-xl md:px-3 md:py-1.5 md:text-xs',
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
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all md:rounded-xl md:px-3 md:py-1.5 md:text-xs',
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

      {/* Advanced Settlement & Payment Filters */}
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-1.5 shadow-sm md:rounded-2xl md:p-2">
        <div className="hidden items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 sm:flex px-2">
          <Filter size={12} className="text-slate-400" />
          <span>تصفية العمليات:</span>
        </div>

        {/* 1. Unsettled (Default - Hide fully paid) */}
        <button
          type="button"
          onClick={() => setSettlementFilter('unsettled')}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all md:px-3 md:py-1',
            settlementFilter === 'unsettled'
              ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
          )}
          title="عرض المعاملات النشطة وغير المسددة فقط مع إخفاء الفواتير المسددة بالكامل"
        >
          <Clock size={12} />
          <span>المتبقي وغير المسدد</span>
          <span className="rounded-md bg-black/15 px-1 font-mono text-[10px] dark:bg-white/20">
            {settlementStats.unsettledCount}
          </span>
        </button>

        {/* 2. All Transactions (Full Audit) */}
        <button
          type="button"
          onClick={() => setSettlementFilter('all')}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all md:px-3 md:py-1',
            settlementFilter === 'all'
              ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-600 dark:bg-slate-200 dark:text-slate-900'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
          )}
          title="عرض جميع الحركات بلا استثناء للتدقيق والمراجعة التاريخية الكاملة"
        >
          <Layers size={12} />
          <span>عرض الكل (سجل المراجعة)</span>
          <span className="rounded-md bg-black/15 px-1 font-mono text-[10px] dark:bg-white/20">
            {settlementStats.totalCount}
          </span>
        </button>

        {/* 3. Partially Settled */}
        <button
          type="button"
          onClick={() => setSettlementFilter('partially_settled')}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all md:px-3 md:py-1',
            settlementFilter === 'partially_settled'
              ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-400'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
          )}
          title="عرض الفواتير المسددة جزئياً والتي لا يزال عليها جزء متبقي"
        >
          <Clock size={12} className="text-amber-300" />
          <span>مسدد جزئياً</span>
          <span className="rounded-md bg-black/15 px-1 font-mono text-[10px] dark:bg-white/20">
            {settlementStats.partiallySettledCount}
          </span>
        </button>

        {/* 4. Fully Settled */}
        <button
          type="button"
          onClick={() => setSettlementFilter('fully_settled')}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all md:px-3 md:py-1',
            settlementFilter === 'fully_settled'
              ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
          )}
          title="عرض الفواتير المسددة كلياً بالكامل (خالصة)"
        >
          <CheckCircle2 size={12} className="text-emerald-300" />
          <span>مسدد كلياً</span>
          <span className="rounded-md bg-black/15 px-1 font-mono text-[10px] dark:bg-white/20">
            {settlementStats.fullySettledCount}
          </span>
        </button>

        {/* 5. Credit (آجل) */}
        <button
          type="button"
          onClick={() => setSettlementFilter('credit')}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all md:px-3 md:py-1',
            settlementFilter === 'credit'
              ? 'bg-rose-600 text-white shadow-sm ring-1 ring-rose-400'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
          )}
          title="عرض معاملات وفواتير الآجل فقط"
        >
          <CreditCard size={12} />
          <span>آجل</span>
          <span className="rounded-md bg-black/15 px-1 font-mono text-[10px] dark:bg-white/20">
            {settlementStats.creditCount}
          </span>
        </button>

        {/* 6. Cash (نقدي) */}
        <button
          type="button"
          onClick={() => setSettlementFilter('cash')}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all md:px-3 md:py-1',
            settlementFilter === 'cash'
              ? 'bg-teal-600 text-white shadow-sm ring-1 ring-teal-400'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
          )}
          title="عرض المعاملات والفواتير النقدية فقط"
        >
          <Banknote size={12} />
          <span>نقدي</span>
          <span className="rounded-md bg-black/15 px-1 font-mono text-[10px] dark:bg-white/20">
            {settlementStats.cashCount}
          </span>
        </button>
      </div>

      {/* Helpful notification banner when fully paid invoices are hidden */}
      {settlementFilter === 'unsettled' && settlementStats.fullySettledCount > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-1.5 text-xs text-emerald-900 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
            <span>
              تم إخفاء{' '}
              <strong className="font-bold">{settlementStats.fullySettledCount}</strong> فاتورة
              مسددة كلياً تلقائياً لتبسيط متابعة المديونية المتبقية.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSettlementFilter('all')}
            className="inline-flex items-center gap-1 font-bold text-blue-700 hover:underline dark:text-blue-400"
          >
            <Eye size={12} />
            <span>عرض الكل للمراجعة</span>
          </button>
        </div>
      )}
    </div>
  );
};
