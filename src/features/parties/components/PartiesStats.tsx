/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/no-unnecessary-condition */
import React from 'react';
import {
  Users,
  TrendingUp,
  TrendingDown,
  Wallet,
  Filter,
  RotateCcw,
  Coins,
  AlertTriangle,
} from 'lucide-react';
import type { PartyCurrencyFilter, PartyStats, PartyType } from '../types';
import { formatCurrency, formatNumberDisplay, cn } from '../../../core/utils';
import { useTranslation } from '../../../lib/hooks/useTranslation';
import type { PartyListStatusFilter } from '../services/partyStatementService';

export type PartyFilterType = PartyListStatusFilter;

interface Props {
  stats: PartyStats;
  type: PartyType;
  activeFilter?: PartyFilterType;
  onFilterChange?: (filter: PartyFilterType) => void;
  activeCurrencyFilter?: PartyCurrencyFilter;
  onCurrencyFilterChange?: (currency: PartyCurrencyFilter) => void;
  isFiltered?: boolean;
  onResetFilters?: () => void;
  showFilterControls?: boolean;
}

const CURRENCY_LABELS: Record<string, string> = {
  SAR: 'الريال السعودي (SAR)',
  YER: 'الريال اليمني (YER)',
  USD: 'الدولار الأمريكي (USD)',
  OMR: 'الريال العماني (OMR)',
};

