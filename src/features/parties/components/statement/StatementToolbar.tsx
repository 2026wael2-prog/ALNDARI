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
    <div className="no-print shrink-0">
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          {/* Currency Pills + Compact Settlement Filter Chips in one ultra-compact top bar */}
          <div className="no-scrollbar flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedCurrency('ALL')}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-bold transition-all',
                selectedCurrency === 'ALL'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'border border-slate-200/80 bg-slate-50 text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200'
              )}
            >
              العملات
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
                    'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-bold transition-all',
                    isActive
                      ? curr === 'YER'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-emerald-600 text-white shadow-2xs'
                      : 'border border-slate-200/80 bg-slate-50 text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200'
                  )}
                >
                  <span className="font-mono font-black">{curr}</span>
                  {hasBal && (
                    <span
                      dir="ltr"
                      className={cn(
                        'rounded px-1 py-0.5 font-mono text-[10px] font-bold leading-none',
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-white text-black shadow-2xs dark:bg-slate-700 dark:text-slate-100'
                      )}
                    >
                      {formatCurrency(Math.abs(bal), curr)} {balanceDirLabel}
                    </span>
                  )}
                </button>
              );
            })}

            <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />

            <Filter size={11} className="hidden shrink-0 text-slate-500 xl:block" />

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
                    'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-bold transition-all',
                    active
                      ? chip.activeClass
                      : 'border border-slate-200/70 bg-slate-50/80 text-black hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700/70 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800'
                  )}
                >
                  <Icon size={11} />
                  <span>{chip.label}</span>
                  <span
                    className={cn(
                      'rounded px-1 py-0.5 font-mono text-[10px] leading-none',
                      active
                        ? 'bg-black/20 text-white dark:bg-black/25'
                        : 'bg-slate-200/90 text-black dark:bg-slate-700 dark:text-slate-100'
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
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-900 transition-colors hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                <Eye size={11} />
                <span>+{settlementStats.fullySettledCount} مسددة</span>
              </button>
            )}
          </div>

          {/* Right cluster: Compact Table Search + Display Mode Switcher */}
          <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5 sm:flex-initial">
            <div className="relative min-w-[155px] flex-1 sm:w-48 sm:flex-initial">
              <Search
                size={12}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                placeholder="بحث برقم أو بيان..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/90 py-1 pl-6 pr-7 text-[11px] font-bold text-black transition-all focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-rose-600"
                  title="مسح البحث"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {displayMode && onDisplayModeChange && (
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-slate-100/80 p-0.5 dark:border-slate-700 dark:bg-slate-900/70">
                <button
                  type="button"
                  onClick={() => onDisplayModeChange('excel')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold transition-all',
                    displayMode === 'excel'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-black hover:bg-white/70 dark:text-slate-300 dark:hover:text-white'
                  )}
                  title="عرض كشف الحساب كجدول إكسل Grid"
                >
                  <FileSpreadsheet size={11} />
                  <span>إكسل</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDisplayModeChange('standard')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold transition-all',
                    displayMode === 'standard'
                      ? 'bg-white text-blue-700 shadow-2xs dark:bg-slate-800 dark:text-blue-300'
                      : 'text-black hover:bg-white/70 dark:text-slate-300 dark:hover:text-white'
                  )}
                  title="العرض الكلاسيكي لكشف الحساب"
                >
                  <ListFilter size={11} />
                  <span>كلاسيكي</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
