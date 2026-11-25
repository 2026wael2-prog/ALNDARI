/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/explicit-function-return-type, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing */
import React from 'react';
import { Calendar, RotateCcw } from 'lucide-react';
import type { DatePreset } from '../../../core/types/invoiceSearch';
import { getDateRangeForPreset } from '../../../core/utils/dateUtils';
import type { BondSortBy, BondSortOrder } from '../hooks/useBondsFilter';

export const BOND_DATE_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: 'this_year', label: 'الفترة الحالية' },
  { id: 'today', label: 'اليوم' },
  { id: 'this_week', label: 'آخر 7 أيام' },
  { id: 'this_month', label: 'هذا الشهر' },
  { id: 'last_month', label: 'الشهر الماضي' },
  { id: 'all', label: 'كل الفترات' },
  { id: 'custom', label: 'مخصص' },
];

interface BondsToolbarProps {
  datePreset: DatePreset;
  setDatePreset: (preset: DatePreset) => void;
  dateFrom: string | undefined;
  setDateFrom: (date?: string) => void;
  dateTo: string | undefined;
  setDateTo: (date?: string) => void;
  currencyFilter: string;
  setCurrencyFilter: (currency: string) => void;
  sortBy: BondSortBy;
  setSortBy: (sortBy: BondSortBy) => void;
  sortOrder: BondSortOrder;
  setSortOrder: (order: BondSortOrder) => void;
  displayedCount: number;
  totalServerCount?: number;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}

export const BondsToolbar: React.FC<BondsToolbarProps> = ({
  datePreset,
  setDatePreset,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  currencyFilter,
  setCurrencyFilter,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  displayedCount,
  totalServerCount,
  hasActiveFilters,
  onResetFilters,
}) => {
  return (
    <div className="mb-2 flex flex-col gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-1.5 shadow-xs sm:mb-3 sm:gap-2 sm:rounded-xl sm:p-2.5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
        {/* Date Presets Pills */}
        <div className="no-scrollbar flex w-full flex-nowrap items-center gap-1 overflow-x-auto sm:w-auto sm:flex-wrap">
          <span className="hidden shrink-0 items-center gap-1 text-[11px] font-bold text-[var(--app-text-secondary)] sm:flex">
            <Calendar size={12} />
            <span>الفترة:</span>
          </span>
          {BOND_DATE_PRESETS.map(preset => {
            const isActive = datePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setDatePreset(preset.id);
                  const range = getDateRangeForPreset(preset.id);
                  setDateFrom(range.from);
                  setDateTo(range.to);
                }}
                className={`shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-all sm:px-2 sm:py-1 sm:text-[11px] ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-[var(--app-bg)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Currency, Sort & Counter in 1 Compact Row */}
        <div className="grid grid-cols-3 items-center gap-1 sm:flex sm:flex-wrap sm:gap-2">
          {/* Currency Filter */}
          <select
            value={currencyFilter}
            onChange={e => setCurrencyFilter(e.target.value)}
            aria-label="تصفية حسب العملة"
            className="focus:outline-hidden h-7 min-w-0 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-1.5 text-[10px] font-bold text-[var(--app-text)] focus:border-blue-500 sm:h-8 sm:rounded-lg sm:px-2 sm:text-xs"
          >
            <option value="all">العملة</option>
            <option value="SAR">ر.س (SAR)</option>
            <option value="YER">ر.ي (YER)</option>
            <option value="USD">دولار (USD)</option>
            <option value="OMR">عماني (OMR)</option>
            <option value="CNY">يوان (CNY)</option>
          </select>

          {/* Sort Selector */}
          <select
            value={`${sortBy}_${sortOrder}`}
            onChange={e => {
              const [by, order] = e.target.value.split('_');
              setSortBy(by as BondSortBy);
              setSortOrder(order as BondSortOrder);
            }}
            aria-label="ترتيب وفرز السندات"
            className="focus:outline-hidden h-7 min-w-0 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-1.5 text-[10px] font-bold text-[var(--app-text)] focus:border-blue-500 sm:h-8 sm:rounded-lg sm:px-2 sm:text-xs"
          >
            <option value="date_desc">الأحدث</option>
            <option value="date_asc">الأقدم</option>
            <option value="amount_desc">الأعلى مبلغاً</option>
            <option value="amount_asc">الأقل مبلغاً</option>
            <option value="number_desc">رقم (تنازلي)</option>
            <option value="number_asc">رقم (تصاعدي)</option>
          </select>

          {/* Counter & Reset */}
          <div className="flex items-center justify-end gap-1">
            <span className="truncate rounded-full bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 sm:px-2 sm:text-[11px]">
              {totalServerCount && totalServerCount > displayedCount
                ? `${displayedCount}/${totalServerCount}`
                : `${displayedCount} سند`}
            </span>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="flex h-7 items-center gap-1 rounded-md border border-rose-200 bg-rose-50/50 px-1.5 text-[10px] font-bold text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400 sm:h-8 sm:rounded-lg sm:px-2 sm:text-xs"
                title="مسح الفلاتر"
              >
                <RotateCcw size={11} />
                <span className="hidden sm:inline">مسح</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Custom Date Range Row */}
      {datePreset === 'custom' && (
        <div className="border-[var(--app-border)]/60 flex flex-wrap items-center gap-2 border-t pt-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-bold text-[var(--app-text-secondary)]">من تاريخ:</label>
            <input
              type="date"
              value={dateFrom || ''}
              onChange={e => setDateFrom(e.target.value)}
              className="h-8 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 text-xs font-bold text-[var(--app-text)]"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-bold text-[var(--app-text-secondary)]">إلى تاريخ:</label>
            <input
              type="date"
              value={dateTo || ''}
              onChange={e => setDateTo(e.target.value)}
              className="h-8 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 text-xs font-bold text-[var(--app-text)]"
            />
          </div>
        </div>
      )}
    </div>
  );
};
