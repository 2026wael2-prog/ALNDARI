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
  FileSpreadsheet,
  ListFilter,
  X,
} from 'lucide-react';
import { cn, formatCurrency } from '../../../../core/utils';
import type { PartyCurrencyBalance, PartyType } from '../../types';
import type { StatementSettlementFilter } from '../../hooks/useStatementController';

interface StatementToolbarProps {
  partyType?: PartyType;
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
  displayMode?: 'standard' | 'excel';
  onDisplayModeChange?: (mode: 'standard' | 'excel') => void;
}

const resolveBalanceDirLabel = (isSupplier: boolean, balance: number | undefined): string => {
  const isPositive = balance !== undefined && balance > 0;
  if (isSupplier) return isPositive ? 'له' : 'عليه';
  return isPositive ? 'عليه' : 'له';
};

export const StatementToolbar: React.FC<StatementToolbarProps> = ({
  partyType = 'customer',
  selectedCurrency,
  setSelectedCurrency,
  availableCurrencies,
  currencyBalances,
  searchQuery,
  setSearchQuery,
  settlementFilter,
  setSettlementFilter,
  settlementStats,
  displayMode,
  onDisplayModeChange,
}) => {
  const isSupplier = partyType === 'supplier';
  const balanceMap = React.useMemo(() => {
    const map = new Map<string, number>();
    (currencyBalances ?? []).forEach(b => {
      const code = (b.currency || 'SAR').toUpperCase();
      map.set(code, (map.get(code) ?? 0) + b.balance);
    });
    return map;
  }, [currencyBalances]);

  const filterChips: ReadonlyArray<{
    id: StatementSettlementFilter;
    label: string;
    count: number;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    activeClass: string;
    title: string;
  }> = [
    {
      id: 'unsettled',
      label: 'المتبقي وغير المسدد',
      count: settlementStats.unsettledCount,
      icon: Clock,
      activeClass: 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400/70',
      title: 'عرض المعاملات النشطة وغير المسددة فقط مع إخفاء الفواتير المسددة بالكامل',
    },
    {
      id: 'all',
      label: 'الكل',
      count: settlementStats.totalCount,
      icon: Layers,
      activeClass: 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900',
      title: 'عرض جميع الحركات بلا استثناء للتدقيق والمراجعة التاريخية الكاملة',
    },
    {
      id: 'partially_settled',
      label: 'جزئي',
      count: settlementStats.partiallySettledCount,
      icon: Clock,
      activeClass: 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-400/70',
      title: 'عرض الفواتير المسددة جزئياً والتي لا يزال عليها جزء متبقي',
    },
    {
      id: 'fully_settled',
      label: 'مسدد كلياً',
      count: settlementStats.fullySettledCount,
      icon: CheckCircle2,
      activeClass: 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400/70',
      title: 'عرض الفواتير المسددة كلياً بالكامل (خالصة)',
    },
    {
      id: 'credit',
      label: 'آجل',
      count: settlementStats.creditCount,
      icon: CreditCard,
      activeClass: 'bg-rose-600 text-white shadow-sm ring-1 ring-rose-400/70',
      title: 'عرض معاملات وفواتير الآجل فقط',
    },
    {
      id: 'cash',
      label: 'نقدي',
      count: settlementStats.cashCount,
      icon: Banknote,
      activeClass: 'bg-teal-600 text-white shadow-sm ring-1 ring-teal-400/70',
      title: 'عرض المعاملات والفواتير النقدية فقط',
    },
  ];

  return (
    <div className="no-print space-y-2">
      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2 shadow-sm md:p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Currency Pills */}
          <div className="no-scrollbar flex max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto">
            <span className="hidden text-[11px] font-bold text-slate-400 sm:inline">العملة:</span>
            <button
              type="button"
              onClick={() => setSelectedCurrency('ALL')}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-xl px-2.5 py-1 text-[11px] font-bold transition-all',
                selectedCurrency === 'ALL'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'border border-slate-200/80 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300'
              )}
            >
              جميع العملات
            </button>
            {availableCurrencies.map(curr => {
              const bal = balanceMap.get(curr.toUpperCase());
              const hasBal = typeof bal === 'number' && Math.abs(bal) > 0.01;
              const isActive = selectedCurrency === curr;
              const balanceDirLabel = resolveBalanceDirLabel(isSupplier, bal);

              return (
                <button
                  key={curr}
                  type="button"
                  onClick={() => setSelectedCurrency(curr)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-1 text-[11px] font-bold transition-all',
                    isActive
                      ? curr === 'YER'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-emerald-600 text-white shadow-sm'
                      : 'border border-slate-200/80 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200'
                  )}
                >
                  <span className="font-mono font-black">{curr}</span>
                  {hasBal && (
                    <span
                      dir="ltr"
                      className={cn(
                        'rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold',
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-white text-slate-700 shadow-2xs dark:bg-slate-700 dark:text-slate-100'
                      )}
                    >
                      {formatCurrency(Math.abs(bal), curr)} {balanceDirLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right cluster: Quick Table Search + Display Mode Switcher */}
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:flex-initial">
            <div className="relative min-w-[180px] flex-1 sm:w-56 sm:flex-initial">
              <Search
                size={13}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="بحث برقم الفاتورة أو البيان..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/90 py-1.5 pl-7 pr-8 text-xs font-medium text-slate-800 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-rose-500"
                  title="مسح البحث"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {displayMode && onDisplayModeChange && (
              <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/80 p-0.5 dark:border-slate-700 dark:bg-slate-900/70">
                <button
                  type="button"
                  onClick={() => onDisplayModeChange('excel')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all',
                    displayMode === 'excel'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  )}
                  title="عرض كشف الحساب كجدول إكسل Grid متطور"
                >
                  <FileSpreadsheet size={12} />
                  <span>إكسل Grid</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDisplayModeChange('standard')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all',
                    displayMode === 'standard'
                      ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  )}
                  title="العرض الكلاسيكي لكشف الحساب"
                >
                  <ListFilter size={12} />
                  <span>كلاسيكي</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modern Segmented Settlement & Payment Filters */}
        <div className="no-scrollbar mt-2 flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-2 dark:border-slate-800/80">
          <div className="hidden shrink-0 items-center gap-1 px-1 text-[11px] font-bold text-slate-400 sm:flex">
            <Filter size={12} />
            <span>التصفية:</span>
          </div>

          {filterChips.map(chip => {
            const Icon = chip.icon;
            const active = settlementFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setSettlementFilter(chip.id)}
                title={chip.title}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-1 text-[11px] font-bold transition-all',
                  active
                    ? chip.activeClass
                    : 'border border-slate-200/70 bg-slate-50/80 text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700/70 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800'
                )}
              >
                <Icon size={12} />
                <span>{chip.label}</span>
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 font-mono text-[10px] leading-none',
                    active
                      ? 'bg-black/20 text-white dark:bg-black/25'
                      : 'bg-slate-200/80 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                  )}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}

          {settlementFilter === 'unsettled' && settlementStats.fullySettledCount > 0 && (
            <button
              type="button"
              onClick={() => setSettlementFilter('all')}
              className="mr-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-bold text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <Eye size={12} />
              <span>إظهار {settlementStats.fullySettledCount} فاتورة مسددة</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
