import React, { useId } from 'react';
import { Search, X, Calendar, RotateCcw, Package, User, Hash } from 'lucide-react';
import type { DatePreset } from '@/core/types/invoiceSearch';
import { getDateRangeForPreset } from '@/core/utils/dateUtils';

interface InvoiceSearchToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  placeholder?: string | undefined;
  datePreset: DatePreset;
  onDatePresetChange: (
    preset: DatePreset,
    range: { from?: string | undefined; to?: string | undefined }
  ) => void;
  dateFrom?: string | undefined;
  onDateFromChange?: ((val: string) => void) | undefined;
  dateTo?: string | undefined;
  onDateToChange?: ((val: string) => void) | undefined;
  statusFilter?: string | undefined;
  onStatusFilterChange?: ((status: string) => void) | undefined;
  paymentMethodFilter?: string | undefined;
  onPaymentMethodFilterChange?: ((method: string) => void) | undefined;
  currencyFilter?: string | undefined;
  onCurrencyFilterChange?: ((curr: string) => void) | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  onSortChange?: ((by: string, order: 'asc' | 'desc') => void) | undefined;
  totalMatches?: number | undefined;
  totalMatchingCount?: number | undefined;
  limit?: number | undefined;
  onLimitChange?: ((limit: number) => void) | undefined;
  isLoading?: boolean | undefined;
  onResetFilters: () => void;
  scopeLabel?: 'sales' | 'purchases' | undefined;
}

const PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: 'this_year', label: 'الفترة الحالية' },
  { id: 'today', label: 'اليوم' },
  { id: 'this_week', label: 'آخر 7 أيام' },
  { id: 'this_month', label: 'هذا الشهر' },
  { id: 'last_month', label: 'الشهر الماضي' },
  { id: 'last_3_months', label: 'آخر 3 أشهر' },
  { id: 'all', label: 'كل الفترات' },
  { id: 'custom', label: 'مخصص' },
];

