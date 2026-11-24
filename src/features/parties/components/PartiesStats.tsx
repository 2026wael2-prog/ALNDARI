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
    <div className="mb-4 flex flex-col gap-2.5">
      {/* Quick Filter Strip for Party Cards */}
      {showFilterControls && onFilterChange && (
        <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-1.5 shadow-2xs backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
            <Filter size={13} className="text-blue-500" />
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
                    'rounded-lg px-2 py-0.5 text-[10px] font-bold transition-all',
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

      {/* Dedicated Strict Per-Currency Separation Cards (SAR vs YER — never silently mixed!) */}
      {perCurrencyCards.length > 0 && (
        <div
          data-testid="parties-per-currency-cards"
          className="grid grid-cols-1 gap-2.5 md:grid-cols-2"
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
                  'rounded-xl border bg-white p-3.5 shadow-sm transition-all dark:bg-slate-900',
                  canToggle && 'cursor-pointer hover:shadow-md',
                  isSelectedCurr
                    ? isYer
                      ? 'border-amber-500 ring-2 ring-amber-500/20 dark:border-amber-400'
                      : 'border-emerald-500 ring-2 ring-emerald-500/20 dark:border-emerald-400'
                    : isYer
                      ? 'border-amber-200/70 hover:border-amber-300 dark:border-amber-900/40'
                      : 'border-emerald-200/70 hover:border-emerald-300 dark:border-emerald-900/40'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-lg',
                        isYer
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      )}
                    >
                      <Coins size={15} />
                    </div>
                    <div>
                      <div className="text-xs font-black text-slate-800 dark:text-slate-100">
                        حسابات {CURRENCY_LABELS[cur.currency] ?? cur.currency}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400">
                        {formatNumberDisplay(cur.count)} حساب نشط بهذه العملة (فصل مستقل)
                      </div>
                    </div>
                  </div>
                  {isSelectedCurr && (
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">
                      مُفعّل
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                  <div className="rounded-lg bg-emerald-50/70 p-2 dark:bg-emerald-950/20">
                    <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                      {type === 'supplier' ? 'لنا (مدين)' : 'لنا على العملاء'} (
                      {formatNumberDisplay(cur.debtorCount)})
                    </div>
                    <div
                      dir="ltr"
                      className="mt-0.5 truncate font-mono text-sm font-black text-emerald-700 dark:text-emerald-300"
                    >
                      {formatCurrency(cur.receivable, cur.currency)}
                    </div>
                  </div>

                  <div className="rounded-lg bg-rose-50/70 p-2 dark:bg-rose-950/20">
                    <div className="text-[10px] font-bold text-rose-700 dark:text-rose-300">
                      {type === 'supplier' ? 'علينا للموردين' : 'لهم (دائن)'} (
                      {formatNumberDisplay(cur.creditorCount)})
                    </div>
                    <div
                      dir="ltr"
                      className="mt-0.5 truncate font-mono text-sm font-black text-rose-700 dark:text-rose-300"
                    >
                      {formatCurrency(cur.payable, cur.currency)}
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      صافي {cur.currency}
                    </div>
                    <div
                      dir="ltr"
                      className={cn(
                        'mt-0.5 truncate font-mono text-sm font-black',
                        cur.balance >= 0
                          ? 'text-slate-900 dark:text-white'
                          : 'text-rose-600 dark:text-rose-400'
                      )}
                    >
                      {formatCurrency(cur.balance, cur.currency)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4 Summary Cards Grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
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
            'group relative overflow-hidden rounded-xl border bg-white p-3.5 shadow-sm transition-all dark:bg-slate-900',
            onFilterChange && 'cursor-pointer hover:shadow-md',
            activeFilter === 'active' || activeFilter === 'blocked'
              ? 'border-blue-500 ring-2 ring-blue-500/20 dark:border-blue-400'
              : 'border-slate-200/80 hover:border-slate-300 dark:border-slate-800'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              {partyLabel}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <Users size={15} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {formatNumberDisplay(stats.totalCount)}
            </span>
            <span className="text-[10px] text-slate-400">جهة</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 text-[10px] dark:border-slate-800">
            <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {formatNumberDisplay(stats.activeCount)} نشط
            </span>
            {stats.blockedCount > 0 && (
              <>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  {formatNumberDisplay(stats.blockedCount)} محظور
                </span>
              </>
            )}
            {(stats.mixedCurrencyCount ?? 0) > 0 && (
              <>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                  <AlertTriangle size={10} />
                  {formatNumberDisplay(stats.mixedCurrencyCount ?? 0)} متعاكس العملات
                </span>
              </>
            )}
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
            'group relative overflow-hidden rounded-xl border bg-emerald-50/40 p-3.5 shadow-sm transition-all dark:bg-emerald-950/20',
            onFilterChange && 'cursor-pointer hover:shadow-md',
            activeFilter === 'debtors'
              ? 'border-emerald-500 ring-2 ring-emerald-500/20 dark:border-emerald-400'
              : 'border-emerald-200/60 hover:border-emerald-300 dark:border-emerald-900/40'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
              {type === 'customer'
                ? 'مستحقات لنا (مدين)'
                : type === 'employee'
                  ? 'سلف مستردة (لنا)'
                  : 'دفعات مقدمة للموردين'}
              {focusedCurrencyStat ? ` (${displayCurrency})` : ' (معادل SAR)'}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
              <TrendingUp size={15} />
            </div>
          </div>
          <div className="mt-2">
            <span
              dir="ltr"
              className="font-mono text-xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300"
            >
              {formatCurrency(totalRec, displayCurrency)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1 border-t border-emerald-100/80 pt-2 text-[10px] text-emerald-700/80 dark:border-emerald-900/40 dark:text-emerald-400">
            <span>
              {focusedCurrencyStat
                ? `إجمالي المستحق لنا بعملة ${displayCurrency} فقط`
                : type === 'supplier'
                  ? 'صافي دفعات مقدمة دفعناها للموردين'
                  : 'صافي ذمم مستحقة لنا مقوّمة بعملة الأساس'}
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
            'group relative overflow-hidden rounded-xl border bg-amber-50/40 p-3.5 shadow-sm transition-all dark:bg-amber-950/20',
            onFilterChange && 'cursor-pointer hover:shadow-md',
            activeFilter === 'creditors'
              ? 'border-amber-500 ring-2 ring-amber-500/20 dark:border-amber-400'
              : 'border-amber-200/60 hover:border-amber-300 dark:border-amber-900/40'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
              {type === 'customer'
                ? 'أمانات / دفعات مقدمة (دائن)'
                : type === 'employee'
                  ? 'رواتب ومستحقات الموظفين (دائن)'
                  : 'مستحقات علينا للموردين'}
              {focusedCurrencyStat ? ` (${displayCurrency})` : ' (معادل SAR)'}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              <TrendingDown size={15} />
            </div>
          </div>
          <div className="mt-2">
            <span
              dir="ltr"
              className="font-mono text-xl font-bold tracking-tight text-amber-700 dark:text-amber-300"
            >
              {formatCurrency(totalPay, displayCurrency)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1 border-t border-amber-100/80 pt-2 text-[10px] text-amber-700/80 dark:border-amber-900/40 dark:text-amber-400">
            <span>
              {focusedCurrencyStat
                ? `إجمالي الأرصدة الدائنة بعملة ${displayCurrency} فقط`
                : type === 'supplier'
                  ? 'صافي المستحق سداده للموردين بعد السندات والمرتجعات'
                  : 'صافي التزامات أو أرصدة دائنة مقوّمة بعملة الأساس'}
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
            'group relative overflow-hidden rounded-xl border bg-white p-3.5 shadow-sm transition-all dark:bg-slate-900',
            onFilterChange && 'cursor-pointer hover:shadow-md',
            activeFilter === 'all' && !isFiltered
              ? 'border-indigo-500 ring-2 ring-indigo-500/20 dark:border-indigo-400'
              : 'border-slate-200/80 hover:border-slate-300 dark:border-slate-800'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              {focusedCurrencyStat
                ? `صافي رصيد (${displayCurrency})`
                : 'صافي المعادل الإجمالي (SAR)'}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
              <Wallet size={15} />
            </div>
          </div>
          <div className="mt-2">
            <span
              dir="ltr"
              className={cn(
                'font-mono text-xl font-bold tracking-tight',
                totalNet >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              )}
            >
              {formatCurrency(totalNet, displayCurrency)}
            </span>
          </div>
          {!focusedCurrencyStat && stats.byCurrency && stats.byCurrency.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
              {stats.byCurrency.slice(0, 3).map(c => (
                <span
                  key={c.currency}
                  dir="ltr"
                  className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {formatCurrency(c.balance, c.currency)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PartiesStats;
