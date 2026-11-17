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
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-[var(--app-surface)] p-4 shadow-sm dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <Layers size={18} />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              سجل الحركات المخزنية المباشر (Stock Movements Log)
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              تدفق لحظي لكافة الحركات من فواتير بيع وشراء ومردودات ومناقلات وتسويات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            title="تحديث البيانات لحظياً"
          >
            <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin text-blue-600')} />
            <span>تحديث</span>
          </button>

          <button
            onClick={onExport}
            disabled={!canExport}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            title="تصدير السجل إلى ملف Excel/CSV"
          >
            <Download size={13} />
            <span>تصدير</span>
          </button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
        <div className="relative sm:col-span-2 lg:col-span-5">
          <input
            type="text"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="بحث برقم الفاتورة، اسم الصنف، رقم القطعة، الماركة، أو الطرف..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pr-9 pl-3 text-xs font-bold text-slate-800 placeholder-slate-400 transition-all focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <Search size={14} className="absolute top-2.5 right-3 text-slate-400" />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute top-2 left-2.5 rounded-md px-1.5 text-xs font-black text-slate-400 hover:text-slate-600"
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
                'flex-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all',
                movementType === option.value
                  ? option.activeClass
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="sm:col-span-1 lg:col-span-2">
          <select
            value={docType}
            onChange={e => onDocTypeChange(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs font-bold text-slate-700 transition-all focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
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

        <div className="flex items-center gap-1.5 sm:col-span-2 lg:col-span-2">
          <input
            type="date"
            value={startDate}
            onChange={e => onStartDateChange(e.target.value)}
            className="w-1/2 rounded-xl border border-slate-200 bg-slate-50/70 px-2 py-1.5 font-mono text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            title="من تاريخ"
          />
          <span className="text-slate-400">-</span>
          <input
            type="date"
            value={endDate}
            onChange={e => onEndDateChange(e.target.value)}
            className="w-1/2 rounded-xl border border-slate-200 bg-slate-50/70 px-2 py-1.5 font-mono text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            title="إلى تاريخ"
          />
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
          <span className="block text-[10px] font-bold text-slate-400">عدد العمليات</span>
          <span className="font-mono text-sm font-black text-slate-800 dark:text-slate-200">
            {formatNumberDisplay(stats.count)} حركة
          </span>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5 dark:border-emerald-950/40 dark:bg-emerald-950/20">
          <span className="block text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            إجمالي الوارد (+)
          </span>
          <span className="font-mono text-sm font-black text-emerald-700 dark:text-emerald-300">
            +{formatNumberDisplay(stats.totalIn)}
          </span>
        </div>

        <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-2.5 dark:border-rose-950/40 dark:bg-rose-950/20">
          <span className="block text-[10px] font-bold text-rose-600 dark:text-rose-400">
            إجمالي الصادر (-)
          </span>
          <span className="font-mono text-sm font-black text-rose-700 dark:text-rose-300">
            -{formatNumberDisplay(stats.totalOut)}
          </span>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-2.5 dark:border-blue-950/40 dark:bg-blue-950/20">
          <span className="block text-[10px] font-bold text-blue-600 dark:text-blue-400">
            صافي الحركة
          </span>
          <span
            className={cn(
              'font-mono text-sm font-black',
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