const PartiesStats: React.FC<Props> = ({
  stats,
  type,
  activeFilter = 'all',
  onFilterChange,
  activeCurrencyFilter = 'ALL',
  onCurrencyFilterChange,
  isFiltered = false,
  onResetFilters,
  showFilterControls = true,
}) => {
  const { t } = useTranslation();

  // When filtered to a single currency (SAR or YER), show KPIs strictly in that currency!
  const focusedCurrencyStat =
    activeCurrencyFilter === 'SAR' || activeCurrencyFilter === 'YER'
      ? stats.byCurrency?.find(c => c.currency === activeCurrencyFilter)
      : undefined;

  const displayCurrency = focusedCurrencyStat?.currency ?? 'SAR';
  const totalRec = focusedCurrencyStat ? focusedCurrencyStat.receivable : (stats.totalReceivable ?? 0);
  const totalPay = focusedCurrencyStat ? focusedCurrencyStat.payable : (stats.totalPayable ?? 0);
  const totalNet = focusedCurrencyStat ? focusedCurrencyStat.balance : stats.totalBalance;

  const partyLabel =
    type === 'customer'
      ? t('total_customers')
      : type === 'employee'
        ? 'إجمالي الموظفين'
        : t('total_suppliers');

  const filterButtons: Array<{ id: PartyFilterType; label: string }> = [
    { id: 'all', label: 'الكل' },
    { id: 'debtors', label: type === 'customer' ? 'عليهم مديونية' : 'مدينون لنا' },
    { id: 'creditors', label: type === 'customer' ? 'لهم أرصدة دائنة' : 'مستحق للمورد' },
    { id: 'active', label: 'نشط' },
    { id: 'blocked', label: 'محظور' },
  ];

  const perCurrencyCards = (stats.byCurrency ?? []).filter(c => c.count > 0);

  return (
    <div className="mb-1.5 flex flex-col gap-1.5 md:mb-2">
      {/* Quick Filter Strip (Only when rendered standalone outside PartiesListView) */}
      {showFilterControls && onFilterChange && (
        <div className="hidden flex-wrap items-center justify-between gap-1.5 rounded-lg border border-slate-200/80 bg-white/80 px-2 py-1 shadow-2xs backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/80 md:flex">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
            <Filter size={12} className="text-blue-500" />
            <span>
              فلترة بطائق{' '}
              {type === 'customer' ? 'العملاء' : type === 'employee' ? 'الموظفين' : 'الموردين'}:
            </span>
            {isFiltered && (
              <span className="flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                <span>
                  مفلترة ({formatNumberDisplay(stats.totalCount)}
                  {activeCurrencyFilter !== 'ALL' ? ` • ${activeCurrencyFilter}` : ''})
                </span>
                {onResetFilters && (
                  <button
                    type="button"
                    onClick={onResetFilters}
                    title="إلغاء الفلترة"
                    className="hover:text-blue-900 dark:hover:text-blue-200"
                  >
                    <RotateCcw size={10} />
                  </button>
                )}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {filterButtons.map(btn => {
              const isSelected = activeFilter === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => onFilterChange(btn.id)}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[10px] font-bold transition-all',
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs dark:bg-blue-500'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                  )}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Compact Strict Per-Currency Separation Strips (SAR vs YER) */}
      {perCurrencyCards.length > 0 && (
        <div
          data-testid="parties-per-currency-cards"
          className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
        >
          {perCurrencyCards.map(cur => {
            const isSar = cur.currency === 'SAR';
            const isYer = cur.currency === 'YER';
            const isSelectedCurr = activeCurrencyFilter === cur.currency;
            const canToggle = Boolean(onCurrencyFilterChange && (isSar || isYer));

            return (
              <div
                key={cur.currency}
                onClick={() => {
                  if (canToggle && onCurrencyFilterChange) {
                    const target = cur.currency as 'SAR' | 'YER';
                    onCurrencyFilterChange(isSelectedCurr ? 'ALL' : target);
                  }
                }}
                className={cn(
                  'flex min-w-0 flex-wrap items-center justify-between gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 shadow-2xs transition-all dark:bg-slate-900',
                  canToggle && 'cursor-pointer hover:shadow-sm',
                  isSelectedCurr
                    ? isYer
                      ? 'border-amber-500 ring-1 ring-amber-500/30 dark:border-amber-400'
                      : 'border-emerald-500 ring-1 ring-emerald-500/30 dark:border-emerald-400'
                    : isYer
                      ? 'border-amber-200/80 hover:border-amber-300 dark:border-amber-900/40'
                      : 'border-emerald-200/80 hover:border-emerald-300 dark:border-emerald-900/40'
                )}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <div
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md',
                      isYer
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    )}
                  >
                    <Coins size={11} />
                  </div>
                  <span className="truncate text-[11px] font-black text-slate-900 dark:text-slate-100">
                    {CURRENCY_LABELS[cur.currency] ?? cur.currency}
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {formatNumberDisplay(cur.count)}
                  </span>
                  {isSelectedCurr && (
                    <span className="shrink-0 rounded-full bg-blue-600 px-1.5 py-0.2 text-[9px] font-black text-white">
                      مُفعّل
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1 text-[10px]">
                  <div className="flex items-center gap-1 rounded bg-emerald-50/80 px-1.5 py-0.5 dark:bg-emerald-950/30">
                    <span className="font-bold text-emerald-700 dark:text-emerald-300">
                      {type === 'supplier' ? 'لنا' : 'مدين'}:
                    </span>
                    <span dir="ltr" className="font-mono font-black text-emerald-800 dark:text-emerald-200">
                      {formatCurrency(cur.receivable, cur.currency)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 rounded bg-rose-50/80 px-1.5 py-0.5 dark:bg-rose-950/30">
                    <span className="font-bold text-rose-700 dark:text-rose-300">
                      {type === 'supplier' ? 'علينا' : 'دائن'}:
                    </span>
                    <span dir="ltr" className="font-mono font-black text-rose-800 dark:text-rose-200">
                      {formatCurrency(cur.payable, cur.currency)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 rounded bg-slate-100/90 px-1.5 py-0.5 dark:bg-slate-800/80">
                    <span className="font-bold text-slate-600 dark:text-slate-300">صافي:</span>
                    <span
                      dir="ltr"
                      className={cn(
                        'font-mono font-black',
                        cur.balance >= 0
                          ? 'text-slate-900 dark:text-white'
                          : 'text-rose-600 dark:text-rose-400'
                      )}
                    >
                      {formatCurrency(cur.balance, cur.currency)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4 Compact Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {/* Card 1: Count & Status */}
        <div
          onClick={() => {
            if (onFilterChange) {
              if (activeFilter === 'all') onFilterChange('active');
              else if (activeFilter === 'active') onFilterChange('blocked');
              else onFilterChange('all');
            }
          }}
          className={cn(
            'group relative min-w-0 overflow-hidden rounded-lg border bg-white px-2.5 py-1.5 shadow-2xs transition-all dark:bg-slate-900',
            onFilterChange && 'cursor-pointer hover:shadow-sm',
            activeFilter === 'active' || activeFilter === 'blocked'
              ? 'border-blue-500 ring-1 ring-blue-500/25 dark:border-blue-400'
              : 'border-slate-200/80 hover:border-slate-300 dark:border-slate-800'
          )}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-[10px] font-bold text-slate-500 dark:text-slate-400">
              {partyLabel}
            </span>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <Users size={11} />
            </div>
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-1">
            <span className="font-mono text-sm font-black tracking-tight text-slate-900 dark:text-white md:text-base">
              {formatNumberDisplay(stats.totalCount)}
            </span>
            <div className="flex items-center gap-1 text-[9.5px] font-bold">
              <span className="text-emerald-600 dark:text-emerald-400">
                {formatNumberDisplay(stats.activeCount)} نشط
              </span>
              {stats.blockedCount > 0 && (
                <span className="text-rose-600 dark:text-rose-400">
                  • {formatNumberDisplay(stats.blockedCount)} محظور
                </span>
              )}
              {(stats.mixedCurrencyCount ?? 0) > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400"
                  title="أطراف متعددة العملات"
                >
                  <AlertTriangle size={9} />
                  {formatNumberDisplay(stats.mixedCurrencyCount ?? 0)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Receivables (لنا) */}
        <div
          onClick={() => {
            if (onFilterChange) {
              onFilterChange(activeFilter === 'debtors' ? 'all' : 'debtors');
            }
          }}
          className={cn(
            'group relative min-w-0 overflow-hidden rounded-lg border bg-emerald-50/40 px-2.5 py-1.5 shadow-2xs transition-all dark:bg-emerald-950/20',
            onFilterChange && 'cursor-pointer hover:shadow-sm',
            activeFilter === 'debtors'
              ? 'border-emerald-500 ring-1 ring-emerald-500/25 dark:border-emerald-400'
              : 'border-emerald-200/70 hover:border-emerald-300 dark:border-emerald-900/40'
          )}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
              {type === 'customer'
                ? 'مستحقات لنا'
                : type === 'employee'
                  ? 'سلف لنا'
                  : 'دفعات مقدمة'}
              {focusedCurrencyStat ? ` (${displayCurrency})` : ''}
            </span>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
              <TrendingUp size={11} />
            </div>
          </div>
          <div className="mt-0.5">
            <span
              dir="ltr"
              className="block truncate text-right font-mono text-sm font-black tracking-tight text-emerald-700 dark:text-emerald-300 md:text-base"
            >
              {formatCurrency(totalRec, displayCurrency)}
            </span>
          </div>
        </div>

        {/* Card 3: Payables (علينا / دائن) */}
        <div
          onClick={() => {
            if (onFilterChange) {
              onFilterChange(activeFilter === 'creditors' ? 'all' : 'creditors');
            }
          }}
          className={cn(
            'group relative min-w-0 overflow-hidden rounded-lg border bg-amber-50/40 px-2.5 py-1.5 shadow-2xs transition-all dark:bg-amber-950/20',
            onFilterChange && 'cursor-pointer hover:shadow-sm',
            activeFilter === 'creditors'
              ? 'border-amber-500 ring-1 ring-amber-500/25 dark:border-amber-400'
              : 'border-amber-200/70 hover:border-amber-300 dark:border-amber-900/40'
          )}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-[10px] font-bold text-amber-800 dark:text-amber-300">
              {type === 'customer'
                ? 'دائن / أمانات'
                : type === 'employee'
                  ? 'مستحقات'
                  : 'علينا'}
              {focusedCurrencyStat ? ` (${displayCurrency})` : ''}
            </span>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              <TrendingDown size={11} />
            </div>
          </div>
          <div className="mt-0.5">
            <span
              dir="ltr"
              className="block truncate text-right font-mono text-sm font-black tracking-tight text-amber-700 dark:text-amber-300 md:text-base"
            >
              {formatCurrency(totalPay, displayCurrency)}
            </span>
          </div>
        </div>

        {/* Card 4: Net Balance */}
        <div
          onClick={() => {
            if (onFilterChange && onResetFilters) {
              onResetFilters();
            }
          }}
          className={cn(
            'group relative min-w-0 overflow-hidden rounded-lg border bg-white px-2.5 py-1.5 shadow-2xs transition-all dark:bg-slate-900',
            onFilterChange && 'cursor-pointer hover:shadow-sm',
            activeFilter === 'all' && !isFiltered
              ? 'border-indigo-500 ring-1 ring-indigo-500/25 dark:border-indigo-400'
              : 'border-slate-200/80 hover:border-slate-300 dark:border-slate-800'
          )}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-[10px] font-bold text-slate-500 dark:text-slate-400">
              {focusedCurrencyStat ? `صافي (${displayCurrency})` : 'صافي الرصيد'}
            </span>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
              <Wallet size={11} />
            </div>
          </div>
          <div className="mt-0.5">
            <span
              dir="ltr"
              className={cn(
                'block truncate text-right font-mono text-sm font-black tracking-tight md:text-base',
                totalNet >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              )}
            >
              {formatCurrency(totalNet, displayCurrency)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartiesStats;
