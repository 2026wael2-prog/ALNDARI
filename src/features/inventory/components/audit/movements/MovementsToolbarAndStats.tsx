import React from 'react';
import { Download, Layers, RefreshCw, Search } from 'lucide-react';
import { cn, formatNumberDisplay } from '../../../../../core/utils';
import type { MovementsStats } from './docTypeLabels';

export type MovementTypeFilter = 'all' | 'in' | 'out';

interface MovementsToolbarAndStatsProps {
  search: string;
  onSearchChange: (value: string) => void;
  movementType: MovementTypeFilter;
  onMovementTypeChange: (value: MovementTypeFilter) => void;
  docType: string;
  onDocTypeChange: (value: string) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  isRefreshing: boolean;
  canExport: boolean;
  onRefresh: () => void;
  onExport: () => void;
  stats: MovementsStats;
}

const MOVEMENT_TYPE_OPTIONS: {
  value: MovementTypeFilter;
  label: string;
  activeClass: string;
}[] = [
  { value: 'all', label: 'الكل', activeClass: 'bg-blue-600 text-white shadow-sm' },
  { value: 'in', label: '+ وارد', activeClass: 'bg-emerald-600 text-white shadow-sm' },
  { value: 'out', label: '- صادر', activeClass: 'bg-rose-600 text-white shadow-sm' },
];

