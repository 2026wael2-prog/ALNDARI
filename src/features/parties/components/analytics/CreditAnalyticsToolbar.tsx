import type React from 'react';
import { Coins, Download, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { cn } from '@/core/utils';
import type { QuickCreditFilter } from '../../utils/creditScoring';

export interface CreditFilterCounts {
  all: number;
  overLimit: number;
  overdue60: number;
  highRisk: number;
  champions: number;
  hasPromise: number;
  blocked: number;
}

interface CreditAnalyticsToolbarProps {
  currency: 'SAR' | 'YER';
  onCurrencyChange: (c: 'SAR' | 'YER') => void;
  periodDays: number;
  onPeriodChange: (days: number) => void;
  quickFilter: QuickCreditFilter;
  onQuickFilterChange: (f: QuickCreditFilter) => void;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  counts: CreditFilterCounts;
  isFetching: boolean;
  onRefresh: () => void;
  onExportExcel: () => void;
}

const PERIOD_OPTIONS = [
  { days: 30, label: '30 يوماً' },
  { days: 90, label: '90 يوماً' },
  { days: 180, label: '6 أشهر' },
  { days: 365, label: 'سنة' },
] as const;

const ACTIVE_CHIP_CLS = new Map<string, string>([
  ['rose', 'bg-rose-600 text-white shadow-2xs'],
  ['emerald', 'bg-emerald-600 text-white shadow-2xs'],
  ['amber', 'bg-amber-600 text-white shadow-2xs'],
  ['blue', 'bg-blue-600 text-white shadow-2xs'],
]);

const CurrencyAndPeriodGroup: React.FC<{
  currency: 'SAR' | 'YER';
  onCurrencyChange: (c: 'SAR' | 'YER') => void;
  periodDays: number;
  onPeriodChange: (days: number) => void;
}> = ({ currency, onCurrencyChange, periodDays, onPeriodChange }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
      <Coins size={13} className="mr-1 text-amber-600" />
      {(['SAR', 'YER'] as const).map(curr => (
        <button
          key={curr}
          type="button"
          onClick={() => {
            onCurrencyChange(curr);
          }}
          className={cn(
            'rounded-md px-2.5 py-1 text-[11px] font-black transition-all',
            currency === curr
              ? curr === 'YER'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-emerald-700 text-white shadow-xs'
              : 'text-black/80 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'
          )}
        >
          {curr === 'SAR' ? 'ريال سعودي (SAR)' : 'ريال يمني (YER)'}
        </button>
      ))}
    </div>
    <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
      {PERIOD_OPTIONS.map(opt => (
        <button
          key={opt.days}
          type="button"
          onClick={() => {
            onPeriodChange(opt.days);
          }}
          className={cn(
            'rounded px-2 py-0.5 text-[10.5px] font-bold transition-colors',
            periodDays === opt.days
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-black/75 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

const SearchAndActionsGroup: React.FC<{
  searchTerm: string;
  onSearchChange: (val: string) => void;
  isFetching: boolean;
  onRefresh: () => void;
  onExportExcel: () => void;
}> = ({ searchTerm, onSearchChange, isFetching, onRefresh, onExportExcel }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <div className="relative">
      <Search
        size={13}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        type="text"
        value={searchTerm}
        onChange={e => {
          onSearchChange(e.target.value);
        }}
        placeholder="بحث باسم العميل أو الهاتف..."
        className="w-48 rounded-lg border border-slate-300 bg-white py-1 pl-2 pr-8 text-xs font-bold text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:w-56"
      />
    </div>
    <button
      type="button"
      onClick={onRefresh}
      disabled={isFetching}
      title="تحديث بيانات الائتمان الآن"
      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-black transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
    >
      <RefreshCw size={13} className={cn(isFetching && 'animate-spin')} />
      <span className="hidden sm:inline">تحديث</span>
    </button>
    <button
      type="button"
      onClick={onExportExcel}
      className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-black text-white shadow-xs transition-colors hover:bg-emerald-800"
    >
      <Download size={13} />
      <span>تصدير Excel</span>
    </button>
  </div>
);

const QuickFilterStrip: React.FC<{
  quickFilter: QuickCreditFilter;
  onQuickFilterChange: (f: QuickCreditFilter) => void;
  counts: CreditFilterCounts;
}> = ({ quickFilter, onQuickFilterChange, counts }) => {
  const chips: Array<{ id: QuickCreditFilter; label: string; count: number; tone: string }> = [
    { id: 'all', label: 'الكل', count: counts.all, tone: 'blue' },
    { id: 'over_limit', label: 'تجاوز السقف', count: counts.overLimit, tone: 'rose' },
    { id: 'overdue_60', label: 'متأخر +60 يوماً', count: counts.overdue60, tone: 'rose' },
    { id: 'high_risk', label: 'مخاطر C–F', count: counts.highRisk, tone: 'amber' },
    { id: 'champions', label: 'أبطال A+', count: counts.champions, tone: 'emerald' },
    { id: 'has_promise', label: 'وعد سداد', count: counts.hasPromise, tone: 'blue' },
    { id: 'blocked', label: 'مجمد ائتمانياً', count: counts.blocked, tone: 'blue' },
  ];
  return (
    <div className="no-scrollbar flex items-center gap-1 overflow-x-auto border-t border-slate-100 pt-1.5 dark:border-slate-800">
      <ShieldCheck size={13} className="shrink-0 text-blue-600" />
      {chips.map(chip => {
        const active = quickFilter === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => {
              onQuickFilterChange(chip.id);
            }}
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-black transition-all',
              active
                ? (ACTIVE_CHIP_CLS.get(chip.tone) ?? 'bg-blue-600 text-white')
                : 'bg-slate-100 text-black hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            )}
          >
            <span>{chip.label}</span>
            <span
              className={cn(
                'rounded-full px-1.5 font-mono text-[9.5px]',
                active ? 'bg-white/25 text-white' : 'bg-white text-black dark:bg-slate-900 dark:text-slate-200'
              )}
            >
              {chip.count}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const CreditAnalyticsToolbar: React.FC<CreditAnalyticsToolbarProps> = props => (
  <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200/90 bg-white p-2 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <CurrencyAndPeriodGroup
        currency={props.currency}
        onCurrencyChange={props.onCurrencyChange}
        periodDays={props.periodDays}
        onPeriodChange={props.onPeriodChange}
      />
      <SearchAndActionsGroup
        searchTerm={props.searchTerm}
        onSearchChange={props.onSearchChange}
        isFetching={props.isFetching}
        onRefresh={props.onRefresh}
        onExportExcel={props.onExportExcel}
      />
    </div>
    <QuickFilterStrip
      quickFilter={props.quickFilter}
      onQuickFilterChange={props.onQuickFilterChange}
      counts={props.counts}
    />
  </div>
);
