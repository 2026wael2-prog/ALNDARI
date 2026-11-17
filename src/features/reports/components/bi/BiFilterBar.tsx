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
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Top Row: Presets & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Presets Chips & Custom Dates */}
        <div className="flex flex-wrap items-center gap-1.5">
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
                  'rounded-xl px-2.5 py-1 text-[11px] font-bold transition-all',
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
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-800">
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
        <div className="flex items-center gap-1.5">
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
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RotateCcw size={12} className={cn(isLoading && 'animate-spin text-blue-600')} />
              <span>تحديث</span>
            </button>
          )}

          {onExportPdf && (
            <button
              type="button"
              onClick={onExportPdf}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Printer size={12} />
              <span>طباعة / PDF</span>
            </button>
          )}

          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              className="flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm transition-all hover:bg-emerald-700"
            >
              <Download size={12} />
              <span>تصدير Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom Row: Search & Sub-filters */}
      {(onSearchChange ||
        onBranchChange ||
        (metricOptions && metricOptions.length > 0 && onMetricChange) ||
        (segmentOptions && segmentOptions.length > 0 && onSegmentChange)) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-1 dark:border-slate-800/60">
          {/* Search Input */}
          {onSearchChange && (
            <div className="relative min-w-[200px] flex-1">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm ?? ''}
                onChange={e => onSearchChange(e.target.value)}
                placeholder="البحث بالاسم، الهاتف، أو الرمز..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-3 pr-9 text-xs font-medium text-slate-800 placeholder-slate-400 transition-all focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
              />
            </div>
          )}

        {/* Branch Selector if provided */}
        {onBranchChange && branches.length > 0 && (
          <div className="flex items-center gap-1">
            <GitBranch size={12} className="text-slate-400" />
            <span className="text-[10px] font-bold text-slate-400">الفرع:</span>
            <select
              value={branchId ?? ''}
              onChange={e => onBranchChange(e.target.value || null)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
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
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-400">الترتيب حسب:</span>
            <select
              value={metric}
              onChange={e => onMetricChange(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
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
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-400">الشريحة:</span>
            <select
              value={segment}
              onChange={e => onSegmentChange(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
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