/** Top toolbar with filters, refresh/export controls, and KPI summary cards for stock movements. */
export const MovementsToolbarAndStats: React.FC<MovementsToolbarAndStatsProps> = ({
  search,
  onSearchChange,
  movementType,
  onMovementTypeChange,
  docType,
  onDocTypeChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  isRefreshing,
  canExport,
  onRefresh,
  onExport,
  stats,
}) => {
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-[var(--app-surface)] p-2 shadow-sm dark:border-slate-800 sm:space-y-3 sm:rounded-2xl sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 sm:h-9 sm:w-9 sm:rounded-xl">
            <Layers size={15} className="sm:h-[18px] sm:w-[18px]" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xs font-black text-slate-900 dark:text-white sm:text-sm">
              سجل الحركات المخزنية المباشر
            </h2>
            <p className="hidden text-[11px] text-slate-500 dark:text-slate-400 sm:block">
              تدفق لحظي لكافة الحركات من فواتير بيع وشراء ومردودات ومناقلات وتسويات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:gap-1.5 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-xs"
            title="تحديث البيانات لحظياً"
          >
            <RefreshCw size={12} className={cn(isRefreshing && 'animate-spin text-blue-600')} />
            <span>تحديث</span>
          </button>

          <button
            onClick={onExport}
            disabled={!canExport}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:gap-1.5 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-xs"
            title="تصدير السجل إلى ملف Excel/CSV"
          >
            <Download size={12} />
            <span>تصدير</span>
          </button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="grid grid-cols-2 gap-1.5 sm:gap-2.5 lg:grid-cols-12">
        <div className="relative col-span-2 lg:col-span-5">
          <input
            type="text"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="بحث برقم الفاتورة، اسم الصنف، رقم القطعة..."
            className="h-7 w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-3 pr-8 text-[11px] font-bold text-slate-800 placeholder-slate-400 transition-all focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:h-9 sm:rounded-xl sm:pr-9 sm:text-xs"
          />
          <Search size={13} className="absolute right-2.5 top-2 text-slate-400 sm:right-3 sm:top-2.5" />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute left-2 top-1.5 rounded-md px-1 text-xs font-black text-slate-400 hover:text-slate-600 sm:left-2.5 sm:top-2"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 lg:col-span-3">
          {MOVEMENT_TYPE_OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => onMovementTypeChange(option.value)}
              className={cn(
                'h-7 flex-1 rounded-lg px-1.5 text-[10px] font-bold transition-all sm:h-9 sm:rounded-xl sm:px-2.5 sm:text-xs',
                movementType === option.value
                  ? option.activeClass
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="lg:col-span-2">
          <select
            value={docType}
            onChange={e => onDocTypeChange(e.target.value)}
            className="h-7 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2 text-[10px] font-bold text-slate-700 transition-all focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:h-9 sm:rounded-xl sm:px-3 sm:text-xs"
          >
            <option value="all">كل المستندات</option>
            <option value="sale">فواتير البيع</option>
            <option value="purchase">فواتير الشراء</option>
            <option value="sale_return">مردود مبيعات</option>
            <option value="purchase_return">مردود مشتريات</option>
            <option value="transfer">المناقلات</option>
            <option value="stock_audit">التسويات الجردية</option>
          </select>
        </div>

        <div className="col-span-2 flex items-center gap-1 lg:col-span-2">
          <input
            type="date"
            value={startDate}
            onChange={e => onStartDateChange(e.target.value)}
            className="h-7 w-1/2 rounded-lg border border-slate-200 bg-slate-50/70 px-1.5 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:h-9 sm:rounded-xl sm:px-2 sm:text-[11px]"
            title="من تاريخ"
          />
          <span className="text-slate-400">-</span>
          <input
            type="date"
            value={endDate}
            onChange={e => onEndDateChange(e.target.value)}
            className="h-7 w-1/2 rounded-lg border border-slate-200 bg-slate-50/70 px-1.5 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:h-9 sm:rounded-xl sm:px-2 sm:text-[11px]"
            title="إلى تاريخ"
          />
        </div>
      </div>

      {/* KPI Summary Cards — 4-per-row on mobile */}
      <div className="grid grid-cols-4 gap-1 pt-0.5 sm:gap-2 sm:pt-1">
        <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-1.5 dark:border-slate-800 dark:bg-slate-900/40 sm:rounded-xl sm:p-2.5">
          <span className="block truncate text-[10px] font-bold text-slate-400 sm:text-[10px]">العمليات</span>
          <span className="block truncate font-mono text-xs font-black text-slate-800 dark:text-slate-200 sm:text-sm">
            {formatNumberDisplay(stats.count)}
          </span>
        </div>

        <div className="min-w-0 rounded-lg border border-emerald-100 bg-emerald-50/50 p-1.5 dark:border-emerald-950/40 dark:bg-emerald-950/20 sm:rounded-xl sm:p-2.5">
          <span className="block truncate text-[10px] font-bold text-emerald-600 dark:text-emerald-400 sm:text-[10px]">
            الوارد (+)
          </span>
          <span className="block truncate font-mono text-xs font-black text-emerald-700 dark:text-emerald-300 sm:text-sm">
            +{formatNumberDisplay(stats.totalIn)}
          </span>
        </div>

        <div className="min-w-0 rounded-lg border border-rose-100 bg-rose-50/50 p-1.5 dark:border-rose-950/40 dark:bg-rose-950/20 sm:rounded-xl sm:p-2.5">
          <span className="block truncate text-[10px] font-bold text-rose-600 dark:text-rose-400 sm:text-[10px]">
            الصادر (-)
          </span>
          <span className="block truncate font-mono text-xs font-black text-rose-700 dark:text-rose-300 sm:text-sm">
            -{formatNumberDisplay(stats.totalOut)}
          </span>
        </div>

        <div className="min-w-0 rounded-lg border border-blue-100 bg-blue-50/50 p-1.5 dark:border-blue-950/40 dark:bg-blue-950/20 sm:rounded-xl sm:p-2.5">
          <span className="block truncate text-[10px] font-bold text-blue-600 dark:text-blue-400 sm:text-[10px]">
            الصافي
          </span>
          <span
            className={cn(
              'block truncate font-mono text-xs font-black sm:text-sm',
              stats.net >= 0 ? 'text-emerald-600' : 'text-rose-600'
            )}
          >
            {stats.net >= 0 ? '+' : ''}
            {formatNumberDisplay(stats.net)}
          </span>
        </div>
      </div>
    </div>
  );
};
