import React from 'react';
import { Search, RotateCcw, Calendar, Download, Printer, Clock, GitBranch } from 'lucide-react';
import { getBiDateRangeForPreset, type BiDatePreset } from '@/core/utils/dateUtils';
import { cn } from '@/core/utils';
import { useBranches } from '@/features/settings/hooks';

export interface BiFilterBarProps {
  searchTerm?: string | undefined;
  onSearchChange?: ((search: string) => void) | undefined;
  datePreset: BiDatePreset;
  onPresetChange: (preset: BiDatePreset, range: { from?: string | undefined; to?: string | undefined }) => void;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  onDateRangeChange?: (from?: string | undefined, to?: string | undefined) => void;
  branchId?: string | null | undefined;
  onBranchChange?: ((branchId: string | null) => void) | undefined;
  metric?: string;
  onMetricChange?: (metric: string) => void;
  metricOptions?: Array<{ id: string; label: string }>;
  segment?: string;
  onSegmentChange?: (segment: string) => void;
  segmentOptions?: Array<{ id: string; label: string }>;
  onRefresh?: () => void;
  onExportExcel?: () => void;
  onExportPdf?: () => void;
  lastUpdatedAt?: number | undefined;
  isLoading?: boolean;
}

const PRESET_OPTIONS: Array<{ id: BiDatePreset; label: string }> = [
  { id: 'today', label: 'اليوم' },
  { id: 'yesterday', label: 'أمس' },
  { id: 'this_week', label: 'هذا الأسبوع' },
  { id: 'last_week', label: 'الأسبوع السابق' },
  { id: 'this_month', label: 'هذا الشهر' },
  { id: 'last_month', label: 'الشهر السابق' },
  { id: 'last_3_months', label: 'آخر 3 أشهر' },
  { id: 'this_year', label: 'هذا العام' },
  { id: 'last_year', label: 'العام السابق' },
  { id: 'all', label: 'كل الفترات' },
];