export const InvoiceSearchToolbar: React.FC<InvoiceSearchToolbarProps> = ({
  searchTerm,
  onSearchChange,
  placeholder,
  datePreset,
  onDatePresetChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  statusFilter = 'all',
  onStatusFilterChange,
  paymentMethodFilter = 'all',
  onPaymentMethodFilterChange,
  currencyFilter = 'all',
  onCurrencyFilterChange,
  sortBy = 'date',
  sortOrder = 'desc',
  onSortChange,
  totalMatches,
  totalMatchingCount,
  limit,
  onLimitChange,
  isLoading = false,
  onResetFilters,
  scopeLabel = 'sales',
}) => {
  const inputId = useId();
  const dateFromId = useId();
  const dateToId = useId();

  const partyScope = scopeLabel === 'sales' ? 'العميل' : 'المورد';
  const defaultPlaceholder = `ابحث برقم الفاتورة، ${partyScope}، اسم القطعة، رقم القطعة (Part #)، أو الباركود...`;

  const hasActiveFilters = Boolean(
    (searchTerm && searchTerm.trim() !== '') ||
    datePreset !== 'all' ||
    dateFrom ||
    dateTo ||
    (statusFilter && statusFilter !== 'all') ||
    (paymentMethodFilter && paymentMethodFilter !== 'all') ||
    (currencyFilter && currencyFilter !== 'all') ||
    (sortBy && sortBy !== 'date') ||
    (sortOrder && sortOrder !== 'desc')
  );

  const handlePresetClick = (preset: DatePreset) => {
    const range = getDateRangeForPreset(preset);
    onDatePresetChange(preset, range);
  };

  return (
    <div className="mb-1.5 flex flex-col gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-1.5 shadow-xs sm:rounded-xl sm:p-2 md:mb-3 md:gap-2 md:p-2.5">
      {/* Row 1: Search Bar & Compact 4-Column Filter Row */}
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2">
        {/* Main Search Input + Inline Mobile Reset */}
        <div className="flex items-center gap-1 md:flex-1">
          <div className="relative flex-1">
            <label htmlFor={inputId} className="sr-only">
              بحث متقدم في الفواتير
            </label>
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2 text-[var(--app-text-secondary)] md:ps-3">
              <Search size={13} className={isLoading ? 'animate-spin text-blue-500' : ''} />
            </div>
            <input
              id={inputId}
              type="text"
              value={searchTerm}
              onChange={e => {
                onSearchChange(e.target.value);
              }}
              placeholder={placeholder || defaultPlaceholder}
              className="focus:outline-hidden h-7 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] pe-7 ps-7 text-[11px] font-semibold text-[var(--app-text)] placeholder:text-[var(--app-text-secondary)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:h-8 md:h-9 md:pe-9 md:ps-9 md:text-xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
                }}
                className="absolute inset-y-0 end-0 flex items-center pe-2 text-[var(--app-text-secondary)] hover:text-rose-500 md:pe-2.5"
                title="مسح البحث"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50/70 text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400 sm:hidden"
              title="مسح الفلاتر"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap sm:items-center md:gap-2">
        {/* Currency Filter */}
        {onCurrencyFilterChange && (
          <select
            value={currencyFilter}
            onChange={e => {
              onCurrencyFilterChange(e.target.value);
            }}
            aria-label="تصفية حسب العملة"
            className="focus:outline-hidden h-7 min-w-0 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-1 text-[10px] font-bold text-[var(--app-text)] focus:border-blue-500 sm:h-8 sm:rounded-lg sm:px-2 sm:text-[11px] md:h-9 md:px-2.5 md:text-xs"
          >
            <option value="all">العملة</option>
            <option value="SAR">ر.س (SAR)</option>
            <option value="YER">ر.ي (YER)</option>
            <option value="USD">دولار (USD)</option>
            <option value="OMR">عماني (OMR)</option>
            <option value="CNY">يوان (CNY)</option>
          </select>
        )}

        {/* Quick Filter: Payment Method */}
        {onPaymentMethodFilterChange && (
          <select
            value={paymentMethodFilter}
            onChange={e => {
              onPaymentMethodFilterChange(e.target.value);
            }}
            aria-label="تصفية حسب طريقة الدفع"
            className="focus:outline-hidden h-7 min-w-0 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-1 text-[10px] font-bold text-[var(--app-text)] focus:border-blue-500 sm:h-8 sm:rounded-lg sm:px-2 sm:text-[11px] md:h-9 md:px-2.5 md:text-xs"
          >
            <option value="all">الدفع</option>
            <option value="cash">نقدي</option>
            <option value="credit">آجل</option>
          </select>
        )}

        {/* Quick Filter: Status */}
        {onStatusFilterChange && (
          <select
            value={statusFilter}
            onChange={e => {
              onStatusFilterChange(e.target.value);
            }}
            aria-label="تصفية حسب حالة الفاتورة"
            className="focus:outline-hidden h-7 min-w-0 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-1 text-[10px] font-bold text-[var(--app-text)] focus:border-blue-500 sm:h-8 sm:rounded-lg sm:px-2 sm:text-[11px] md:h-9 md:px-2.5 md:text-xs"
          >
            <option value="all">الحالة</option>
            <option value="paid">مدفوعة</option>
            <option value="posted">مرحّلة</option>
            <option value="partially_paid">جزئياً</option>
            <option value="draft">مسودة</option>
          </select>
        )}

        {/* Sort Selector */}
        {onSortChange && (
          <select
            value={`${sortBy}_${sortOrder}`}
            onChange={e => {
              const [by, order] = e.target.value.split('_');
              onSortChange(by, order as 'asc' | 'desc');
            }}
            aria-label="ترتيب وفرز النتائج"
            className="focus:outline-hidden h-7 min-w-0 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-1 text-[10px] font-bold text-[var(--app-text)] focus:border-blue-500 sm:h-8 sm:rounded-lg sm:px-2 sm:text-[11px] md:h-9 md:px-2.5 md:text-xs"
          >
            <option value="date_desc">الأحدث</option>
            <option value="date_asc">الأقدم</option>
            <option value="total_desc">الأعلى مبلغاً</option>
            <option value="total_asc">الأقل مبلغاً</option>
            <option value="number_desc">رقم (تنازلي)</option>
            <option value="number_asc">رقم (تصاعدي)</option>
          </select>
        )}

        {/* Reset Button (Desktop/Tablet) */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="hidden h-8 items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50/50 px-2 text-[11px] font-bold text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400 sm:flex md:h-9 md:px-2.5 md:text-xs"
            title="إعادة تعيين كافة الفلاتر"
          >
            <RotateCcw size={12} />
            <span>مسح الفلاتر</span>
          </button>
        )}
        </div>
      </div>

      {/* Row 2: Date Presets & Search Scopes Bar */}
      <div className="border-[var(--app-border)]/60 flex items-center justify-between gap-1.5 border-t pt-1 sm:flex-wrap md:pt-2">
        {/* Date Presets Pills */}
        <div className="no-scrollbar flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto sm:flex-initial sm:flex-wrap">
          <span className="hidden shrink-0 items-center gap-1 text-[10px] font-bold text-[var(--app-text-secondary)] sm:flex sm:text-[11px]">
            <Calendar size={11} />
            <span>الفترة:</span>
          </span>
          {PRESETS.map(preset => {
            const isActive = datePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  handlePresetClick(preset.id);
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

        {/* Matches Indicator & Limit Selector */}
        <div className="flex shrink-0 items-center gap-1.5">
          {onLimitChange && (
            <div className="hidden items-center gap-1 text-[11px] font-bold text-[var(--app-text-secondary)] sm:flex">
              <span>عرض:</span>
              <select
                value={limit ?? 500}
                onChange={e => {
                  onLimitChange(Number(e.target.value));
                }}
                aria-label="عدد الفواتير المعروضة"
                className="focus:outline-hidden h-7 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--app-text)] focus:border-blue-500"
              >
                <option value={25}>25 / صفحة</option>
                <option value={50}>50 / صفحة</option>
                <option value={100}>100 / صفحة</option>
                <option value={250}>250 / صفحة</option>
                <option value={500}>500 / صفحة</option>
                <option value={1000}>1,000 / صفحة</option>
              </select>
            </div>
          )}

          {typeof totalMatches === 'number' && (
            <span className="whitespace-nowrap rounded-full bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 sm:px-2 sm:text-[11px]">
              {totalMatchingCount && totalMatchingCount > totalMatches
                ? `${totalMatches}/${totalMatchingCount}`
                : `${totalMatches} فاتورة`}
            </span>
          )}
        </div>
      </div>

      {/* Row 3: Custom Date Range (Shown only when datePreset is 'custom') */}
      {datePreset === 'custom' && (
        <div className="border-[var(--app-border)]/60 flex flex-wrap items-center gap-2 border-t pt-2">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor={dateFromId}
              className="text-xs font-bold text-[var(--app-text-secondary)]"
            >
              من تاريخ:
            </label>
            <input
              id={dateFromId}
              type="date"
              value={dateFrom || ''}
              onChange={e => onDateFromChange?.(e.target.value)}
              className="h-8 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 text-xs font-bold text-[var(--app-text)]"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label
              htmlFor={dateToId}
              className="text-xs font-bold text-[var(--app-text-secondary)]"
            >
              إلى تاريخ:
            </label>
            <input
              id={dateToId}
              type="date"
              value={dateTo || ''}
              onChange={e => onDateToChange?.(e.target.value)}
              className="h-8 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 text-xs font-bold text-[var(--app-text)]"
            />
          </div>
        </div>
      )}

      {/* Search Hints Helper (Desktop only to save mobile vertical space) */}
      <div className="hidden flex-wrap items-center gap-3 text-[10px] text-[var(--app-text-secondary)] md:flex">
        <span className="flex items-center gap-1">
          <Package size={11} className="text-emerald-500" />
          البحث في محتويات الأصناف والقطع وقطع الغيار
        </span>
        <span className="flex items-center gap-1">
          <Hash size={11} className="text-blue-500" />
          البحث برقم الفاتورة
        </span>
        <span className="flex items-center gap-1">
          <User size={11} className="text-purple-500" />
          البحث باسم {partyScope} أو رقم الهاتف
        </span>
      </div>
    </div>
  );
};

export default InvoiceSearchToolbar;