export const BiFilterBar: React.FC<BiFilterBarProps> = ({
  searchTerm,
  onSearchChange,
  datePreset,
  onPresetChange,
  dateFrom,
  dateTo,
  onDateRangeChange,
  branchId,
  onBranchChange,
  metric,
  onMetricChange,
  metricOptions,
  segment,
  onSegmentChange,
  segmentOptions,
  onRefresh,
  onExportExcel,
  onExportPdf,
  lastUpdatedAt,
  isLoading = false,
}) => {
  const { data: branches = [] } = useBranches();
  const formattedUpdated =
    lastUpdatedAt && lastUpdatedAt > 0
      ? new Date(lastUpdatedAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
      : null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:gap-2 sm:rounded-2xl sm:p-3">
      {/* Top Row: Scrollable Presets & Compact Controls */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
        {/* Presets Chips & Custom Dates */}
        <div className="no-scrollbar flex flex-nowrap items-center gap-1 overflow-x-auto sm:flex-wrap sm:gap-1.5">
          {PRESET_OPTIONS.map(p => {
            const isActive = datePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  const range = getBiDateRangeForPreset(p.id);
                  onPresetChange(p.id, range);
                }}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold transition-all sm:rounded-xl sm:px-2.5 sm:py-1 sm:text-[11px]',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                )}
              >
                {p.label}
              </button>
            );
          })}

          {onDateRangeChange && (
            <div className="hidden shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-800 sm:flex">
              <Calendar size={11} className="text-slate-400" />
              <input
                type="date"
                value={dateFrom ?? ''}
                onChange={e => onDateRangeChange(e.target.value || undefined, dateTo)}
                className="bg-transparent font-mono text-[10px] text-slate-700 focus:outline-none dark:text-slate-200"
                title="من تاريخ"
              />
              <span className="text-slate-400">←</span>
              <input
                type="date"
                value={dateTo ?? ''}
                onChange={e => onDateRangeChange(dateFrom, e.target.value || undefined)}
                className="bg-transparent font-mono text-[10px] text-slate-700 focus:outline-none dark:text-slate-200"
                title="إلى تاريخ"
              />
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-1 sm:gap-1.5">
          {formattedUpdated && (
            <span className="hidden items-center gap-1 text-[10px] font-bold text-slate-400 sm:flex">
              <Clock size={11} />
              <span>آخر تحديث: {formattedUpdated}</span>
            </span>
          )}

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              title="تحديث البيانات"
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:rounded-xl sm:px-2.5 sm:text-[11px]"
            >
              <RotateCcw size={11} className={cn(isLoading && 'animate-spin text-blue-600')} />
              <span>تحديث</span>
            </button>
          )}

          {onExportPdf && (
            <button
              type="button"
              onClick={onExportPdf}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:rounded-xl sm:px-2.5 sm:text-[11px]"
            >
              <Printer size={11} />
              <span>PDF</span>
            </button>
          )}

          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white shadow-sm transition-all hover:bg-emerald-700 sm:rounded-xl sm:px-2.5 sm:text-[11px]"
            >
              <Download size={11} />
              <span>Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom Row: Search & Compact Sub-filters */}
      {(onSearchChange ||
        onBranchChange ||
        (metricOptions && metricOptions.length > 0 && onMetricChange) ||
        (segmentOptions && segmentOptions.length > 0 && onSegmentChange)) && (
        <div className="grid grid-cols-3 items-center gap-1 border-t border-slate-100 pt-1 dark:border-slate-800/60 sm:flex sm:flex-wrap sm:gap-2">
          {/* Search Input */}
          {onSearchChange && (
            <div className="relative col-span-3 sm:min-w-[200px] sm:flex-1">
              <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 sm:right-3" />
              <input
                type="text"
                value={searchTerm ?? ''}
                onChange={e => onSearchChange(e.target.value)}
                placeholder="البحث بالاسم، الهاتف، أو الرمز..."
                className="h-7 w-full rounded-lg border border-slate-200 bg-slate-50 pl-2 pr-8 text-[11px] font-medium text-slate-800 placeholder-slate-400 transition-all focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 sm:h-8 sm:rounded-xl sm:pr-9 sm:text-xs"
              />
            </div>
          )}

        {/* Branch Selector if provided */}
        {onBranchChange && branches.length > 0 && (
          <div className="flex min-w-0 items-center gap-1">
            <GitBranch size={11} className="hidden shrink-0 text-slate-400 sm:inline" />
            <span className="hidden text-[10px] font-bold text-slate-400 sm:inline">الفرع:</span>
            <select
              value={branchId ?? ''}
              onChange={e => onBranchChange(e.target.value || null)}
              className="h-7 w-full min-w-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-bold text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:h-8 sm:w-auto sm:rounded-xl sm:px-2 sm:text-xs"
            >
              <option value="">كل الفروع</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Metric Selector if provided */}
        {metricOptions && metricOptions.length > 0 && onMetricChange && (
          <div className="flex min-w-0 items-center gap-1">
            <span className="hidden text-[10px] font-bold text-slate-400 sm:inline">الترتيب:</span>
            <select
              value={metric}
              onChange={e => onMetricChange(e.target.value)}
              className="h-7 w-full min-w-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-bold text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:h-8 sm:w-auto sm:rounded-xl sm:px-2 sm:text-xs"
            >
              {metricOptions.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Segment Selector if provided */}
        {segmentOptions && segmentOptions.length > 0 && onSegmentChange && (
          <div className="flex min-w-0 items-center gap-1">
            <span className="hidden text-[10px] font-bold text-slate-400 sm:inline">الشريحة:</span>
            <select
              value={segment}
              onChange={e => onSegmentChange(e.target.value)}
              className="h-7 w-full min-w-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-bold text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:h-8 sm:w-auto sm:rounded-xl sm:px-2 sm:text-xs"
            >
              {segmentOptions.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
        </div>
      )}
    </div>
  );
};
